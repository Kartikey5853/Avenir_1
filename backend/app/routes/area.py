"""
Areas router – list and retrieve Hyderabad areas.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.area import Area
from app.schemas.area import AreaResponse, AreaListResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/areas", tags=["Areas"])


@router.get("", response_model=AreaListResponse)
def list_areas(db: Session = Depends(get_db)):
    """Return all predefined Hyderabad areas."""
    areas = db.query(Area).all()
    return AreaListResponse(areas=[AreaResponse.model_validate(a) for a in areas])


@router.get("/{area_id}", response_model=AreaResponse)
def get_area(area_id: int, db: Session = Depends(get_db)):
    """Get a single area by ID."""
    area = db.query(Area).filter(Area.id == area_id).first()
    if not area:
        raise HTTPException(status_code=404, detail="Area not found")
    return AreaResponse.model_validate(area)