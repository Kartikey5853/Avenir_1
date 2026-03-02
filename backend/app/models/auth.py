"""
User model – stores authentication data.
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    is_profile_completed = Column(Boolean, default=False)
    reset_token = Column(String(255), nullable=True)
    reset_token_expires = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    email_verified = Column(Boolean, default=False)
    two_factor_enabled = Column(Boolean, default=False)


    # Relationship to profile
    profile = relationship("UserProfile", back_populates="user", uselist=False)
    otps = relationship("OTP", back_populates="user", cascade="all, delete-orphan")