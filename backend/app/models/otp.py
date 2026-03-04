from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.database import Base


class OTP(Base):
    __tablename__ = "otps"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    otp_code = Column(String(6), nullable=False)
    purpose = Column(String(50), nullable=False)  
    # values: "email_verification", "login_2fa", "password_reset"

    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    attempts = Column(Integer, default=0)
    max_attempts = Column(Integer, default=5)
    locked_until = Column(DateTime, nullable=True)

    

    user = relationship("User", back_populates="otps")
    