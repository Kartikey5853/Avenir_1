"""
Seed script – inserts the six core Hyderabad areas if they don't already exist.
Safe to call on every startup (idempotent via name-based upsert).
"""

from __future__ import annotations

import logging
from sqlalchemy.orm import Session
from app.models.area import Area

logger = logging.getLogger(__name__)

SEED_AREAS: list[dict] = [
    {
        "id": 1,
        "name": "Gachibowli",
        "center_lat": 17.4401,
        "center_lon": 78.3489,
        "radius_meters": 2500,
    },
    {
        "id": 2,
        "name": "Madhapur",
        "center_lat": 17.4483,
        "center_lon": 78.3915,
        "radius_meters": 2000,
    },
    {
        "id": 3,
        "name": "Hitech City",
        "center_lat": 17.4435,
        "center_lon": 78.3772,
        "radius_meters": 2000,
    },
    {
        "id": 4,
        "name": "Kukatpally",
        "center_lat": 17.4849,
        "center_lon": 78.3942,
        "radius_meters": 3000,
    },
    {
        "id": 5,
        "name": "Kondapur",
        "center_lat": 17.4600,
        "center_lon": 78.3548,
        "radius_meters": 2200,
    },
    {
        "id": 6,
        "name": "LB Nagar",
        "center_lat": 17.3457,
        "center_lon": 78.5522,
        "radius_meters": 2500,
    },
]


def seed_areas(db: Session) -> None:
    """Insert missing seed areas; leave existing rows untouched."""
    inserted = 0
    for data in SEED_AREAS:
        existing = db.query(Area).filter(Area.name == data["name"]).first()
        if existing is None:
            area = Area(
                id=data["id"],
                name=data["name"],
                center_lat=data["center_lat"],
                center_lon=data["center_lon"],
                radius_meters=data["radius_meters"],
                boundary_type="circle",
            )
            db.add(area)
            inserted += 1

    if inserted:
        db.commit()
        logger.info("Seeded %d area(s) into the database.", inserted)
    else:
        logger.debug("All seed areas already present – nothing to insert.")
