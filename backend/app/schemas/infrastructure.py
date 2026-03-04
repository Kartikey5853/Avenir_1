"""
Infrastructure response schemas.
"""

from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List


class InfrastructureResponse(BaseModel):
    area_id: int
    area_name: str
    hospital_count: int = 0
    school_count: int = 0
    bus_stop_count: int = 0
    metro_count: int = 0
    supermarket_count: int = 0
    restaurant_count: int = 0
    gym_count: int = 0
    bar_count: int = 0
    # New categories
    police_count: int = 0
    fire_station_count: int = 0
    park_count: int = 0
    cafe_count: int = 0
    train_station_count: int = 0
    last_updated: Optional[datetime] = None

    model_config = {"from_attributes": True}


class FacilityLocation(BaseModel):
    name: str | None = None
    lat: float
    lon: float
    type: str


class InfrastructureWithLocationsResponse(InfrastructureResponse):
    hospitals: List[FacilityLocation] = []
    schools: List[FacilityLocation] = []
    bus_stops: List[FacilityLocation] = []
    metro_stations: List[FacilityLocation] = []
    supermarkets: List[FacilityLocation] = []
    restaurants: List[FacilityLocation] = []
    gyms: List[FacilityLocation] = []
    bars: List[FacilityLocation] = []
    # New categories
    police: List[FacilityLocation] = []
    fire_stations: List[FacilityLocation] = []
    parks: List[FacilityLocation] = []
    cafes: List[FacilityLocation] = []
    train_stations: List[FacilityLocation] = []

class AreaStatusResponse(BaseModel):
    """Polling response for frontend progress tracking."""
    area_id: int
    area_name: str
    status: str          # pending | fetching_* | ready | partial | failed
    completed: List[str] = []
    pending: List[str] = []
    failed_categories: List[str] = []
    error_message: Optional[str] = None
    last_updated: Optional[datetime] = None

    model_config = {"from_attributes": True}