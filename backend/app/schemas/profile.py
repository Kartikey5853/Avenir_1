"""
Profile request/response schemas.

Five Yes/No lifestyle preference questions drive scoring weights.
"""

from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ProfileCreate(BaseModel):
    # 4 scoring-preference questions
    has_children:               bool = False   # Q1 — schools weight high
    relies_on_public_transport: bool = False   # Q2 — transport weight high; False = has vehicle
    prefers_vibrant_lifestyle:  bool = False   # Q3 — lifestyle weight high
    safety_priority:            bool = False   # Q4 — safety weight high
    # kept for display / backwards compat
    profile_picture: Optional[str] = None


class ProfileUpdate(BaseModel):
    has_children:               Optional[bool] = None
    relies_on_public_transport: Optional[bool] = None
    prefers_vibrant_lifestyle:  Optional[bool] = None
    safety_priority:            Optional[bool] = None
    profile_picture:            Optional[str]  = None


class ProfileResponse(BaseModel):
    id: int
    user_id: int
    has_children:               bool = False
    relies_on_public_transport: bool = False
    prefers_vibrant_lifestyle:  bool = False
    safety_priority:            bool = False
    profile_picture: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str