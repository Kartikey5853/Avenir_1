"""
Infrastructure router - fetch infrastructure data and facility locations.
Includes background fetch pipeline and status polling endpoint.
"""

from __future__ import annotations

import json
import logging
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db, SessionLocal
from app.models.area import Area
from app.models.infrastructure import InfrastructureData
from app.schemas.infrastructure import (
    InfrastructureResponse,
    InfrastructureWithLocationsResponse,
    AreaStatusResponse,
)
from app.services.overpass_service import (
    get_infrastructure_for_area,
)
from app.services.location_service import (
    fetch_facility_locations,
    iter_facility_locations_sse,
    ALL_CATEGORIES,
)
from app.services.map_view_fetch_logic import fetch_map_data
from app.utils.exceptions import ExternalAPIError
from datetime import datetime, timezone, timedelta
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/areas", tags=["Infrastructure"])

MAIN_AREA_IDS = [1, 2, 3, 4, 5, 6]

# Status -> which categories are still "pending"
_STATUS_PENDING_MAP: dict[str, list[str]] = {
    "pending":                 ALL_CATEGORIES,
    "fetching_hospitals":      ALL_CATEGORIES,
    "fetching_schools":        ["schools", "police", "fire_stations", "parks", "transport", "supermarkets", "lifestyle"],
    "fetching_police":         ["police", "fire_stations", "parks", "transport", "supermarkets", "lifestyle"],
    "fetching_fire_stations":  ["fire_stations", "parks", "transport", "supermarkets", "lifestyle"],
    "fetching_parks":          ["parks", "transport", "supermarkets", "lifestyle"],
    "fetching_transport":      ["transport", "supermarkets", "lifestyle"],
    "fetching_supermarkets":   ["supermarkets", "lifestyle"],
    "fetching_lifestyle":      ["lifestyle"],
    "ready":                   [],
    "partial":                 [],
    "failed":                  [],
}

_STATUS_COMPLETED_MAP: dict[str, list[str]] = {
    "pending":                 [],
    "fetching_hospitals":      [],
    "fetching_schools":        ["hospitals"],
    "fetching_police":         ["hospitals", "schools"],
    "fetching_fire_stations":  ["hospitals", "schools", "police"],
    "fetching_parks":          ["hospitals", "schools", "police", "fire_stations"],
    "fetching_transport":      ["hospitals", "schools", "police", "fire_stations", "parks"],
    "fetching_supermarkets":   ["hospitals", "schools", "police", "fire_stations", "parks", "transport"],
    "fetching_lifestyle":      ["hospitals", "schools", "police", "fire_stations", "parks", "transport", "supermarkets"],
    "ready":                   ALL_CATEGORIES,
    "partial":                 ALL_CATEGORIES,
    "failed":                  [],
}


def _should_refresh(infra: InfrastructureData | None) -> bool:
    """Return True if data is missing, stale, or failed."""
    if infra is None:
        return True
    status = getattr(infra, "infra_status", "pending")
    if status == "failed":
        return True
    if not infra.last_updated:
        return True
    ttl = timedelta(hours=settings.CACHE_TTL_HOURS)
    return datetime.now(timezone.utc) >= infra.last_updated.replace(tzinfo=timezone.utc) + ttl


# ─── Custom location endpoint ────────────────────────────────────────────────

@router.get("/infrastructure/custom", response_model=InfrastructureWithLocationsResponse)
async def get_custom_infrastructure_locations(
    lat: float = Query(..., description="Latitude of centre point"),
    lon: float = Query(..., description="Longitude of centre point"),
    radius: int = Query(2000, ge=500, le=15000, description="Search radius in metres"),
):
    """Fetch infrastructure for any arbitrary lat/lon — no DB required."""
    try:
        cats = await fetch_facility_locations(lat, lon, radius)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Custom infra fetch failed: %s", exc)
        raise HTTPException(status_code=503, detail="Infrastructure service temporarily unavailable")

    all_cats = {
        k: cats.get(k, [])
        for k in [
            "hospitals", "schools", "police", "fire_stations", "parks",
            "bus_stops", "metro_stations", "train_stations",
            "supermarkets", "restaurants", "cafes", "gyms", "bars",
        ]
    }
    return InfrastructureWithLocationsResponse(
        area_id=0,
        area_name=f"Custom ({lat:.4f}, {lon:.4f})",
        last_updated=datetime.now(timezone.utc),
        **all_cats,
    )

# ─── SSE streaming endpoint ───────────────────────────────────────────────────────────────

@router.get("/{area_id}/infrastructure/stream")
async def stream_infrastructure_sse(
    area_id: int,
    db: Session = Depends(get_db),
):
    """
    Server-Sent Events stream for Infra Display.
    Sends one JSON event per category the moment it finishes.
    Frontend renders markers immediately instead of waiting for all.
    """
    area = db.query(Area).filter(Area.id == area_id).first()
    if not area:
        raise HTTPException(status_code=404, detail="Area not found")

    lat, lon, rad = area.center_lat, area.center_lon, area.radius_meters or 2000

    async def generate():
        async for event in iter_facility_locations_sse(lat, lon, rad):
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*",
        },
    )

# ─── Status endpoint ─────────────────────────────────────────────────────────

@router.get("/{area_id}/status", response_model=AreaStatusResponse)
async def get_area_status(area_id: int, db: Session = Depends(get_db)):
    """
    Poll the infrastructure fetch status for an area.
    Returns which categories are completed, pending, and failed.
    """
    area = db.query(Area).filter(Area.id == area_id).first()
    if not area:
        raise HTTPException(status_code=404, detail="Area not found")

    infra = db.query(InfrastructureData).filter(InfrastructureData.area_id == area_id).first()
    if not infra:
        return AreaStatusResponse(
            area_id=area_id,
            area_name=area.name,
            status="pending",
            completed=[],
            pending=ALL_CATEGORIES,
            failed_categories=[],
        )

    status = getattr(infra, "infra_status", "pending") or "pending"
    failed_raw = getattr(infra, "failed_categories", None)
    failed: list[str] = json.loads(failed_raw) if failed_raw else []

    completed = _STATUS_COMPLETED_MAP.get(status, [])
    pending   = _STATUS_PENDING_MAP.get(status, [])

    # For partial/ready, remove truly failed categories from completed
    if status in ("partial", "ready") and failed:
        completed = [c for c in ALL_CATEGORIES if c not in failed]
        pending   = []

    return AreaStatusResponse(
        area_id=area_id,
        area_name=area.name,
        status=status,
        completed=completed,
        pending=pending,
        failed_categories=failed,
        error_message=getattr(infra, "error_message", None),
        last_updated=infra.last_updated,
    )


# ─── Trigger background infrastructure fetch ─────────────────────────────────

@router.post("/{area_id}/infrastructure/fetch")
async def trigger_infrastructure_fetch(
    area_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Trigger a background infrastructure fetch for an area.
    Returns immediately with initial status.
    """
    area = db.query(Area).filter(Area.id == area_id).first()
    if not area:
        raise HTTPException(status_code=404, detail="Area not found")

    infra = db.query(InfrastructureData).filter(InfrastructureData.area_id == area_id).first()

    if infra and not _should_refresh(infra):
        return {"status": getattr(infra, "infra_status", "ready"), "message": "Using cached data"}

    # Set/create pending record
    if infra:
        infra.infra_status = "pending"
        infra.error_message = None
        infra.failed_categories = None
        db.commit()
    else:
        infra = InfrastructureData(area_id=area_id, infra_status="pending")
        db.add(infra)
        db.commit()

    background_tasks.add_task(
        _background_fetch_counts,
        area_id, area.center_lat, area.center_lon, area.radius_meters or 2000,
    )
    return {"status": "pending", "message": "Infrastructure fetch started"}


async def _background_fetch_counts(area_id: int, lat: float, lon: float, radius: int) -> None:
    """Background task: fetch live counts from Overpass and persist to DB."""
    db = SessionLocal()
    try:
        infra = db.query(InfrastructureData).filter(InfrastructureData.area_id == area_id).first()
        if infra is None:
            infra = InfrastructureData(area_id=area_id)
            db.add(infra)

        infra.infra_status = "fetching_hospitals"
        db.commit()

        counts = await fetch_map_data(lat=lat, lon=lon)

        # Write all counts
        infra.hospital_count      = counts.get("hospital_count", 0)
        infra.school_count        = counts.get("school_count", 0)
        infra.police_count        = counts.get("police_count", 0)
        infra.fire_station_count  = counts.get("fire_station_count", 0)
        infra.park_count          = counts.get("park_count", 0)
        infra.bus_stop_count      = counts.get("bus_stop_count", 0)
        infra.metro_count         = counts.get("metro_count", 0)
        infra.train_station_count = counts.get("train_station_count", 0)
        infra.supermarket_count   = counts.get("supermarket_count", 0)
        infra.restaurant_count    = counts.get("restaurant_count", 0)
        infra.cafe_count          = counts.get("cafe_count", 0)
        infra.gym_count           = counts.get("gym_count", 0)
        infra.bar_count           = counts.get("bar_count", 0)
        infra.infra_status        = "ready"
        infra.last_updated        = datetime.now(timezone.utc)
        infra.error_message       = None
        infra.failed_categories   = None
        db.commit()
        logger.info("[INFRA BG] Area %d fetch complete.", area_id)
    except Exception as exc:  # noqa: BLE001
        logger.error("[INFRA BG] Area %d fetch failed: %s", area_id, exc)
        try:
            if infra:
                infra.infra_status = "failed"
                infra.error_message = str(exc)
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


# ─── Infrastructure counts endpoint ──────────────────────────────────────────

@router.get("/{area_id}/infrastructure", response_model=InfrastructureResponse)
async def get_area_infrastructure(
    area_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Get infrastructure counts for an area.
    If data is missing/stale, kicks off a background refresh and returns
    current (possibly empty) counts with status indicator.
    """
    area = db.query(Area).filter(Area.id == area_id).first()
    if not area:
        raise HTTPException(status_code=404, detail="Area not found")

    infra = db.query(InfrastructureData).filter(InfrastructureData.area_id == area_id).first()

    if _should_refresh(infra):
        if infra:
            infra.infra_status = "pending"
            infra.error_message = None
            infra.failed_categories = None
            db.commit()
        else:
            infra = InfrastructureData(area_id=area_id, infra_status="pending")
            db.add(infra)
            db.commit()
            db.refresh(infra)

    return InfrastructureResponse(
        area_id=area.id,
        area_name=area.name,
        hospital_count=infra.hospital_count or 0,
        school_count=infra.school_count or 0,
        bus_stop_count=infra.bus_stop_count or 0,
        metro_count=infra.metro_count or 0,
        supermarket_count=infra.supermarket_count or 0,
        restaurant_count=infra.restaurant_count or 0,
        gym_count=infra.gym_count or 0,
        bar_count=infra.bar_count or 0,
        police_count=getattr(infra, 'police_count', 0) or 0,
        fire_station_count=getattr(infra, 'fire_station_count', 0) or 0,
        park_count=getattr(infra, 'park_count', 0) or 0,
        cafe_count=getattr(infra, 'cafe_count', 0) or 0,
        train_station_count=getattr(infra, 'train_station_count', 0) or 0,
        last_updated=infra.last_updated,
    )


# ─── Facility locations endpoint ─────────────────────────────────────────────

@router.get("/{area_id}/infrastructure/locations", response_model=InfrastructureWithLocationsResponse)
async def get_area_infrastructure_locations(
    area_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Get infrastructure facility map pin locations for an area.
    Only available for MAIN_AREA_IDS.
    If count data is stale, kicks off a background refresh in parallel.
    Location data is fetched on-demand from Overpass per-category (no block parsing).
    """
    if area_id not in MAIN_AREA_IDS:
        raise HTTPException(status_code=403, detail="Facility locations only available for main areas.")

    area = db.query(Area).filter(Area.id == area_id).first()
    if not area:
        raise HTTPException(status_code=404, detail="Area not found")

    infra = db.query(InfrastructureData).filter(InfrastructureData.area_id == area_id).first()

    # Start background count-refresh if needed (non-blocking for this endpoint)
    if _should_refresh(infra):
        if infra:
            infra.infra_status = "pending"
            infra.error_message = None
            infra.failed_categories = None
            db.commit()
        else:
            infra = InfrastructureData(area_id=area_id, infra_status="pending")
            db.add(infra)
            db.commit()
            db.refresh(infra)

    # Fetch live locations from Overpass (per-category, independent queries)
    try:
        cats = await fetch_facility_locations(
            area.center_lat, area.center_lon, area.radius_meters or 2000
        )
    except Exception as exc:
        logger.error("Location fetch failed for area %d: %s", area_id, exc)
        raise HTTPException(
            status_code=503,
            detail={
                "status": "failed",
                "message": "Infrastructure service temporarily unavailable. Please try again later.",
            },
        )

    return InfrastructureWithLocationsResponse(
        area_id=area.id,
        area_name=area.name,
        # Counts derived from live location lists (authoritative, not stale DB cache)
        hospital_count=len(cats.get("hospitals", [])),
        school_count=len(cats.get("schools", [])),
        bus_stop_count=len(cats.get("bus_stops", [])),
        metro_count=len(cats.get("metro_stations", [])),
        supermarket_count=len(cats.get("supermarkets", [])),
        restaurant_count=len(cats.get("restaurants", [])),
        gym_count=len(cats.get("gyms", [])),
        bar_count=len(cats.get("bars", [])),
        police_count=len(cats.get("police", [])),
        fire_station_count=len(cats.get("fire_stations", [])),
        park_count=len(cats.get("parks", [])),
        cafe_count=len(cats.get("cafes", [])),
        train_station_count=len(cats.get("train_stations", [])),
        last_updated=datetime.now(timezone.utc),
        hospitals=cats.get("hospitals", []),
        schools=cats.get("schools", []),
        bus_stops=cats.get("bus_stops", []),
        metro_stations=cats.get("metro_stations", []),
        supermarkets=cats.get("supermarkets", []),
        restaurants=cats.get("restaurants", []),
        gyms=cats.get("gyms", []),
        bars=cats.get("bars", []),
        police=cats.get("police", []),
        fire_stations=cats.get("fire_stations", []),
        parks=cats.get("parks", []),
        cafes=cats.get("cafes", []),
        train_stations=cats.get("train_stations", []),
    )
