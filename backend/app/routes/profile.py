"""
Profile router – CRUD operations for user lifestyle profile + password change.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.auth import User
from app.models.profile import UserProfile
from app.schemas.profile import ProfileCreate, ProfileUpdate, ProfileResponse, PasswordChangeRequest
from app.utils.security import get_current_user, verify_password, hash_password

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/profile", tags=["Profile"])


@router.get("", response_model=ProfileResponse | None)
def get_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get the current user's lifestyle profile. Returns null if not created."""
    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    if not profile:
        return None
    return profile


@router.post("", response_model=ProfileResponse, status_code=status.HTTP_201_CREATED)
def create_profile(
    req: ProfileCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Create lifestyle profile for the first time.
    Marks is_profile_completed = True on the user.
    """
    existing = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Profile already exists. Use PUT to update.")

    profile = UserProfile(
        user_id=current_user.id,
        marital_status=req.marital_status,
        has_parents=req.has_parents,
        employment_status=req.employment_status,
        income_range=req.income_range,
        additional_info=req.additional_info,
        has_vehicle=req.has_vehicle,
        has_elderly=req.has_elderly,
        has_children=req.has_children,
        profile_picture=req.profile_picture,
    )
    db.add(profile)

    # Mark profile as completed
    current_user.is_profile_completed = True
    db.commit()
    db.refresh(profile)

    logger.info(f"Profile created for user {current_user.id}")
    return profile


@router.put("", response_model=ProfileResponse)
def update_profile(
    req: ProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update existing lifestyle profile."""
    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found. Create one first.")

    # Update only provided fields
    for field in [
        "marital_status", "has_parents", "employment_status",
        "income_range", "additional_info", "has_vehicle",
        "has_elderly", "has_children", "profile_picture",
    ]:
        value = getattr(req, field, None)
        if value is not None:
            setattr(profile, field, value)

    db.commit()
    db.refresh(profile)

    logger.info(f"Profile updated for user {current_user.id}")
    return profile


@router.post("/change-password")
def change_password(
    req: PasswordChangeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change the current user's password."""
    if not verify_password(req.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    current_user.password_hash = hash_password(req.new_password)
    db.commit()
    logger.info(f"Password changed for user {current_user.id}")
    return {"message": "Password changed successfully"}