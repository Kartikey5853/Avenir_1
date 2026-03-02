"""
Infrastructure response schemas.
"""

from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List


class InfrastructureResponse(BaseModel):
    area_id: int
    area_name: str
    hospital_count: int
    school_count: int
    bus_stop_count: int
    metro_count: int
    supermarket_count: int
    restaurant_count: int
    gym_count: int = 0
    bar_count: int = 0
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