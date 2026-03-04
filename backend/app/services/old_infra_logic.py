"""
Overpass API service.

TWO separate fetch paths:
  MAP VIEWER  -> fetch_all_counts_parallel()   - asyncio.gather, 15s timeout, 2 retries
  INFRA DISPLAY -> fetch_facility_locations()  - sequential with 0.5s delay per category

ExternalAPIError is raised instead of silently returning zeros.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone, timedelta
from typing import TYPE_CHECKING

import httpx
from sqlalchemy.orm import Session

from app.config import settings
from app.models.infrastructure import InfrastructureData
from app.utils.exceptions import ExternalAPIError

if TYPE_CHECKING:
    from app.models.area import Area

logger = logging.getLogger(__name__)

OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]

_TIMEOUT_FAST = 15.0   # Map Viewer / scoring
_TIMEOUT_SLOW = 25.0   # Infra Display locations
_RETRIES       = 3     # max retries per category (increased from 2)

# Limit concurrent Overpass HTTP connections – prevents 429 storms
_OVERPASS_SEM: asyncio.Semaphore | None = None


def _get_sem() -> asyncio.Semaphore:
    global _OVERPASS_SEM
    if _OVERPASS_SEM is None:
        _OVERPASS_SEM = asyncio.Semaphore(4)
    return _OVERPASS_SEM


# ── Low-level Overpass helpers ────────────────────────────────────────────────

def _count_query(around: str, filters: list[str]) -> str:
    lines = "\n  ".join(filters)
    return f"[out:json][timeout:20];\n(\n  {lines}\n);\nout count;"


def _center_query(around: str, filters: list[str]) -> str:
    lines = "\n  ".join(filters)
    return f"[out:json][timeout:30];\n(\n  {lines}\n);\nout center;"


async def _post_overpass(query: str, timeout: float = _TIMEOUT_FAST, max_retries: int = _RETRIES) -> dict:
    """POST a query with endpoint rotation and 429 backoff. Raises ExternalAPIError after all retries."""
    last_exc: Exception | None = None
    async with _get_sem():  # max 4 concurrent connections
        for attempt in range(max_retries):
            endpoint = OVERPASS_ENDPOINTS[attempt % len(OVERPASS_ENDPOINTS)]
            try:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    resp = await client.post(endpoint, data={"data": query})
                    if resp.status_code == 429:
                        wait = int(resp.headers.get("Retry-After", "2"))
                        logger.warning(
                            "Overpass 429 on %s – waiting %ds before retry %d/%d",
                            endpoint, wait, attempt + 1, max_retries,
                        )
                        await asyncio.sleep(wait)
                        last_exc = Exception(f"429 on {endpoint}")
                        continue
                    resp.raise_for_status()
                    return resp.json()
            except Exception as exc:
                last_exc = exc
                logger.warning("Overpass attempt %d/%d (%s): %s", attempt + 1, max_retries, endpoint, exc)
    raise ExternalAPIError("Overpass", f"All {max_retries} attempts failed. Last: {last_exc}")


def _extract_count(data: dict) -> int:
    for el in data.get("elements", []):
        if el.get("type") == "count":
            return int(el.get("tags", {}).get("total", 0))
    return 0


def _parse_locations(data: dict, cat: str, max_items: int = 50) -> list:
    from app.schemas.infrastructure import FacilityLocation
    results, seen = [], set()
    for el in data.get("elements", []):
        if el.get("type") == "way":
            c = el.get("center")
            if not c:
                continue
            lat_, lon_ = c["lat"], c["lon"]
        else:
            lat_ = el.get("lat")
            lon_ = el.get("lon")
            if lat_ is None or lon_ is None:
                continue
        key = (round(lat_, 6), round(lon_, 6))
        if key in seen:
            continue
        seen.add(key)
        results.append(FacilityLocation(
            name=el.get("tags", {}).get("name"),
            lat=lat_, lon=lon_, type=cat,
        ))
        if len(results) >= max_items:
            break
    return results


# ── Individual count fetchers (used by parallel gather + background task) ─────

async def _count(lat: float, lon: float, radius: int, filters: list[str]) -> int:
    around = f"around:{radius},{lat},{lon}"
    q = _count_query(around, filters)
    data = await _post_overpass(q, timeout=_TIMEOUT_FAST)
    return _extract_count(data)


def _f(around: str, tags: list[str]) -> list[str]:
    """Build node+way filter lines for a list of OSM tag strings."""
    lines = []
    for t in tags:
        lines.append(f"node{t}({around});")
        lines.append(f"way{t}({around});")
    return lines


async def _fetch_hospitals(lat, lon, radius):
    a = f"around:{radius},{lat},{lon}"
    c = await _count(lat, lon, radius, _f(a, ['["amenity"="hospital"]', '["amenity"="clinic"]']))
    logger.info("hospitals (%s,%s r=%s): %d", lat, lon, radius, c)
    return c


async def _fetch_schools(lat, lon, radius):
    a = f"around:{radius},{lat},{lon}"
    c = await _count(lat, lon, radius, _f(a, ['["amenity"="school"]']))
    logger.info("schools (%s,%s r=%s): %d", lat, lon, radius, c)
    return c


async def _fetch_police(lat, lon, radius):
    a = f"around:{radius},{lat},{lon}"
    c = await _count(lat, lon, radius, _f(a, ['["amenity"="police"]']))
    logger.info("police (%s,%s r=%s): %d", lat, lon, radius, c)
    return c


async def _fetch_fire_stations(lat, lon, radius):
    a = f"around:{radius},{lat},{lon}"
    c = await _count(lat, lon, radius, _f(a, ['["amenity"="fire_station"]']))
    logger.info("fire_stations (%s,%s r=%s): %d", lat, lon, radius, c)
    return c


async def _fetch_parks(lat, lon, radius):
    a = f"around:{radius},{lat},{lon}"
    c = await _count(lat, lon, radius, _f(a, ['["leisure"="park"]']))
    logger.info("parks (%s,%s r=%s): %d", lat, lon, radius, c)
    return c


async def _fetch_bus_stops(lat, lon, radius):
    around = f"around:{radius},{lat},{lon}"
    filters = [
        f'node["highway"="bus_stop"]({around});',
        f'node["public_transport"="platform"]["bus"="yes"]({around});',
    ]
    q = _count_query(around, filters)
    data = await _post_overpass(q, timeout=_TIMEOUT_FAST)
    c = _extract_count(data)
    logger.info("bus_stops (%s,%s r=%s): %d", lat, lon, radius, c)
    return c


async def _fetch_metro(lat, lon, radius):
    around = f"around:{radius},{lat},{lon}"
    filters = [
        f'node["station"="subway"]({around});',
        f'node["railway"="subway_entrance"]({around});',
    ]
    q = _count_query(around, filters)
    data = await _post_overpass(q, timeout=_TIMEOUT_FAST)
    c = _extract_count(data)
    logger.info("metro (%s,%s r=%s): %d", lat, lon, radius, c)
    return c


async def _fetch_train_stations(lat, lon, radius):
    around = f"around:{radius},{lat},{lon}"
    filters = [
        f'node["railway"="station"]({around});',
        f'way["railway"="station"]({around});',
    ]
    q = _count_query(around, filters)
    data = await _post_overpass(q, timeout=_TIMEOUT_FAST)
    c = _extract_count(data)
    logger.info("train_stations (%s,%s r=%s): %d", lat, lon, radius, c)
    return c


async def _fetch_supermarkets(lat, lon, radius):
    a = f"around:{radius},{lat},{lon}"
    c = await _count(lat, lon, radius, _f(a, ['["shop"="supermarket"]']))
    logger.info("supermarkets (%s,%s r=%s): %d", lat, lon, radius, c)
    return c


async def _fetch_restaurants(lat, lon, radius):
    around = f"around:{radius},{lat},{lon}"
    filters = [
        f'node["amenity"="restaurant"]({around});',
        f'way["amenity"="restaurant"]({around});',
        f'node["amenity"="fast_food"]({around});',
    ]
    q = _count_query(around, filters)
    data = await _post_overpass(q, timeout=_TIMEOUT_FAST)
    c = _extract_count(data)
    logger.info("restaurants (%s,%s r=%s): %d", lat, lon, radius, c)
    return c


async def _fetch_cafes(lat, lon, radius):
    a = f"around:{radius},{lat},{lon}"
    c = await _count(lat, lon, radius, _f(a, ['["amenity"="cafe"]']))
    logger.info("cafes (%s,%s r=%s): %d", lat, lon, radius, c)
    return c


async def _fetch_gyms(lat, lon, radius):
    a = f"around:{radius},{lat},{lon}"
    c = await _count(lat, lon, radius, _f(a, ['["leisure"="fitness_centre"]', '["leisure"="sports_centre"]']))
    logger.info("gyms (%s,%s r=%s): %d", lat, lon, radius, c)
    return c


async def _fetch_bars(lat, lon, radius):
    a = f"around:{radius},{lat},{lon}"
    c = await _count(lat, lon, radius, _f(a, ['["amenity"="bar"]', '["amenity"="pub"]']))
    logger.info("bars (%s,%s r=%s): %d", lat, lon, radius, c)
    return c


# Public aliases used by module consumers
fetch_hospitals      = _fetch_hospitals
fetch_schools        = _fetch_schools
fetch_police         = _fetch_police
fetch_fire_stations  = _fetch_fire_stations
fetch_parks          = _fetch_parks
fetch_bus_stops      = _fetch_bus_stops
fetch_metro          = _fetch_metro
fetch_train_stations = _fetch_train_stations
fetch_supermarkets   = _fetch_supermarkets
fetch_restaurants    = _fetch_restaurants
fetch_cafes          = _fetch_cafes
fetch_gyms           = _fetch_gyms
fetch_bars           = _fetch_bars


# ── MAP VIEWER: single combined Overpass count query ─────────────────────────

# Category definitions: (result_key, [overpass_filter_lines])
# The ORDER here determines the order of count elements in the Overpass response.
_SINGLE_QUERY_CATEGORIES: list[tuple[str, list[str]]] = [
    ("hospitals",     ['["amenity"="hospital"]', '["amenity"="clinic"]']),
    ("police",        ['["amenity"="police"]']),
    ("fire_stations", ['["amenity"="fire_station"]']),
    ("schools",       ['["amenity"="school"]']),
    ("parks",         ['["leisure"="park"]']),
    ("trains",        ['["railway"="station"]']),
    # metro / bus need raw filter lines (node-only or mixed)
]

def _build_single_count_query(lat: float, lon: float, radius: int) -> tuple[str, list[str]]:
    """
    Build ONE Overpass QL query that counts all 13 categories in a single HTTP request.
    Returns (query_string, ordered_result_keys).
    Each `.setname out count;` produces exactly one element in the response elements array.
    """
    a = f"around:{radius},{lat},{lon}"

    # (set_name, filter_lines)
    sections: list[tuple[str, list[str]]] = [
        ("hospitals",     [f'node["amenity"="hospital"]({a});', f'way["amenity"="hospital"]({a});', f'node["amenity"="clinic"]({a});', f'way["amenity"="clinic"]({a});']),
        ("police",        [f'node["amenity"="police"]({a});',  f'way["amenity"="police"]({a});']),
        ("fire_stations", [f'node["amenity"="fire_station"]({a});', f'way["amenity"="fire_station"]({a});']),
        ("schools",       [f'node["amenity"="school"]({a});',  f'way["amenity"="school"]({a});']),
        ("parks",         [f'node["leisure"="park"]({a});',    f'way["leisure"="park"]({a});']),
        ("trains",        [f'node["railway"="station"]({a});', f'way["railway"="station"]({a});']),
        ("metro",         [f'node["station"="subway"]({a});',  f'node["railway"="subway_entrance"]({a});']),
        ("bus_stops",     [f'node["highway"="bus_stop"]({a});', f'node["public_transport"="platform"]["bus"="yes"]({a});']),
        ("restaurants",   [f'node["amenity"="restaurant"]({a});', f'way["amenity"="restaurant"]({a});', f'node["amenity"="fast_food"]({a});', f'way["amenity"="fast_food"]({a});']),
        ("cafes",         [f'node["amenity"="cafe"]({a});',    f'way["amenity"="cafe"]({a});']),
        ("gyms",          [f'node["leisure"="fitness_centre"]({a});', f'way["leisure"="fitness_centre"]({a});', f'node["leisure"="sports_centre"]({a});', f'way["leisure"="sports_centre"]({a});']),
        ("bars",          [f'node["amenity"="bar"]({a});',     f'way["amenity"="bar"]({a});', f'node["amenity"="pub"]({a});', f'way["amenity"="pub"]({a});']),
        ("supermarkets",  [f'node["shop"="supermarket"]({a});', f'way["shop"="supermarket"]({a});']),
    ]

    parts: list[str] = []
    keys: list[str] = []
    for name, filters in sections:
        joined = "\n  ".join(filters)
        parts.append(f"(\n  {joined}\n)->.{name};\n.{name} out count;")
        keys.append(name)

    query = "[out:json][timeout:90];\n" + "\n".join(parts)
    return query, keys


def _parse_ordered_counts(data: dict, keys: list[str]) -> dict[str, int]:
    """Extract counts from a multi-set Overpass response, in definition order."""
    count_elements = [el for el in data.get("elements", []) if el.get("type") == "count"]
    result: dict[str, int] = {}
    for i, key in enumerate(keys):
        result[key] = int(count_elements[i]["tags"].get("total", 0)) if i < len(count_elements) else 0
    return result


async def fetch_all_counts_single_query(lat: float, lon: float, radius: int) -> dict:
    """
    MAP VIEWER — fetch ALL category counts with ONE Overpass request.
    No parallel gather; no 429 storm.
    Retries at most once (max_retries=2) on 429/504.
    Raises ExternalAPIError if Overpass is unavailable after retries.
    """
    query, keys = _build_single_count_query(lat, lon, radius)
    data = await _post_overpass(query, timeout=90.0, max_retries=2)
    raw = _parse_ordered_counts(data, keys)
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


# Parallel gather kept for reference but scoring routes now use the single-query path
async def fetch_all_counts_parallel(lat: float, lon: float, radius: int) -> dict:
    return await fetch_all_counts_single_query(lat, lon, radius)


# Back-compat alias
async def fetch_all_counts(lat: float, lon: float, radius: int) -> dict:
    return await fetch_all_counts_single_query(lat, lon, radius)


# ── INFRA DISPLAY: sequential location fetch with delays ─────────────────────

_LOC_CATEGORIES = {
    "hospitals": ['["amenity"="hospital"]', '["amenity"="clinic"]'],
    "schools": ['["amenity"="school"]'],
    "police": ['["amenity"="police"]'],
    "fire_stations": ['["amenity"="fire_station"]'],
    "parks": ['["leisure"="park"]'],
    "bus_stops": [],     # special
    "metro_stations": [], # special
    "train_stations": [], # special
    "supermarkets": ['["shop"="supermarket"]'],
    "restaurants": ['["amenity"="restaurant"]', '["amenity"="fast_food"]'],
    "cafes": ['["amenity"="cafe"]'],
    "gyms": ['["leisure"="fitness_centre"]', '["leisure"="sports_centre"]'],
    "bars": ['["amenity"="bar"]', '["amenity"="pub"]'],
}


async def fetch_facility_locations(
    lat: float, lon: float, radius: int, max_per_category: int = 50
) -> dict:
    """
    Fetch facility locations SEQUENTIALLY with a 0.5 s pause between categories
    to avoid overwhelming the Overpass API and triggering 504s.
    Used by the Infra Display route only.
    """
    around = f"around:{radius},{lat},{lon}"
    result: dict[str, list] = {}

    for cat in _LOC_CATEGORIES:
        # Build query filters for this category
        if cat == "bus_stops":
            filters = [
                f'node["highway"="bus_stop"]({around});',
                f'node["public_transport"="platform"]["bus"="yes"]({around});',
            ]
        elif cat == "metro_stations":
            filters = [
                f'node["station"="subway"]({around});',
                f'node["railway"="subway_entrance"]({around});',
            ]
        elif cat == "train_stations":
            filters = [
                f'node["railway"="station"]({around});',
                f'way["railway"="station"]({around});',
            ]
        else:
            tags = _LOC_CATEGORIES[cat]
            if not tags:
                result[cat] = []
                continue
            filters = []
            for t in tags:
                filters.append(f"node{t}({around});")
                filters.append(f"way{t}({around});")

        q = _center_query(around, filters)
        try:
            data = await _post_overpass(q, timeout=_TIMEOUT_SLOW)
            result[cat] = _parse_locations(data, cat, max_per_category)
            logger.info("locations/%s: %d items", cat, len(result[cat]))
        except ExternalAPIError as exc:
            logger.warning("Location fetch failed for %s: %s", cat, exc)
            result[cat] = []

        # Throttle to avoid 504 from Overpass
        await asyncio.sleep(0.5)

    return result


# ── INFRA DISPLAY: SSE async generator ───────────────────────────────────────

async def iter_facility_locations_sse(
    lat: float, lon: float, radius: int, max_per_category: int = 50
):
    """
    Async generator used by the SSE streaming endpoint.
    Yields one dict per category the moment that category finishes.
    Yields {"type": "done"} at the end.
    """
    around = f"around:{radius},{lat},{lon}"

    for cat in _LOC_CATEGORIES:
        if cat == "bus_stops":
            filters = [
                f'node["highway"="bus_stop"]({around});',
                f'node["public_transport"="platform"]["bus"="yes"]({around});',
            ]
        elif cat == "metro_stations":
            filters = [
                f'node["station"="subway"]({around});',
                f'node["railway"="subway_entrance"]({around});',
            ]
        elif cat == "train_stations":
            filters = [
                f'node["railway"="station"]({around});',
                f'way["railway"="station"]({around});',
            ]
        else:
            tags = _LOC_CATEGORIES[cat]
            if not tags:
                yield {"type": cat, "data": []}
                continue
            filters = []
            for t in tags:
                filters.append(f"node{t}({around});")
                filters.append(f"way{t}({around});")

        q = _center_query(around, filters)
        try:
            data = await _post_overpass(q, timeout=_TIMEOUT_SLOW)
            locs = _parse_locations(data, cat, max_per_category)
            payload = [{"name": loc.name, "lat": loc.lat, "lon": loc.lon, "type": loc.type} for loc in locs]
            yield {"type": cat, "data": payload}
            logger.info("SSE location/%s: %d items", cat, len(locs))
        except ExternalAPIError as exc:
            logger.warning("SSE location fetch failed for %s: %s", cat, exc)
            yield {"type": cat, "status": "failed"}

        await asyncio.sleep(0.3)

    yield {"type": "done"}


# ── BACKGROUND INFRA FETCH (sequential, step-by-step for Infra Display) ───────

ALL_CATEGORIES = ["hospitals", "schools", "police", "fire_stations", "parks",
                  "transport", "supermarkets", "lifestyle"]


async def fetch_infrastructure_background(area_id: int, db_factory) -> None:
    """
    Background task for Infra Display route.
    Fetches each category sequentially and persists to DB with status updates.
    Continues on per-category failure (marks as partial).
    """
    from app.models.area import Area

    db: Session = db_factory()
    infra: InfrastructureData | None = None
    try:
        area = db.query(Area).filter(Area.id == area_id).first()
        if not area:
            logger.error("BG fetch: area_id=%d not found", area_id)
            return

        infra = db.query(InfrastructureData).filter(InfrastructureData.area_id == area_id).first()
        if not infra:
            infra = InfrastructureData(area_id=area_id, infra_status="pending")
            db.add(infra)
            db.commit()
            db.refresh(infra)

        lat, lon, rad = area.center_lat, area.center_lon, area.radius_meters or 2000
        failed: list[str] = []

        async def _step(status: str, setter):
            infra.infra_status = status
            db.commit()
            try:
                setter(await _coro)
            except ExternalAPIError as e:
                failed.append(status.replace("fetching_", ""))
                logger.error("%s area %d: %s", status, area_id, e)

        # hospitals
        infra.infra_status = "fetching_hospitals"; db.commit()
        try:
            infra.hospital_count = await _fetch_hospitals(lat, lon, rad)
        except ExternalAPIError as e:
            failed.append("hospitals"); logger.error("hospitals area %d: %s", area_id, e)

        # schools
        infra.infra_status = "fetching_schools"; db.commit()
        try:
            infra.school_count = await _fetch_schools(lat, lon, rad)
        except ExternalAPIError as e:
            failed.append("schools"); logger.error("schools area %d: %s", area_id, e)

        # police
        infra.infra_status = "fetching_police"; db.commit()
        try:
            infra.police_count = await _fetch_police(lat, lon, rad)
        except ExternalAPIError as e:
            failed.append("police"); logger.error("police area %d: %s", area_id, e)

        # fire stations
        infra.infra_status = "fetching_fire_stations"; db.commit()
        try:
            infra.fire_station_count = await _fetch_fire_stations(lat, lon, rad)
        except ExternalAPIError as e:
            failed.append("fire_stations"); logger.error("fire_stations area %d: %s", area_id, e)

        # parks
        infra.infra_status = "fetching_parks"; db.commit()
        try:
            infra.park_count = await _fetch_parks(lat, lon, rad)
        except ExternalAPIError as e:
            failed.append("parks"); logger.error("parks area %d: %s", area_id, e)

        # transport
        infra.infra_status = "fetching_transport"; db.commit()
        try:
            infra.bus_stop_count = await _fetch_bus_stops(lat, lon, rad)
        except ExternalAPIError as e:
            failed.append("bus_stops"); logger.error("bus_stops area %d: %s", area_id, e)
        try:
            infra.metro_count = await _fetch_metro(lat, lon, rad)
        except ExternalAPIError as e:
            failed.append("metro"); logger.error("metro area %d: %s", area_id, e)
        try:
            infra.train_station_count = await _fetch_train_stations(lat, lon, rad)
        except ExternalAPIError as e:
            failed.append("trains"); logger.error("trains area %d: %s", area_id, e)

        # supermarkets
        infra.infra_status = "fetching_supermarkets"; db.commit()
        try:
            infra.supermarket_count = await _fetch_supermarkets(lat, lon, rad)
        except ExternalAPIError as e:
            failed.append("supermarkets"); logger.error("supermarkets area %d: %s", area_id, e)

        # lifestyle
        infra.infra_status = "fetching_lifestyle"; db.commit()
        try:
            infra.restaurant_count = await _fetch_restaurants(lat, lon, rad)
        except ExternalAPIError as e:
            failed.append("restaurants"); logger.error("restaurants area %d: %s", area_id, e)
        try:
            infra.cafe_count = await _fetch_cafes(lat, lon, rad)
        except ExternalAPIError as e:
            failed.append("cafes"); logger.error("cafes area %d: %s", area_id, e)
        try:
            infra.gym_count = await _fetch_gyms(lat, lon, rad)
        except ExternalAPIError as e:
            failed.append("gyms"); logger.error("gyms area %d: %s", area_id, e)
        try:
            infra.bar_count = await _fetch_bars(lat, lon, rad)
        except ExternalAPIError as e:
            failed.append("bars"); logger.error("bars area %d: %s", area_id, e)

        infra.failed_categories = json.dumps(failed) if failed else None
        infra.last_updated = datetime.now(timezone.utc)
        if len(failed) >= 8:
            infra.infra_status = "failed"
            infra.error_message = "Most categories failed. Overpass API may be unavailable."
        elif failed:
            infra.infra_status = "partial"
            infra.error_message = f"Some categories failed: {failed}"
        else:
            infra.infra_status = "ready"
            infra.error_message = None
        db.commit()
        db.refresh(infra)
        logger.info("BG fetch complete area %d: status=%s failed=%s", area_id, infra.infra_status, failed)

    except Exception as exc:
        logger.exception("Unexpected BG fetch error area %d", area_id)
        if infra is not None:
            try:
                infra.infra_status = "failed"
                infra.error_message = str(exc)
                db.commit()
            except Exception:
                pass
    finally:
        db.close()


# ── Cache-aware get (for scoring routes that need immediate blocks) ────────────

async def get_infrastructure_for_area(
    area: "Area", db: Session, force_refresh: bool = False
) -> InfrastructureData:
    """
    Return InfrastructureData for an area, using cache if fresh.
    Fetches in parallel if refresh needed.
    """
    infra = db.query(InfrastructureData).filter(InfrastructureData.area_id == area.id).first()

    if infra and not force_refresh:
        status = getattr(infra, "infra_status", "ready")
        ttl = timedelta(hours=settings.CACHE_TTL_HOURS)
        if (
            status in ("ready", "partial") and infra.last_updated
            and datetime.now(timezone.utc) < infra.last_updated.replace(tzinfo=timezone.utc) + ttl
        ):
            logger.info("Cached infra for %s", area.name)
            return infra

    try:
        counts = await fetch_all_counts_single_query(
            lat=area.center_lat, lon=area.center_lon, radius=area.radius_meters or 2000
        )
    except ExternalAPIError as exc:
        logger.error("Overpass error for %s: %s", area.name, exc)
        if infra:
            logger.warning("Returning stale cache for %s", area.name)
            return infra
        raise

    if infra:
        for key, value in counts.items():
            if hasattr(infra, key):
                setattr(infra, key, value)
        infra.last_updated = datetime.now(timezone.utc)
        infra.infra_status = "ready"
        infra.error_message = None
        infra.failed_categories = None
    else:
        safe = {k: v for k, v in counts.items() if hasattr(InfrastructureData, k)}
        infra = InfrastructureData(
            area_id=area.id, **safe,
            last_updated=datetime.now(timezone.utc),
            infra_status="ready",
        )
        db.add(infra)

    db.commit()
    db.refresh(infra)
    return infra