"""
UserProfile model – stores lifestyle preferences for scoring.
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.database import Base


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    marital_status = Column(String(20), nullable=False, default="single")  # single / married
    has_parents = Column(Boolean, default=False)
    employment_status = Column(String(20), nullable=False, default="working")  # student / working / unemployed
    income_range = Column(String(40), nullable=True, default="prefer_not_to_say")  # dropdown selection
    additional_info = Column(Text, nullable=True)  # free text for more context
    has_vehicle = Column(Boolean, default=False)  # owns vehicle for commute
    has_elderly = Column(Boolean, default=False)  # lives with elderly people
    has_children = Column(Boolean, default=False)  # has children
    profile_picture = Column(Text, nullable=True)  # base64 or URL of profile pic
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="profile")