"""
Overpass API integration service.
Fetches infrastructure data (hospitals, schools, bus stops, metro stations,
supermarkets, restaurants) for a given area from OpenStreetMap.
"""

import logging
import httpx
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from app.models.area import Area
from app.models.infrastructure import InfrastructureData
from app.config import settings

logger = logging.getLogger(__name__)


def build_overpass_query(lat: float, lon: float, radius: int) -> str:
    """
    Build an Overpass QL query to fetch all infrastructure categories
    within a circular area defined by lat, lon, and radius (meters).

    Categories queried:
    - Hospitals: amenity=hospital OR amenity=clinic
    - Schools: amenity=school
    - Bus stops: highway=bus_stop OR public_transport=platform + bus
    - Metro stations: station=subway OR railway=station
    - Supermarkets: shop=supermarket
    - Restaurants: amenity=restaurant OR amenity=fast_food
    """
    around = f"around:{radius},{lat},{lon}"
    query = f"""
[out:json][timeout:30];
(
  // Hospitals & clinics
  node["amenity"="hospital"]({around});
  way["amenity"="hospital"]({around});
  node["amenity"="clinic"]({around});
  way["amenity"="clinic"]({around});
);
out count;

(
  // Schools
  node["amenity"="school"]({around});
  way["amenity"="school"]({around});
);
out count;

(
  // Bus stops
  node["highway"="bus_stop"]({around});
  node["public_transport"="platform"]["bus"="yes"]({around});
);
out count;

(
  // Metro / railway stations
  node["station"="subway"]({around});
  node["railway"="station"]({around});
  way["railway"="station"]({around});
);
out count;

(
  // Supermarkets
  node["shop"="supermarket"]({around});
  way["shop"="supermarket"]({around});
);
out count;

(
  // Restaurants & fast food
  node["amenity"="restaurant"]({around});
  node["amenity"="fast_food"]({around});
  way["amenity"="restaurant"]({around});
);
out count;

(
  // Gyms & fitness centres
  node["leisure"="fitness_centre"]({around});
  way["leisure"="fitness_centre"]({around});
  node["leisure"="sports_centre"]({around});
  way["leisure"="sports_centre"]({around});
);
out count;

(
  // Bars & pubs
  node["amenity"="bar"]({around});
  node["amenity"="pub"]({around});
  way["amenity"="bar"]({around});
  way["amenity"="pub"]({around});
);
out count;
"""
    return query.strip()


def build_overpass_query_with_locations(lat: float, lon: float, radius: int) -> str:
    around = f"around:{radius},{lat},{lon}"
    query = f"""
[out:json][timeout:30];
// Hospitals & clinics
(
  node["amenity"="hospital"]({around});
  way["amenity"="hospital"]({around});
  node["amenity"="clinic"]({around});
  way["amenity"="clinic"]({around});
);
out center;
// Schools
(
  node["amenity"="school"]({around});
  way["amenity"="school"]({around});
);
out center;
// Bus stops
(
  node["highway"="bus_stop"]({around});
  node["public_transport"="platform"]["bus"="yes"]({around});
);
out center;
// Metro stations
(
  node["station"="subway"]({around});
  node["railway"="station"]({around});
  way["railway"="station"]({around});
);
out center;
// Supermarkets
(
  node["shop"="supermarket"]({around});
  way["shop"="supermarket"]({around});
);
out center;
// Restaurants
(
  node["amenity"="restaurant"]({around});
  node["amenity"="fast_food"]({around});
  way["amenity"="restaurant"]({around});
);
out center;
// Gyms
(
  node["leisure"="fitness_centre"]({around});
  way["leisure"="fitness_centre"]({around});
  node["leisure"="sports_centre"]({around});
  way["leisure"="sports_centre"]({around});
);
out center;
// Bars
(
  node["amenity"="bar"]({around});
  node["amenity"="pub"]({around});
  way["amenity"="bar"]({around});
  way["amenity"="pub"]({around});
);
out center;
"""
    return query.strip()


def parse_overpass_counts(data: dict) -> dict:
    """
    Parse the Overpass API JSON response to extract counts for each category.
    The query uses 'out count' which returns elements with tags like 'total'.
    Each category block returns one count element.
    """
    elements = data.get("elements", [])

    # Each 'out count' produces one element with tags.total
    counts = []
    for el in elements:
        if el.get("type") == "count":
            total = int(el.get("tags", {}).get("total", 0))
            counts.append(total)

    # We expect 8 count blocks: hospitals, schools, bus_stops, metro, supermarkets, restaurants, gyms, bars
    while len(counts) < 8:
        counts.append(0)

    return {
        "hospital_count": counts[0],
        "school_count": counts[1],
        "bus_stop_count": counts[2],
        "metro_count": counts[3],
        "supermarket_count": counts[4],
        "restaurant_count": counts[5],
        "gym_count": counts[6],
        "bar_count": counts[7],
    }


OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]


async def fetch_from_overpass(lat: float, lon: float, radius: int, max_retries: int = 3) -> dict:
    """
    Make an async HTTP request to the Overpass API and return parsed counts.
    Implements retry logic with multiple endpoints and increasing radius
    to handle cases where the API returns all zeros.
    """
    query = build_overpass_query(lat, lon, radius)
    logger.info(f"Fetching Overpass data for ({lat}, {lon}) radius={radius}m")

    last_counts = None
    for attempt in range(max_retries):
        # Rotate through endpoints on retries
        endpoint = OVERPASS_ENDPOINTS[attempt % len(OVERPASS_ENDPOINTS)]
        current_radius = radius + (attempt * 500)  # Increase radius by 500m each retry
        current_query = build_overpass_query(lat, lon, current_radius) if attempt > 0 else query

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    endpoint,
                    data={"data": current_query},
                )
                response.raise_for_status()
                data = response.json()

            counts = parse_overpass_counts(data)
            total = sum(counts.values())

            if total > 0:
                logger.info(f"Overpass counts (attempt {attempt + 1}, radius={current_radius}m): {counts}")
                return counts

            last_counts = counts
            logger.warning(
                f"Overpass returned all zeros (attempt {attempt + 1}/{max_retries}, "
                f"radius={current_radius}m, endpoint={endpoint}). Retrying..."
            )

        except Exception as e:
            logger.warning(f"Overpass attempt {attempt + 1} failed ({endpoint}): {e}")
            last_counts = last_counts or {
                "hospital_count": 0, "school_count": 0, "bus_stop_count": 0,
                "metro_count": 0, "supermarket_count": 0, "restaurant_count": 0,
                "gym_count": 0, "bar_count": 0,
            }

    logger.error(f"All {max_retries} Overpass attempts returned zeros/failed for ({lat}, {lon})")
    return last_counts or {
        "hospital_count": 0, "school_count": 0, "bus_stop_count": 0,
        "metro_count": 0, "supermarket_count": 0, "restaurant_count": 0,
        "gym_count": 0, "bar_count": 0,
    }


async def fetch_facility_locations(lat: float, lon: float, radius: int, max_per_category: int = 50, max_retries: int = 3) -> dict:
    """
    Fetch facility locations for each category (nodes and ways) from Overpass.
    Retries with multiple endpoints on error (504, connection, etc.).
    Returns a dict of lists of FacilityLocation dicts.
    """
    from app.schemas.infrastructure import FacilityLocation
    query = build_overpass_query_with_locations(lat, lon, radius)
    last_error = None
    for attempt in range(max_retries):
        endpoint = OVERPASS_ENDPOINTS[attempt % len(OVERPASS_ENDPOINTS)]
        try:
            async with httpx.AsyncClient(timeout=90.0) as client:
                response = await client.post(endpoint, data={"data": query})
                response.raise_for_status()
                data = response.json()
            elements = data.get("elements", [])
            cats = {
                "hospitals": [],
                "schools": [],
                "bus_stops": [],
                "metro_stations": [],
                "supermarkets": [],
                "restaurants": [],
                "gyms": [],
                "bars": [],
            }
            cat_keys = list(cats.keys())
            # Overpass returns all elements in a single list; we must split by blocks
            # Find indices where each block starts (by Overpass 'out center' block size)
            block_indices = []
            block_size = len(elements) // len(cat_keys) if len(cat_keys) > 0 else 0
            for i in range(len(cat_keys)):
                block_indices.append(i * block_size)
            for i, cat in enumerate(cat_keys):
                start = block_indices[i]
                end = block_indices[i+1] if i+1 < len(block_indices) else len(elements)
                block = elements[start:end]
                for el in block[:max_per_category]:
                    # For ways, use center coordinates
                    if el['type'] == 'way':
                        center = el.get('center')
                        if not center:
                            continue
                        lat_, lon_ = center['lat'], center['lon']
                    else:
                        lat_, lon_ = el['lat'], el['lon']
                    cats[cat].append(FacilityLocation(
                        name=el.get('tags', {}).get('name'),
                        lat=lat_,
                        lon=lon_,
                        type=cat,
                    ))
            # Remove duplicate coordinates within each category
            for cat in cats:
                seen = set()
                unique = []
                for f in cats[cat]:
                    key = (round(f.lat, 6), round(f.lon, 6))
                    if key not in seen:
                        seen.add(key)
                        unique.append(f)
                cats[cat] = unique
            return cats
        except Exception as e:
            last_error = e
            continue
    # If all endpoints fail, raise last error
    raise last_error


async def get_infrastructure_for_area(area: Area, db: Session, force_refresh: bool = False) -> InfrastructureData:
    """
    Get infrastructure data for an area, using cache if available and fresh.

    Caching strategy:
    1. Check if InfrastructureData exists for this area
    2. If exists and last_updated is within CACHE_TTL_HOURS → return cached
    3. Otherwise → fetch from Overpass API, update/create record
    """
    infra = db.query(InfrastructureData).filter(InfrastructureData.area_id == area.id).first()

    # Check if cache is valid
    if infra and not force_refresh:
        cache_expiry = infra.last_updated + timedelta(hours=settings.CACHE_TTL_HOURS)
        if datetime.now(timezone.utc) < cache_expiry.replace(tzinfo=timezone.utc):
            logger.info(f"Using cached infrastructure data for {area.name}")
            return infra

    # Fetch fresh data from Overpass API
    try:
        counts = await fetch_from_overpass(
            lat=area.center_lat,
            lon=area.center_lon,
            radius=area.radius_meters or 2000,
        )
    except Exception as e:
        logger.error(f"Overpass API error for {area.name}: {e}")
        # If we have stale cache, return it as fallback
        if infra:
            logger.warning(f"Returning stale cache for {area.name}")
            return infra

        # Otherwise create a zero-count record
        counts = {
            "hospital_count": 0,
            "school_count": 0,
            "bus_stop_count": 0,
            "metro_count": 0,
            "supermarket_count": 0,
            "restaurant_count": 0,
            "gym_count": 0,
            "bar_count": 0,
        }

    # Update or create infrastructure record
    if infra:
        for key, value in counts.items():
            setattr(infra, key, value)
        infra.last_updated = datetime.now(timezone.utc)
    else:
        infra = InfrastructureData(
            area_id=area.id,
            **counts,
            last_updated=datetime.now(timezone.utc),
        )
        db.add(infra)

    db.commit()
    db.refresh(infra)
    return infra