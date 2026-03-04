"""
Map View Fetch Logic — "fastest response wins" race service.

Sends the same Overpass count query to all three endpoints simultaneously.
Returns the first valid JSON response, cancels the rest.
ONLY used by the map-view route. All other services use overpass_service.py.
"""

import asyncio
import logging
import time
from typing import Dict, Any, Optional

import httpx

# ── Configuration ──────────────────────────────────────────────────────────────

OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.openstreetmap.fr/api/interpreter",
]

TIMEOUT = 10.0   # seconds per request
FIXED_RADIUS = 2000  # meters — fixed, not exposed as parameter

logger = logging.getLogger("map_view_fetch_logic")

# ── Query Builder ──────────────────────────────────────────────────────────────

# Ordered category sections — same tags used throughout the rest of the service
_SECTIONS: list[tuple[str, list[str]]] = [
    ("hospitals",    ["hospital", "clinic"]),
    ("police",       ["police"]),
    ("fire_stations",["fire_station"]),
    ("schools",      ["school"]),
]
_LEISURE_SECTIONS: list[tuple[str, list[str]]] = [
    ("parks",        ["park"]),
    ("gyms",         ["fitness_centre", "sports_centre"]),
]
_SHOP_SECTIONS: list[tuple[str, list[str]]] = [
    ("supermarkets", ["supermarket"]),
]
_SPECIAL_SECTIONS: list[tuple[str, list[str]]] = [
    ("trains",       ["station"]),          # railway=
    ("metro",        ["subway"]),           # station=subway
    ("bus_stops",    ["bus_stop"]),         # highway=
    ("restaurants",  ["restaurant", "fast_food"]),  # amenity=
    ("cafes",        ["cafe"]),
    ("bars",         ["bar", "pub"]),
]


def _build_count_query(lat: float, lon: float) -> tuple[str, list[str]]:
    """
    Build a single Overpass QL query that counts all 13 amenity categories.
    Returns (query_string, ordered_keys).
    """
    a = f"around:{FIXED_RADIUS},{lat},{lon}"
    parts: list[str] = []
    keys: list[str] = []

    # amenity= tags
    for name, tags in _SECTIONS:
        filters = "\n  ".join(
            f'node["amenity"="{t}"]({a});\nway["amenity"="{t}"]({a});'
            for t in tags
        )
        parts.append(f"(\n  {filters}\n)->.{name};\n.{name} out count;")
        keys.append(name)

    # leisure= tags
    for name, tags in _LEISURE_SECTIONS:
        filters = "\n  ".join(
            f'node["leisure"="{t}"]({a});\nway["leisure"="{t}"]({a});'
            for t in tags
        )
        parts.append(f"(\n  {filters}\n)->.{name};\n.{name} out count;")
        keys.append(name)

    # shop= tags
    for name, tags in _SHOP_SECTIONS:
        filters = "\n  ".join(
            f'node["shop"="{t}"]({a});\nway["shop"="{t}"]({a});'
            for t in tags
        )
        parts.append(f"(\n  {filters}\n)->.{name};\n.{name} out count;")
        keys.append(name)

    # special tags
    special_filters = {
        "trains":      [f'node["railway"="station"]({a});', f'way["railway"="station"]({a});'],
        "metro":       [f'node["station"="subway"]({a});',  f'node["railway"="subway_entrance"]({a});'],
        "bus_stops":   [f'node["highway"="bus_stop"]({a});', f'node["public_transport"="platform"]["bus"="yes"]({a});'],
        "restaurants": [f'node["amenity"="restaurant"]({a});', f'way["amenity"="restaurant"]({a});',
                        f'node["amenity"="fast_food"]({a});', f'way["amenity"="fast_food"]({a});'],
        "cafes":       [f'node["amenity"="cafe"]({a});', f'way["amenity"="cafe"]({a});'],
        "bars":        [f'node["amenity"="bar"]({a});', f'way["amenity"="bar"]({a});',
                        f'node["amenity"="pub"]({a});', f'way["amenity"="pub"]({a});'],
    }
    for name, _ in _SPECIAL_SECTIONS:
        filters = "\n  ".join(special_filters[name])
        parts.append(f"(\n  {filters}\n)->.{name};\n.{name} out count;")
        keys.append(name)

    query = "[out:json][timeout:90];\n" + "\n".join(parts)
    return query, keys


def _parse_counts(data: dict, keys: list[str]) -> Dict[str, int]:
    """Extract count totals from the Overpass response, in key order."""
    count_elements = [el for el in data.get("elements", []) if el.get("type") == "count"]
    result: Dict[str, int] = {}
    for i, key in enumerate(keys):
        result[key] = int(count_elements[i]["tags"].get("total", 0)) if i < len(count_elements) else 0
    return result


def _map_to_response(raw: Dict[str, int]) -> Dict[str, Any]:
    """Convert internal key names to the response schema used by scoring_engine."""
    return {
        "hospital_count":      raw.get("hospitals", 0),
        "police_count":        raw.get("police", 0),
        "fire_station_count":  raw.get("fire_stations", 0),
        "school_count":        raw.get("schools", 0),
        "park_count":          raw.get("parks", 0),
        "train_station_count": raw.get("trains", 0),
        "metro_count":         raw.get("metro", 0),
        "bus_stop_count":      raw.get("bus_stops", 0),
        "restaurant_count":    raw.get("restaurants", 0),
        "cafe_count":          raw.get("cafes", 0),
        "gym_count":           raw.get("gyms", 0),
        "bar_count":           raw.get("bars", 0),
        "supermarket_count":   raw.get("supermarkets", 0),
    }


# ── Race Fetcher ───────────────────────────────────────────────────────────────

async def _fetch_from_endpoint(
    endpoint: str,
    query: str,
    client: httpx.AsyncClient,
    start_time: float,
) -> Optional[Dict[str, Any]]:
    """Post query to one endpoint. Returns parsed result dict or None on failure."""
    try:
        logger.info("[RACE] Sending request → %s", endpoint)
        response = await client.post(
            endpoint,
            data={"data": query},
            timeout=TIMEOUT,
        )
        response.raise_for_status()
        elapsed = time.monotonic() - start_time
        logger.info("[RACE] Response received ← %s  (%.2fs)", endpoint, elapsed)
        return {"endpoint": endpoint, "data": response.json()}
    except Exception as exc:
        elapsed = time.monotonic() - start_time
        logger.warning("[RACE] Endpoint failed  ✗ %s  (%.2fs) — %s", endpoint, elapsed, exc)
        return None


async def _fetch_geoapify_batch_counts(lat: float, lon: float) -> Dict[str, Any] | None:
    """
    Try a single Geoapify batch call that fetches all 13 categories at once.
    Returns a counts dict in the same format as _map_to_response, or None on failure.
    """
    try:
        from app.services.location_service import _fetch_geoapify_batch  # lazy import
        batch = await _fetch_geoapify_batch(lat, lon, FIXED_RADIUS)
        if batch is None:
            return None
        # location_service uses "train_stations"/"metro_stations"; _map_to_response expects "trains"/"metro"
        raw = {
            "hospitals":    len(batch.get("hospitals",      [])),
            "police":       len(batch.get("police",         [])),
            "fire_stations": len(batch.get("fire_stations", [])),
            "schools":      len(batch.get("schools",        [])),
            "parks":        len(batch.get("parks",          [])),
            "gyms":         len(batch.get("gyms",           [])),
            "supermarkets": len(batch.get("supermarkets",   [])),
            "trains":       len(batch.get("train_stations", [])),
            "metro":        len(batch.get("metro_stations", [])),
            "bus_stops":    len(batch.get("bus_stops",      [])),
            "restaurants":  len(batch.get("restaurants",    [])),
            "cafes":        len(batch.get("cafes",          [])),
            "bars":         len(batch.get("bars",           [])),
        }
        result = _map_to_response(raw)
        logger.info("[GEOAPIFY BATCH COUNTS] Success lat=%.5f lon=%.5f → %s", lat, lon, result)
        return result
    except Exception as exc:
        logger.warning("[GEOAPIFY BATCH COUNTS] Failed: %s — falling back to Overpass race", exc)
        return None


async def fetch_map_data(lat: float, lon: float) -> Dict[str, Any]:
    """
    Primary: single Geoapify batch call (all 13 categories, ~1-2 s).
    Fallback: race all three Overpass endpoints.
    Radius is fixed to 2000 m — not a parameter.
    """
    # ── Fast path: Geoapify batch ──────────────────────────────────────────────
    geoapify_result = await _fetch_geoapify_batch_counts(lat, lon)
    if geoapify_result is not None:
        return geoapify_result

    # ── Slow path: Overpass race ───────────────────────────────────────────────
    logger.info("[MAP DATA] Geoapify unavailable — falling back to Overpass race")
    query, keys = _build_count_query(lat, lon)
    start = time.monotonic()
    logger.info("[RACE] Starting map-view race  lat=%.5f lon=%.5f radius=%dm", lat, lon, FIXED_RADIUS)
    logger.info("[RACE] Querying endpoints: %s", ", ".join(OVERPASS_ENDPOINTS))

    async with httpx.AsyncClient() as client:
        tasks = {
            asyncio.create_task(
                _fetch_from_endpoint(ep, query, client, start), name=ep
            )
            for ep in OVERPASS_ENDPOINTS
        }

        pending = set(tasks)
        while pending:
            done, pending = await asyncio.wait(pending, return_when=asyncio.FIRST_COMPLETED)
            for task in done:
                result = task.result()
                if result and "data" in result:
                    winner = result["endpoint"]
                    elapsed = time.monotonic() - start
                    logger.info(
                        "[RACE] ✓ Winner: %s  (%.2fs) — cancelling %d remaining task(s)",
                        winner, elapsed, len(pending),
                    )
                    for t in pending:
                        t.cancel()
                    raw = _parse_counts(result["data"], keys)
                    return _map_to_response(raw)

    raise RuntimeError("All Overpass endpoints failed or timed out for map-view request.")
