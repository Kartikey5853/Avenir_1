"""
Profile request/response schemas.
"""

from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ProfileCreate(BaseModel):
    marital_status: str = "single"       # single / married
    has_parents: bool = False
    employment_status: str = "working"   # student / working / unemployed
    income_range: Optional[str] = "prefer_not_to_say"
    additional_info: Optional[str] = None
    has_vehicle: bool = False
    has_elderly: bool = False
    has_children: bool = False
    profile_picture: Optional[str] = None


class ProfileUpdate(BaseModel):
    marital_status: Optional[str] = None
    has_parents: Optional[bool] = None
    employment_status: Optional[str] = None
    income_range: Optional[str] = None
    additional_info: Optional[str] = None
    has_vehicle: Optional[bool] = None
    has_elderly: Optional[bool] = None
    has_children: Optional[bool] = None
    profile_picture: Optional[str] = None


class ProfileResponse(BaseModel):
    id: int
    user_id: int
    marital_status: str
    has_parents: bool
    employment_status: str
    income_range: Optional[str] = None
    additional_info: Optional[str] = None
    has_vehicle: bool = False
    has_elderly: bool = False
    has_children: bool = False
    profile_picture: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str