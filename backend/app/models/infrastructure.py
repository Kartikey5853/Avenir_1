"""
InfrastructureData model – cached facility counts from Overpass API.
"""

from sqlalchemy import Column, Integer, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.database import Base


class InfrastructureData(Base):
    __tablename__ = "infrastructure_data"

    id = Column(Integer, primary_key=True, index=True)
    area_id = Column(Integer, ForeignKey("areas.id"), unique=True, nullable=False)
    hospital_count = Column(Integer, default=0)
    school_count = Column(Integer, default=0)
    bus_stop_count = Column(Integer, default=0)
    metro_count = Column(Integer, default=0)
    supermarket_count = Column(Integer, default=0)
    restaurant_count = Column(Integer, default=0)
    gym_count = Column(Integer, default=0)
    bar_count = Column(Integer, default=0)
    last_updated = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    area = relationship("Area", back_populates="infrastructure")