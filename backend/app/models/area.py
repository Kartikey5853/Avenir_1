"""
Area model – predefined Hyderabad neighborhoods.
"""

from sqlalchemy import Column, Integer, String, Float, Text, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.database import Base


class Area(Base):
    __tablename__ = "areas"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    center_lat = Column(Float, nullable=False)
    center_lon = Column(Float, nullable=False)
    boundary_type = Column(String(20), default="circle")  # circle / polygon
    radius_meters = Column(Integer, nullable=True, default=2000)
    polygon_geojson = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    infrastructure = relationship("InfrastructureData", back_populates="area", uselist=False)