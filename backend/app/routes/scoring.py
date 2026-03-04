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
from app.models.infrastructure import InfrastructureData
from app.schemas.scoring import ScoreResponse, CategoryScores
from app.services.overpass_service import get_infrastructure_for_area
from app.services.map_view_fetch_logic import fetch_map_data
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
        "has_children":               bool(p.has_children),
        "relies_on_public_transport": bool(getattr(p, "relies_on_public_transport", False)),
        "prefers_vibrant_lifestyle":  bool(getattr(p, "prefers_vibrant_lifestyle",  False)),
        "safety_priority":            bool(getattr(p, "safety_priority",            False)),
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
        counts = await fetch_map_data(lat=lat, lon=lon)
    except Exception as exc:
        logger.error("Overpass error custom (%s, %s): %s", lat, lon, exc)
        raise HTTPException(
            status_code=503,
            detail={"status": "failed", "message": "Infrastructure service temporarily unavailable."},
        )

    profile_orm: UserProfile | None = None
    if current_user:
        profile_orm = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()

    result = compute_final_score(counts, profile=_profile_to_dict(profile_orm), radius=2000)

    return ScoreResponse(
        area_id=0,
        area_name=f"Custom ({lat:.4f}, {lon:.4f})",
        overall_score=result["overall_score"],
        category_scores=CategoryScores(**result["category_scores"]),
        weights=result["weights"],
        summary=result["summary"],
        highlights=result["highlights"],
        concerns=result["concerns"],
        counts=counts,
        radius_m=2000,
    )


@router.post("/score/recommend")
async def get_ai_recommendation(
    body: dict,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    """
    Generate an AI recommendation for a locality based on score data and profile.
    Body: locality_name, overall_score, category_scores, lat (optional), lon (optional)
    """
    # If no profile_context provided, use the logged-in user's profile
    profile_ctx = body.get("profile_context")
    if profile_ctx is None and current_user:
        from app.models.profile import UserProfile as _UP
        prof_orm = db.query(_UP).filter(_UP.user_id == current_user.id).first()
        if prof_orm:
            profile_ctx = _profile_to_dict(prof_orm)

    lat = body.get("lat")
    lon = body.get("lon")
    recommendation = await get_gemini_recommendation(
        lat=float(lat) if lat is not None else None,
        lon=float(lon) if lon is not None else None,
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
    Fetches live OSM data via the race service; falls back to DB cache if unavailable.
    """
    area = db.query(Area).filter(Area.id == area_id).first()
    if not area:
        raise HTTPException(status_code=404, detail="Area not found")

    radius = area.radius_meters or 2000

    # Try live fetch first (same race service as custom score)
    counts: dict | None = None
    try:
        counts = await fetch_map_data(lat=area.center_lat, lon=area.center_lon)
    except Exception as exc:
        logger.warning("Live fetch failed for area %d, falling back to DB: %s", area_id, exc)

    # Fall back to DB cached counts if live fetch failed
    if counts is None:
        infra = db.query(InfrastructureData).filter(InfrastructureData.area_id == area_id).first()
        if infra is None:
            raise HTTPException(
                status_code=503,
                detail={"status": "failed", "message": "Infrastructure data unavailable. Please try again."},
            )
        from app.services.scoring_engine import _COLUMN_KEYS
        counts = {col: getattr(infra, col, 0) or 0 for col in _COLUMN_KEYS}

    profile_orm: UserProfile | None = None
    if current_user:
        profile_orm = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()

    result = compute_final_score(counts, profile=_profile_to_dict(profile_orm), radius=radius)

    return ScoreResponse(
        area_id=area.id,
        area_name=area.name,
        overall_score=result["overall_score"],
        category_scores=CategoryScores(**result["category_scores"]),
        weights=result["weights"],
        summary=result["summary"],
        highlights=result["highlights"],
        concerns=result["concerns"],
        counts=counts,
        radius_m=radius,
    )
