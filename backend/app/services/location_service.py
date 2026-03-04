"""
Location Service — Multi-provider race system for facility map pins.

Replaces the Overpass-based fetch_facility_locations / iter_facility_locations_sse
with three commercial / open providers that are raced in parallel:

  Provider 1 — Mapbox Search Box API  (MAPBOX_TOKEN)
  Provider 2 — LocationIQ Nearby API  (LOCATIONIQ_KEY)
  Provider 3 — Geoapify Places API    (GEOAPIFY_KEY)

Race strategy (per category)
----------------------------
  • All 3 providers are queried simultaneously via asyncio.create_task.
  • asyncio.wait(FIRST_COMPLETED) picks the first valid response.
  • Remaining tasks are cancelled immediately.
  • If all providers fail / are unconfigured, an empty list is returned.

Output format (identical to overpass_service.py)
------------------------------------------------
  fetch_facility_locations → {
      "hospitals": [{"lat": float, "lon": float, "name": str|None, "type": str}],
      "schools":   [...],
      ...
  }

  iter_facility_locations_sse → async generator yielding
      {"category": str, "locations": [...]}  one dict per category

Performance tip — batch Geoapify
---------------------------------
Geoapify supports comma-separated categories in a single request, making it
possible to fetch ALL 13 categories in one HTTP call and then split the results.
This fallback batch mode is used when individual races time out.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import AsyncIterator, Dict, List, Optional

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# ── API keys ───────────────────────────────────────────────────────────────────
MAPBOX_TOKEN   = settings.MAPBOX_TOKEN   or ""
LOCATIONIQ_KEY = settings.LOCATIONIQ_KEY or ""
GEOAPIFY_KEY   = settings.GEOAPIFY_KEY   or ""

RACE_TIMEOUT = 8.0    # seconds per provider request
FIXED_RADIUS = 2000   # metres

ALL_CATEGORIES: list[str] = [
    "hospitals", "schools", "police", "fire_stations", "parks",
    "bus_stops", "metro_stations", "train_stations",
    "supermarkets", "restaurants", "cafes", "gyms", "bars",
]

# ── Category mappings ──────────────────────────────────────────────────────────

# Mapbox Search Box v1 — category slugs
_MAPBOX_CAT: dict[str, str] = {
    "hospitals":      "hospital",
    "schools":        "school",
    "police":         "police",
    "fire_stations":  "fire_station",
    "parks":          "park",
    "bus_stops":      "bus_stop",
    "metro_stations": "train_station",          # Mapbox doesn't separate metro/rail
    "train_stations": "train_station",
    "supermarkets":   "supermarket",
    "restaurants":    "fast_food_restaurant,sit_down_restaurant",
    "cafes":          "coffee_shop",
    "gyms":           "gym",
    "bars":           "bar",
}

# LocationIQ — OSM key:value tags for /nearby endpoint
_LOCATIONIQ_TAG: dict[str, str] = {
    "hospitals":      "amenity:hospital",
    "schools":        "amenity:school",
    "police":         "amenity:police",
    "fire_stations":  "amenity:fire_station",
    "parks":          "leisure:park",
    "bus_stops":      "highway:bus_stop",
    "metro_stations": "station:subway",
    "train_stations": "railway:station",
    "supermarkets":   "shop:supermarket",
    "restaurants":    "amenity:restaurant",
    "cafes":          "amenity:cafe",
    "gyms":           "leisure:fitness_centre",
    "bars":           "amenity:bar",
}

# Geoapify Places API — category identifiers
_GEOAPIFY_CAT: dict[str, str] = {
    "hospitals":      "healthcare.hospital,healthcare.clinic_or_praxis",
    "schools":        "education.school",
    "police":         "service.police",
    "fire_stations":  "service.fire_station",
    "parks":          "leisure.park",
    "bus_stops":      "public_transport.bus",
    "metro_stations": "public_transport.subway",
    "train_stations": "public_transport.train",
    "supermarkets":   "commercial.supermarket",
    "restaurants":    "catering.restaurant,catering.fast_food",
    "cafes":          "catering.cafe",
    "gyms":           "sport.fitness",
    "bars":           "catering.bar,catering.pub",
}


# ── URL builders ───────────────────────────────────────────────────────────────

def _mapbox_url(category: str, lat: float, lon: float, radius: int) -> str | None:
    """Build Mapbox Search Box v1 category URL. Returns None if key not set."""
    if not MAPBOX_TOKEN:
        return None
    cat = _MAPBOX_CAT.get(category, category)
    return (
        f"https://api.mapbox.com/search/searchbox/v1/category/{cat}"
        f"?proximity={lon},{lat}&radius={radius}"
        f"&limit=50&access_token={MAPBOX_TOKEN}"
    )


def _locationiq_url(category: str, lat: float, lon: float, radius: int) -> str | None:
    """Build LocationIQ nearby endpoint URL. Returns None if key not set."""
    if not LOCATIONIQ_KEY:
        return None
    tag = _LOCATIONIQ_TAG.get(category, f"amenity:{category}")
    return (
        f"https://us1.locationiq.com/v1/nearby.php"
        f"?key={LOCATIONIQ_KEY}&lat={lat}&lon={lon}"
        f"&tag={tag}&radius={radius}&format=json&limit=50"
    )


def _geoapify_url(category: str, lat: float, lon: float, radius: int) -> str | None:
    """Build Geoapify Places API URL. Returns None if key not set."""
    if not GEOAPIFY_KEY:
        return None
    cats = _GEOAPIFY_CAT.get(category, category)
    return (
        f"https://api.geoapify.com/v2/places"
        f"?categories={cats}"
        f"&filter=circle:{lon},{lat},{radius}"
        f"&bias=proximity:{lon},{lat}&limit=50&apiKey={GEOAPIFY_KEY}"
    )


def _geoapify_batch_url(lat: float, lon: float, radius: int) -> str | None:
    """Build a SINGLE Geoapify request covering all 13 categories at once."""
    if not GEOAPIFY_KEY:
        return None
    all_cats = ",".join(set(_GEOAPIFY_CAT.values()))    # may have dupes — that's fine
    return (
        f"https://api.geoapify.com/v2/places"
        f"?categories={all_cats}"
        f"&filter=circle:{lon},{lat},{radius}"
        f"&bias=proximity:{lon},{lat}&limit=500&apiKey={GEOAPIFY_KEY}"
    )


# ── Response parsers ───────────────────────────────────────────────────────────

def _parse_mapbox(data: dict, category: str) -> list[dict]:
    """Parse Mapbox Search Box GeoJSON FeatureCollection."""
    results: list[dict] = []
    for feat in data.get("features", []):
        geom = feat.get("geometry", {})
        if geom.get("type") != "Point":
            continue
        coords = geom.get("coordinates", [])
        if len(coords) < 2:
            continue
        lon_v, lat_v = coords[0], coords[1]
        name = feat.get("properties", {}).get("name")
        results.append({"lat": lat_v, "lon": lon_v, "name": name, "type": category})
    return results


def _parse_locationiq(data: list | dict, category: str) -> list[dict]:
    """Parse LocationIQ nearby response (list of objects)."""
    results: list[dict] = []
    items = data if isinstance(data, list) else []
    for item in items:
        try:
            lat_v = float(item["lat"])
            lon_v = float(item["lon"])
            name = item.get("display_name", item.get("name", ""))
            # LocationIQ returns full address as display_name — trim to first segment
            if name and "," in name:
                name = name.split(",")[0].strip()
            results.append({"lat": lat_v, "lon": lon_v, "name": name or None, "type": category})
        except (KeyError, ValueError, TypeError):
            continue
    return results


def _parse_geoapify(data: dict, category: str) -> list[dict]:
    """Parse Geoapify Places GeoJSON FeatureCollection."""
    results: list[dict] = []
    for feat in data.get("features", []):
        props = feat.get("properties", {})
        lat_v = props.get("lat")
        lon_v = props.get("lon")
        if lat_v is None or lon_v is None:
            continue
        name = props.get("name") or props.get("address_line1")
        results.append({"lat": float(lat_v), "lon": float(lon_v), "name": name, "type": category})
    return results


def _parse_geoapify_batch(data: dict) -> dict[str, list[dict]]:
    """
    Parse a batch Geoapify response and split features by category.
    Maps each Geoapify category string back to our internal category key.
    """
    # Build reverse lookup: geoapify_cat_value → our_key
    # e.g. "healthcare.hospital" → "hospitals"  (partial match)
    reverse: dict[str, str] = {}
    for our_key, geo_cats in _GEOAPIFY_CAT.items():
        for gc in geo_cats.split(","):
            reverse[gc.strip()] = our_key

    results: dict[str, list[dict]] = {cat: [] for cat in ALL_CATEGORIES}

    for feat in data.get("features", []):
        props = feat.get("properties", {})
        lat_v = props.get("lat")
        lon_v = props.get("lon")
        if lat_v is None or lon_v is None:
            continue
        name = props.get("name") or props.get("address_line1")
        point = {"lat": float(lat_v), "lon": float(lon_v), "name": name}

        # Match via categories list in feature properties
        feat_cats: list[str] = props.get("categories", []) or []
        matched = False
        for fc in feat_cats:
            # Try exact match first, then prefix match
            our_key = reverse.get(fc)
            if not our_key:
                for geo_cat, key in reverse.items():
                    if fc.startswith(geo_cat) or geo_cat.startswith(fc):
                        our_key = key
                        break
            if our_key:
                results[our_key].append({**point, "type": our_key})
                matched = True
                break
        if not matched:
            # Fall back: first matching feature_type
            ftype = props.get("feature_type", "")
            for geo_cat, key in reverse.items():
                if geo_cat in ftype or ftype in geo_cat:
                    results[key].append({**point, "type": key})
                    break

    return results


# ── Provider fetch functions ───────────────────────────────────────────────────

async def _fetch_mapbox(
    category: str, lat: float, lon: float, radius: int,
    client: httpx.AsyncClient, start: float,
) -> list[dict] | None:
    url = _mapbox_url(category, lat, lon, radius)
    if not url:
        return None
    try:
        resp = await client.get(url, timeout=RACE_TIMEOUT)
        resp.raise_for_status()
        elapsed = time.monotonic() - start
        logger.info("[PROVIDER RACE] Mapbox responded in %.2fs for '%s'", elapsed, category)
        return _parse_mapbox(resp.json(), category)
    except Exception as exc:
        elapsed = time.monotonic() - start
        logger.warning("[PROVIDER RACE] Mapbox failed (%.2fs) for '%s' — %s", elapsed, category, exc)
        return None


async def _fetch_locationiq(
    category: str, lat: float, lon: float, radius: int,
    client: httpx.AsyncClient, start: float,
) -> list[dict] | None:
    url = _locationiq_url(category, lat, lon, radius)
    if not url:
        return None
    try:
        resp = await client.get(url, timeout=RACE_TIMEOUT)
        resp.raise_for_status()
        elapsed = time.monotonic() - start
        logger.info("[PROVIDER RACE] LocationIQ responded in %.2fs for '%s'", elapsed, category)
        return _parse_locationiq(resp.json(), category)
    except Exception as exc:
        elapsed = time.monotonic() - start
        logger.warning("[PROVIDER RACE] LocationIQ failed (%.2fs) for '%s' — %s", elapsed, category, exc)
        return None


async def _fetch_geoapify(
    category: str, lat: float, lon: float, radius: int,
    client: httpx.AsyncClient, start: float,
) -> list[dict] | None:
    url = _geoapify_url(category, lat, lon, radius)
    if not url:
        return None
    try:
        resp = await client.get(url, timeout=RACE_TIMEOUT)
        resp.raise_for_status()
        elapsed = time.monotonic() - start
        logger.info("[PROVIDER RACE] Geoapify responded in %.2fs for '%s'", elapsed, category)
        return _parse_geoapify(resp.json(), category)
    except Exception as exc:
        elapsed = time.monotonic() - start
        logger.warning("[PROVIDER RACE] Geoapify failed (%.2fs) for '%s' — %s", elapsed, category, exc)
        return None


async def _fetch_overpass(
    category: str, lat: float, lon: float, radius: int, start: float,
) -> list[dict] | None:
    """Overpass API per-category fetch — always available, used as final fallback."""
    from app.services.overpass_service import (  # lazy import to avoid circular
        _category_query, _race_query, _parse_locations,
    )
    try:
        q = _category_query(category, lat, lon, radius)
        data = await _race_query(q)
        locs = _parse_locations(data, category)
        elapsed = time.monotonic() - start
        logger.info(
            "[PROVIDER RACE] Overpass responded in %.2fs for '%s' — %d result(s)",
            elapsed, category, len(locs),
        )
        return locs
    except Exception as exc:
        elapsed = time.monotonic() - start
        logger.warning("[PROVIDER RACE] Overpass failed (%.2fs) for '%s' — %s", elapsed, category, exc)
        return None


# ── Race engine ────────────────────────────────────────────────────────────────

async def _race_providers(
    category: str, lat: float, lon: float, radius: int,
) -> list[dict]:
    """
    Race all 4 providers simultaneously for one facility category.

    Providers
    ---------
    1. Mapbox Search Box API   (fastest commercial, requires MAPBOX_TOKEN)
    2. LocationIQ Nearby API   (reliable OSM-based, requires LOCATIONIQ_KEY)
    3. Geoapify Places API     (good coverage, requires GEOAPIFY_KEY)
    4. Overpass API            (always available, free, slightly slower)

    Strategy
    --------
    All 4 tasks start simultaneously via asyncio.create_task.
    asyncio.wait(FIRST_COMPLETED) — pick first non-None result.
    Cancel remaining pending tasks immediately.
    Return winning result, or [] if all providers fail.
    """
    start = time.monotonic()
    configured = []
    if MAPBOX_TOKEN:   configured.append("Mapbox")
    if LOCATIONIQ_KEY: configured.append("LocationIQ")
    if GEOAPIFY_KEY:   configured.append("Geoapify")
    configured.append("Overpass")  # always available
    logger.info("[PROVIDER RACE] Starting %d providers [%s] for '%s'",
                len(configured), ", ".join(configured), category)

    async with httpx.AsyncClient(follow_redirects=True) as client:
        tasks = set()
        if MAPBOX_TOKEN:
            tasks.add(asyncio.create_task(
                _fetch_mapbox(category, lat, lon, radius, client, start), name="mapbox"
            ))
        if LOCATIONIQ_KEY:
            tasks.add(asyncio.create_task(
                _fetch_locationiq(category, lat, lon, radius, client, start), name="locationiq"
            ))
        if GEOAPIFY_KEY:
            tasks.add(asyncio.create_task(
                _fetch_geoapify(category, lat, lon, radius, client, start), name="geoapify"
            ))
        # Always add Overpass as fallback
        tasks.add(asyncio.create_task(
            _fetch_overpass(category, lat, lon, radius, start), name="overpass"
        ))

        pending = set(tasks)
        while pending:
            done, pending = await asyncio.wait(pending, return_when=asyncio.FIRST_COMPLETED)
            for t in done:
                result = t.result()
                if result is not None:
                    winner = t.get_name()
                    elapsed = time.monotonic() - start
                    logger.info(
                        "[PROVIDER RACE] ✓ Winner: %s (%.2fs) for '%s' — %d result(s)",
                        winner, elapsed, category, len(result),
                    )
                    for p in pending:
                        p.cancel()
                    return result

    logger.warning("[PROVIDER RACE] All providers failed for '%s'", category)
    return []


# ── Geoapify batch fallback ────────────────────────────────────────────────────

async def _fetch_geoapify_batch(
    lat: float, lon: float, radius: int,
) -> dict[str, list[dict]] | None:
    """
    Fetch ALL 13 categories in a SINGLE Geoapify API call.
    10–20× faster than 13 individual calls.
    Falls back gracefully to None on any error.
    """
    url = _geoapify_batch_url(lat, lon, radius)
    if not url:
        return None
    start = time.monotonic()
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, timeout=20.0)
            resp.raise_for_status()
        elapsed = time.monotonic() - start
        logger.info("[GEOAPIFY BATCH] Completed in %.2fs — all 13 categories", elapsed)
        return _parse_geoapify_batch(resp.json())
    except Exception as exc:
        elapsed = time.monotonic() - start
        logger.warning("[GEOAPIFY BATCH] Failed (%.2fs) — %s", elapsed, exc)
        return None


# ── Public API ─────────────────────────────────────────────────────────────────

async def fetch_facility_locations(
    lat: float, lon: float, radius: int = FIXED_RADIUS,
) -> Dict[str, list[dict]]:
    """
    Fetch facility map-pin locations for all 13 categories.

    Priority order
    --------------
    1. Geoapify batch  — single HTTP call, fastest (~1–2 s).  Needs GEOAPIFY_KEY.
    2. Per-category race — Mapbox + LocationIQ + Geoapify + Overpass simultaneously.
       First winner cancels the rest.  Overpass always participates as free fallback.
    """
    radius = radius or FIXED_RADIUS

    # Fast path: single Geoapify batch call
    batch = await _fetch_geoapify_batch(lat, lon, radius)
    if batch is not None:
        logger.info("[LOCATION SERVICE] Geoapify batch succeeded — all 13 categories in one call")
        return batch

    # Slow path: per-category 4-provider race (Mapbox / LocationIQ / Geoapify / Overpass)
    configured_commercial = sum([bool(MAPBOX_TOKEN), bool(LOCATIONIQ_KEY), bool(GEOAPIFY_KEY)])
    logger.info(
        "[LOCATION SERVICE] Starting per-category provider race. "
        "Commercial providers configured: %d/3. Overpass always included.",
        configured_commercial,
    )

    async def _race_cat(cat: str) -> tuple[str, list[dict]]:
        locs = await _race_providers(cat, lat, lon, radius)
        logger.info("[LOCATION SERVICE] %s → %d locations", cat, len(locs))
        return cat, locs

    results = await asyncio.gather(*[_race_cat(cat) for cat in ALL_CATEGORIES])
    return dict(results)


async def iter_facility_locations_sse(
    lat: float, lon: float, radius: int = FIXED_RADIUS,
) -> AsyncIterator[dict]:
    """
    Async generator — yields one SSE-ready dict per category as it completes.
    Each category independently races all 3 providers.

    Yields
    ------
    {"category": str, "locations": [{lat, lon, name, type}]}
    """
    radius = radius or FIXED_RADIUS
    queue: asyncio.Queue[dict | None] = asyncio.Queue()
    total = len(ALL_CATEGORIES)
    done_count = 0

    async def _race_and_enqueue(cat: str) -> None:
        locs = await _race_providers(cat, lat, lon, radius)
        await queue.put({"category": cat, "locations": locs})

    tasks = [asyncio.create_task(_race_and_enqueue(cat)) for cat in ALL_CATEGORIES]

    while done_count < total:
        item = await asyncio.wait_for(queue.get(), timeout=35.0)
        done_count += 1
        yield item

    for t in tasks:
        if not t.done():
            t.cancel()
