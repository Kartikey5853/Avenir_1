from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services.map_view_fetch_logic import fetch_map_data
import logging

router = APIRouter(tags=["Map View"])
logger = logging.getLogger("map_view")


class MapViewRequest(BaseModel):
    lat: float
    lon: float


@router.post("/map-view/data")
async def map_view_data(request: MapViewRequest):
    """
    Map View — fetch all 13 amenity category counts for a given lat/lon.
    Radius is fixed to 2000 m. Uses fastest-response race across 3 Overpass endpoints.
    """
    try:
        data = await fetch_map_data(request.lat, request.lon)
        return data
    except Exception as e:
        logger.error("Map view fetch failed: %s", e)
        raise HTTPException(status_code=502, detail="Map data fetch failed.")
