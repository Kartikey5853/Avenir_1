"""
Infrastructure router – fetch infrastructure data for an area.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.area import Area
from app.schemas.infrastructure import InfrastructureResponse
from app.services.overpass_service import get_infrastructure_for_area
from app.schemas.infrastructure import InfrastructureWithLocationsResponse
from app.services.overpass_service import fetch_facility_locations

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/areas", tags=["Infrastructure"])

# List of 5 main area IDs (update as needed)
MAIN_AREA_IDS = [1, 2, 3, 4, 5 ,6]

@router.get("/{area_id}/infrastructure", response_model=InfrastructureResponse)
async def get_area_infrastructure(area_id: int, db: Session = Depends(get_db)):
    """
    Get infrastructure data for a specific area.
    Uses caching – fetches from Overpass API if cache is stale or missing.
    """
    area = db.query(Area).filter(Area.id == area_id).first()
    if not area:
        raise HTTPException(status_code=404, detail="Area not found")

    infra = await get_infrastructure_for_area(area, db)

    return InfrastructureResponse(
        area_id=area.id,
        area_name=area.name,
        hospital_count=infra.hospital_count,
        school_count=infra.school_count,
        bus_stop_count=infra.bus_stop_count,
        metro_count=infra.metro_count,
        supermarket_count=infra.supermarket_count,
        restaurant_count=infra.restaurant_count,
        gym_count=infra.gym_count,
        bar_count=infra.bar_count,
        last_updated=infra.last_updated,
    )

@router.get("/{area_id}/infrastructure/locations", response_model=InfrastructureWithLocationsResponse)
async def get_area_infrastructure_locations(area_id: int, db: Session = Depends(get_db)):
    """
    Get infrastructure facility locations for a specific area (only for main areas).
    For LB Nagar (id==6), always force Overpass refresh to avoid stale cache.
    """
    if area_id not in MAIN_AREA_IDS:
        raise HTTPException(status_code=403, detail="Facility locations only available for main areas.")
    area = db.query(Area).filter(Area.id == area_id).first()
    if not area:
        raise HTTPException(status_code=404, detail="Area not found")
    force_refresh = (area_id == 6)
    cats = await fetch_facility_locations(area.center_lat, area.center_lon, area.radius_meters or 2000)
    infra = await get_infrastructure_for_area(area, db, force_refresh=force_refresh)
    return InfrastructureWithLocationsResponse(
        area_id=area.id,
        area_name=area.name,
        hospital_count=infra.hospital_count,
        school_count=infra.school_count,
        bus_stop_count=infra.bus_stop_count,
        metro_count=infra.metro_count,
        supermarket_count=infra.supermarket_count,
        restaurant_count=infra.restaurant_count,
        gym_count=infra.gym_count,
        bar_count=infra.bar_count,
        last_updated=infra.last_updated,
        hospitals=cats["hospitals"],
        schools=cats["schools"],
        bus_stops=cats["bus_stops"],
        metro_stations=cats["metro_stations"],
        supermarkets=cats["supermarkets"],
        restaurants=cats["restaurants"],
        gyms=cats["gyms"],
        bars=cats["bars"],
    )