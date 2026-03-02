"""
Scoring router – compute and return lifestyle scores for areas.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.area import Area
from app.models.auth import User
from app.models.profile import UserProfile
from app.models.infrastructure import InfrastructureData
from app.schemas.scoring import ScoreResponse
from app.services.overpass_service import get_infrastructure_for_area, fetch_from_overpass
from app.services.scoring_engine import compute_final_score
from app.services.gemini_services import get_gemini_recommendation
from app.utils.security import get_optional_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/areas", tags=["Scoring"])


@router.get("/score/custom", response_model=ScoreResponse)
async def get_custom_score(
    lat: float = Query(..., description="Latitude"),
    lon: float = Query(..., description="Longitude"),
    radius: int = Query(2000, description="Radius in meters"),
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    """
    Compute lifestyle score for any custom location on the map.
    Fetches infrastructure from Overpass for the given lat/lon/radius.
    """
    try:
        counts = await fetch_from_overpass(lat=lat, lon=lon, radius=radius)
    except Exception as e:
        logger.error(f"Overpass API error for custom location ({lat}, {lon}): {e}")
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

    # Create a temporary InfrastructureData object (not persisted)
    infra = InfrastructureData(**counts)

    profile = None
    if current_user:
        profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()

    result = compute_final_score(infra, profile)

    return ScoreResponse(
        area_id=0,
        area_name=f"Custom ({lat:.4f}, {lon:.4f})",
        final_score=result["final_score"],
        category_scores=result["category_scores"],
        weights_used=result["weights_used"],
        infrastructure=result["infrastructure"],
        profile_context=result["profile_context"],
    )


@router.post("/score/recommend")
async def get_ai_recommendation(
    body: dict,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    """
    Generate an AI recommendation for a locality based on score data and profile.
    Body expects: locality_name, final_score, category_scores, infrastructure, profile_context
    """
    recommendation = await get_gemini_recommendation(
        locality_name=body.get("locality_name", "Unknown"),
        final_score=body.get("final_score", 0),
        category_scores=body.get("category_scores", {}),
        infrastructure=body.get("infrastructure", {}),
        profile=body.get("profile_context"),
    )
    return {"recommendation": recommendation}


@router.get("/{area_id}/score", response_model=ScoreResponse)
async def get_area_score(
    area_id: int,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    """
    Compute the lifestyle score for a predefined area.
    """
    area = db.query(Area).filter(Area.id == area_id).first()
    if not area:
        raise HTTPException(status_code=404, detail="Area not found")

    infra = await get_infrastructure_for_area(area, db)

    profile = None
    if current_user:
        profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()

    result = compute_final_score(infra, profile)

    return ScoreResponse(
        area_id=area.id,
        area_name=area.name,
        final_score=result["final_score"],
        category_scores=result["category_scores"],
        weights_used=result["weights_used"],
        infrastructure=result["infrastructure"],
        profile_context=result["profile_context"],
    )