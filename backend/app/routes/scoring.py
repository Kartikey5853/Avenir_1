"""
Scoring router - Map Viewer (parallel counts) and predefined-area scoring.
"""

from __future__ import annotations

import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.area import Area
from app.models.auth import User
from app.models.profile import UserProfile
from app.schemas.scoring import ScoreResponse, CategoryScores
from app.services.overpass_service import get_infrastructure_for_area, fetch_all_counts_single_query
from app.services.scoring_engine import compute_final_score
from app.services.gemini_services import get_gemini_recommendation
from app.utils.security import get_optional_user
from app.utils.exceptions import ExternalAPIError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/areas", tags=["Scoring"])


def _profile_to_dict(p: UserProfile | None) -> dict | None:
    """Convert ORM UserProfile to scoring-engine boolean flag dict."""
    if p is None:
        return None
    return {
        "has_children":       bool(p.has_children),
        "is_senior":          bool(p.has_elderly),
        "no_car":             not bool(p.has_vehicle),
        "safety_priority":    bool(p.has_children or p.has_elderly),
        "grocery_priority":   False,
        "is_fitness_focused": False,
        "values_nightlife":   False,
    }


@router.get("/score/custom", response_model=ScoreResponse)
async def get_custom_score(
    lat: float = Query(..., description="Latitude"),
    lon: float = Query(..., description="Longitude"),
    radius: int = Query(2000, ge=500, le=15000, description="Radius in metres"),
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    """
    MAP VIEWER - Compute livability score for any lat/lon.
    Fetches all counts in parallel via asyncio.gather.
    Raises 503 if Overpass is unavailable.
    """
    try:
        counts = await fetch_all_counts_single_query(lat=lat, lon=lon, radius=radius)
    except ExternalAPIError as exc:
        logger.error("Overpass error custom (%s, %s): %s", lat, lon, exc)
        raise HTTPException(
            status_code=503,
            detail={"status": "failed", "message": "Infrastructure service temporarily unavailable."},
        )

    profile_orm: UserProfile | None = None
    if current_user:
        profile_orm = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()

    result = compute_final_score(counts, profile=_profile_to_dict(profile_orm), radius=radius)

    return ScoreResponse(
        area_id=0,
        area_name=f"Custom ({lat:.4f}, {lon:.4f})",
        overall_score=result["overall_score"],
        category_scores=CategoryScores(**result["category_scores"]),
        weights=result["weights"],
        summary=result["summary"],
        highlights=result["highlights"],
        concerns=result["concerns"],
        radius_m=radius,
    )


@router.post("/score/recommend")
async def get_ai_recommendation(
    body: dict,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    """
    Generate an AI recommendation for a locality based on score data and profile.
    Body: locality_name, overall_score, category_scores
    """
    recommendation = await get_gemini_recommendation(
        locality_name=body.get("locality_name", "Unknown"),
        final_score=body.get("overall_score", body.get("final_score", 0)),
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
    Compute the livability score for a predefined area.
    Uses cached infra data when fresh; re-fetches in parallel otherwise.
    """
    area = db.query(Area).filter(Area.id == area_id).first()
    if not area:
        raise HTTPException(status_code=404, detail="Area not found")

    try:
        infra = await get_infrastructure_for_area(area, db)
    except ExternalAPIError as exc:
        logger.error("Overpass error for area %d: %s", area_id, exc)
        raise HTTPException(
            status_code=503,
            detail={"status": "failed", "message": "Infrastructure service temporarily unavailable."},
        )

    profile_orm: UserProfile | None = None
    if current_user:
        profile_orm = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()

    radius = area.radius_meters or 2000
    result = compute_final_score(infra, profile=_profile_to_dict(profile_orm), radius=radius)

    return ScoreResponse(
        area_id=area.id,
        area_name=area.name,
        overall_score=result["overall_score"],
        category_scores=CategoryScores(**result["category_scores"]),
        weights=result["weights"],
        summary=result["summary"],
        highlights=result["highlights"],
        concerns=result["concerns"],
        radius_m=radius,
    )
