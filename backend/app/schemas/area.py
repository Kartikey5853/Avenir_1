"""
Area request/response schemas.
"""

from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class AreaResponse(BaseModel):
    id: int
    name: str
    center_lat: float
    center_lon: float
    boundary_type: str
    radius_meters: Optional[int] = None

    model_config = {"from_attributes": True}


class AreaListResponse(BaseModel):
    areas: list[AreaResponse]