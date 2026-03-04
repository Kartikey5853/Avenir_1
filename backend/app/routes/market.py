"""
Market data router – serves housing / rental data from data.json.
"""

import json
import os
import logging
from fastapi import APIRouter, Query
from typing import Optional

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/market", tags=["Market"])

DATA_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "data.json")


def _load_data() -> dict:
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


@router.get("/listings")
def get_listings(area: Optional[str] = Query(None, description="Filter by area name")):
    """
    Return housing listings, optionally filtered by area.
    """
    data = _load_data()
    listings = data.get("listings", [])

    if area:
        listings = [l for l in listings if l["area"].lower() == area.lower()]

    return {
        "city": data.get("city", "Hyderabad"),
        "property_type": data.get("property_type", "2BHK"),
        "listings": listings,
    }


@router.get("/areas")
def get_market_areas():
    """
    Return distinct area names available in the housing data.
    """
    data = _load_data()
    listings = data.get("listings", [])
    area_names = sorted(set(l["area"] for l in listings))
    return {"areas": area_names}


@router.get("/summary")
def get_market_summary(area: Optional[str] = Query(None)):
    """
    Return aggregated summary stats for an area (or all areas).
    Includes avg rent, avg sqft, avg rent_per_sqft, listing count.
    """
    data = _load_data()
    listings = data.get("listings", [])

    if area:
        listings = [l for l in listings if l["area"].lower() == area.lower()]

    if not listings:
        return {"area": area, "count": 0}

    avg_rent = sum(l["rent"] for l in listings) / len(listings)
    avg_sqft = sum(l["sqft"] for l in listings) / len(listings)
    avg_rate = sum(l["rent_per_sqft"] for l in listings) / len(listings)
    min_rent = min(l["rent"] for l in listings)
    max_rent = max(l["rent"] for l in listings)
    furnished = sum(1 for l in listings if l.get("furnishing", "").lower() == "furnished")

    return {
        "area": area or "All Areas",
        "count": len(listings),
        "avg_rent": round(avg_rent),
        "avg_sqft": round(avg_sqft),
        "avg_rent_per_sqft": round(avg_rate, 1),
        "min_rent": min_rent,
        "max_rent": max_rent,
        "furnished_count": furnished,
        "unfurnished_count": len(listings) - furnished,
    }


@router.get("/compare")
def compare_areas(
    area1: str = Query(..., description="First area name"),
    area2: str = Query(..., description="Second area name"),
):
    """
    Compare two areas side by side with summary stats.
    """
    data = _load_data()
    listings = data.get("listings", [])

    def summarize(area_name: str):
        area_listings = [l for l in listings if l["area"].lower() == area_name.lower()]
        if not area_listings:
            return {"area": area_name, "count": 0}
        avg_rent = sum(l["rent"] for l in area_listings) / len(area_listings)
        avg_sqft = sum(l["sqft"] for l in area_listings) / len(area_listings)
        avg_rate = sum(l["rent_per_sqft"] for l in area_listings) / len(area_listings)
        return {
            "area": area_name,
            "count": len(area_listings),
            "avg_rent": round(avg_rent),
            "avg_sqft": round(avg_sqft),
            "avg_rent_per_sqft": round(avg_rate, 1),
            "min_rent": min(l["rent"] for l in area_listings),
            "max_rent": max(l["rent"] for l in area_listings),
            "listings": area_listings,
        }

    return {
        "area1": summarize(area1),
        "area2": summarize(area2),
    }