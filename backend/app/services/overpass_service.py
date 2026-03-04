"""
Overpass API service.

fetch_facility_locations  — race all 3 Overpass endpoints in parallel,
                            return the first valid response per category.
get_infrastructure_for_area — DB-backed infra counts for a named area.
iter_facility_locations_sse — async generator for SSE streaming.
ALL_CATEGORIES              — ordered list of all 13 category keys.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import AsyncIterator, Dict, List, Optional, Any

import httpx
from sqlalchemy.orm import Session

from app.models.area import Area
from app.models.infrastructure import InfrastructureData
from app.utils.exceptions import ExternalAPIError

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.openstreetmap.fr/api/interpreter",
]

RACE_TIMEOUT = 12.0   # seconds per request
FIXED_RADIUS = 2000   # meters

ALL_CATEGORIES: list[str] = [
    "hospitals", "schools", "police", "fire_stations", "parks",
    "bus_stops", "metro_stations", "train_stations",
    "supermarkets", "restaurants", "cafes", "gyms", "bars",
]

# ── Category query definitions ─────────────────────────────────────────────────

def _category_query(category: str, lat: float, lon: float, radius: int) -> str:
    """Build an Overpass QL query that returns node/way locations for a category."""
    a = f"around:{radius},{lat},{lon}"
    tag_map: Dict[str, list[str]] = {
        "hospitals":     [f'node["amenity"="hospital"]({a});', f'way["amenity"="hospital"]({a});',
                          f'node["amenity"="clinic"]({a});', f'way["amenity"="clinic"]({a});'],
        "schools":       [f'node["amenity"="school"]({a});', f'way["amenity"="school"]({a});'],
        "police":        [f'node["amenity"="police"]({a});', f'way["amenity"="police"]({a});'],
        "fire_stations": [f'node["amenity"="fire_station"]({a});', f'way["amenity"="fire_station"]({a});'],
        "parks":         [f'node["leisure"="park"]({a});', f'way["leisure"="park"]({a});'],
        "bus_stops":     [f'node["highway"="bus_stop"]({a});',
                          f'node["public_transport"="platform"]["bus"="yes"]({a});'],
        "metro_stations":[f'node["station"="subway"]({a});', f'node["railway"="subway_entrance"]({a});'],
        "train_stations":[f'node["railway"="station"]({a});', f'way["railway"="station"]({a});'],
        "supermarkets":  [f'node["shop"="supermarket"]({a});', f'way["shop"="supermarket"]({a});'],
        "restaurants":   [f'node["amenity"="restaurant"]({a});', f'way["amenity"="restaurant"]({a});',
                          f'node["amenity"="fast_food"]({a});', f'way["amenity"="fast_food"]({a});'],
        "cafes":         [f'node["amenity"="cafe"]({a});', f'way["amenity"="cafe"]({a});'],
        "gyms":          [f'node["leisure"="fitness_centre"]({a});', f'way["leisure"="fitness_centre"]({a});',
                          f'node["leisure"="sports_centre"]({a});', f'way["leisure"="sports_centre"]({a});'],
        "bars":          [f'node["amenity"="bar"]({a});', f'way["amenity"="bar"]({a});',
                          f'node["amenity"="pub"]({a});', f'way["amenity"="pub"]({a});'],
    }
    filters = "\n  ".join(tag_map.get(category, []))
    return f"[out:json][timeout:25];\n(\n  {filters}\n);\nout center;"


def _build_combined_query(lat: float, lon: float, radius: int) -> tuple[str, list[str]]:
    """Single combined count query for all 13 categories."""
    a = f"around:{radius},{lat},{lon}"
    sections: list[tuple[str, list[str]]] = [
        ("hospitals",     [f'node["amenity"="hospital"]({a});', f'way["amenity"="hospital"]({a});',
                           f'node["amenity"="clinic"]({a});', f'way["amenity"="clinic"]({a});']),
        ("police",        [f'node["amenity"="police"]({a});', f'way["amenity"="police"]({a});']),
        ("fire_stations", [f'node["amenity"="fire_station"]({a});', f'way["amenity"="fire_station"]({a});']),
        ("schools",       [f'node["amenity"="school"]({a});', f'way["amenity"="school"]({a});']),
        ("parks",         [f'node["leisure"="park"]({a});', f'way["leisure"="park"]({a});']),
        ("train_stations",[f'node["railway"="station"]({a});', f'way["railway"="station"]({a});']),
        ("metro_stations",[f'node["station"="subway"]({a});', f'node["railway"="subway_entrance"]({a});']),
        ("bus_stops",     [f'node["highway"="bus_stop"]({a});', f'node["public_transport"="platform"]["bus"="yes"]({a});']),
        ("restaurants",   [f'node["amenity"="restaurant"]({a});', f'way["amenity"="restaurant"]({a});',
                           f'node["amenity"="fast_food"]({a});', f'way["amenity"="fast_food"]({a});']),
        ("cafes",         [f'node["amenity"="cafe"]({a});', f'way["amenity"="cafe"]({a});']),
        ("gyms",          [f'node["leisure"="fitness_centre"]({a});', f'way["leisure"="fitness_centre"]({a});',
                           f'node["leisure"="sports_centre"]({a});', f'way["leisure"="sports_centre"]({a});']),
        ("bars",          [f'node["amenity"="bar"]({a});', f'way["amenity"="bar"]({a});',
                           f'node["amenity"="pub"]({a});', f'way["amenity"="pub"]({a});']),
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


# ── Race fetch helpers ─────────────────────────────────────────────────────────

async def _race_query(query: str, timeout: float = RACE_TIMEOUT) -> dict:
    """
    POST *query* to all OVERPASS_ENDPOINTS simultaneously.
    Return the JSON from the fastest successful response.
    Raises ExternalAPIError if all fail.
    """
    start = time.monotonic()
    logger.info("[OVERPASS RACE] Querying %d endpoints concurrently", len(OVERPASS_ENDPOINTS))
    for ep in OVERPASS_ENDPOINTS:
        logger.info("[OVERPASS RACE]  → %s", ep)

    async with httpx.AsyncClient() as client:

        async def _fetch(ep: str) -> Optional[dict]:
            try:
                resp = await client.post(ep, data={"data": query}, timeout=timeout)
                resp.raise_for_status()
                elapsed = time.monotonic() - start
                logger.info("[OVERPASS RACE] ← %s  (%.2fs)", ep, elapsed)
                return {"ep": ep, "data": resp.json()}
            except Exception as exc:
                elapsed = time.monotonic() - start
                logger.warning("[OVERPASS RACE] ✗ %s  (%.2fs) — %s", ep, elapsed, exc)
                return None

        tasks = {asyncio.create_task(_fetch(ep), name=ep) for ep in OVERPASS_ENDPOINTS}
        pending = set(tasks)

        while pending:
            done, pending = await asyncio.wait(pending, return_when=asyncio.FIRST_COMPLETED)
            for t in done:
                result = t.result()
                if result and "data" in result:
                    elapsed = time.monotonic() - start
                    logger.info(
                        "[OVERPASS RACE] ✓ Winner: %s  (%.2fs) — cancelling %d pending",
                        result["ep"], elapsed, len(pending),
                    )
                    for p in pending:
                        p.cancel()
                    return result["data"]

    raise ExternalAPIError("Overpass", "All endpoints failed or timed out")


def _parse_locations(data: dict, category: str) -> list[dict]:
    """Extract lat/lon/name from an Overpass 'out center' response."""
    locations = []
    for el in data.get("elements", []):
        lat = el.get("lat") or (el.get("center") or {}).get("lat")
        lon = el.get("lon") or (el.get("center") or {}).get("lon")
        if lat is None or lon is None:
            continue
        tags = el.get("tags", {})
        name = tags.get("name") or tags.get("name:en")
        locations.append({"lat": lat, "lon": lon, "name": name, "type": category})
    return locations


# ── Public API ─────────────────────────────────────────────────────────────────

async def fetch_facility_locations(
    lat: float, lon: float, radius: int
) -> Dict[str, list[dict]]:
    """
    Fetch facility map-pin locations for all 13 categories.
    Each category races all 3 Overpass endpoints.
    Returns {category_key: [{lat, lon, name, type}, ...]}
    """
    radius = radius or FIXED_RADIUS
    results: Dict[str, list[dict]] = {}

    async def _fetch_cat(cat: str):
        q = _category_query(cat, lat, lon, radius)
        try:
            data = await _race_query(q)
            results[cat] = _parse_locations(data, cat)
            logger.info("[FACILITY] %s → %d locations", cat, len(results[cat]))
        except Exception as exc:
            logger.warning("[FACILITY] %s failed: %s", cat, exc)
            results[cat] = []

    await asyncio.gather(*[_fetch_cat(cat) for cat in ALL_CATEGORIES])
    return results


async def get_infrastructure_for_area(area: Area, db: Session) -> InfrastructureData:
    """
    Return InfrastructureData for a named area from the DB (cache).
    Creates an empty record if none exists.
    """
    from datetime import datetime, timezone, timedelta
    infra = db.query(InfrastructureData).filter(InfrastructureData.area_id == area.id).first()
    if infra is None:
        infra = InfrastructureData(area_id=area.id, infra_status="pending")
        db.add(infra)
        db.commit()
        db.refresh(infra)
    return infra


async def iter_facility_locations_sse(
    lat: float, lon: float, radius: int
) -> AsyncIterator[dict]:
    """
    Async generator that yields one SSE-ready dict per category as it completes.
    Frontend can render map pins progressively.
    """
    radius = radius or FIXED_RADIUS
    queue: asyncio.Queue[Optional[dict]] = asyncio.Queue()
    total = len(ALL_CATEGORIES)
    done_count = 0

    async def _fetch_cat(cat: str):
        q = _category_query(cat, lat, lon, radius)
        try:
            data = await _race_query(q)
            locs = _parse_locations(data, cat)
        except Exception as exc:
            logger.warning("[SSE] %s failed: %s", cat, exc)
            locs = []
        await queue.put({"category": cat, "locations": locs})

    tasks = [asyncio.create_task(_fetch_cat(cat)) for cat in ALL_CATEGORIES]

    while done_count < total:
        item = await asyncio.wait_for(queue.get(), timeout=30.0)
        done_count += 1
        yield item

    for t in tasks:
        if not t.done():
            t.cancel()
