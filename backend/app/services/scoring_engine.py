"""app.services.scoring_engine

Count-based scoring engine calibrated for Indian cities (Hyderabad).

Design goals
------------
- Generous, easy-to-understand thresholds.
- Uses *counts* only (not density); `radius_m` is kept for API compatibility.
- Excludes unreliable categories from scoring (metro, trains, cafes, bars).

Categories
----------
safety     = hospitals(50%) + police(30%) + fire(20%)
             1 hospital -> 100% hospital component
             1 police   -> 100% police component
             1 fire     -> 100% fire component

family     = schools(70%) + parks(30%)
             2 schools -> 100% school component
             3 parks   -> 100% park component

transport  = bus stops only
             5 bus stops -> 100%

lifestyle  = restaurants(70%) + gyms(30%)
             5 restaurants -> 100% restaurant component
             2 gyms        -> 100% gym component

grocery    = supermarkets only
             3 supermarkets -> 100%

Profile-driven weights (4 Yes/No flags)
--------------------------------------
- has_children
- relies_on_public_transport
- prefers_vibrant_lifestyle
- safety_priority
"""

from __future__ import annotations

from typing import Optional


# --- Default weights (no profile) -------------------------------------------

DEFAULT_WEIGHTS: dict[str, float] = {
    "safety": 0.20,
    "family": 0.15,
    "transport": 0.20,
    "lifestyle": 0.25,
    "grocery": 0.20,
}


def _weights_for_profile(profile: Optional[dict]) -> dict[str, float]:
    """Derive category weights from the user's 4-flag profile.

    Guarantees lifestyle >= 15% and all values sum to 1.0.
    """

    if not profile:
        return dict(DEFAULT_WEIGHTS)

    raw: dict[str, float] = {
        "safety": 30.0 if profile.get("safety_priority") else 20.0,
        "family": 30.0 if profile.get("has_children") else 10.0,
        "transport": 25.0 if profile.get("relies_on_public_transport") else 5.0,
        "lifestyle": 25.0 if profile.get("prefers_vibrant_lifestyle") else 15.0,
        "grocery": 15.0,
    }

    total = sum(raw.values()) or 1.0
    weights = {k: v / total for k, v in raw.items()}

    # Enforce lifestyle minimum at 15%
    if weights["lifestyle"] < 0.15:
        weights["lifestyle"] = 0.15
        rest = {k: v for k, v in weights.items() if k != "lifestyle"}
        rest_total = sum(rest.values()) or 1.0
        factor = 0.85 / rest_total
        for k in rest:
            weights[k] = rest[k] * factor

    return {k: round(v, 4) for k, v in weights.items()}


# --- Sub-score helpers -------------------------------------------------------

def _cap(count: int | float, threshold: int | float) -> float:
    """Linearly scale count up to threshold, capped at 1.0."""

    if threshold <= 0:
        return 0.0
    try:
        c = float(count)
    except Exception:
        c = 0.0
    return min(1.0, max(0.0, c / float(threshold)))


def _safety_score(counts: dict, radius_m: int) -> float:
    # 20 hospitals → 100%,  5 police → 100%,  1 fire → 100%
    hosp = _cap(counts.get("hospital_count", 0), 20)
    pol  = _cap(counts.get("police_count", 0), 5)
    fire = _cap(counts.get("fire_station_count", 0), 1)
    return 0.50 * hosp + 0.30 * pol + 0.20 * fire


def _family_score(counts: dict, radius_m: int) -> float:
    # 10 schools → 100%,  30 parks → 100%
    sch  = _cap(counts.get("school_count", 0), 10)
    park = _cap(counts.get("park_count", 0), 30)
    return 0.70 * sch + 0.30 * park


def _transport_score(counts: dict, radius_m: int) -> float:
    # Bus stops only (metro/train excluded from scoring)
    # 45 bus stops → 100%
    bus = _cap(counts.get("bus_stop_count", 0), 45)
    return bus


def _lifestyle_score(counts: dict, radius_m: int) -> float:
    # Restaurants + gyms only (cafes/bars excluded from scoring)
    # 200 restaurants → 100%,  10 gyms → 100%
    rest = _cap(counts.get("restaurant_count", 0), 200)
    gym  = _cap(counts.get("gym_count", 0), 10)
    return 0.70 * rest + 0.30 * gym


def _grocery_score(counts: dict, radius_m: int) -> float:
    # 35 supermarkets → 100%
    sup = _cap(counts.get("supermarket_count", 0), 35)
    return sup


# --- Public API --------------------------------------------------------------

def compute_subscores(counts: dict, radius_m: int) -> dict[str, float]:
    """Return each category as a 0-100 score."""

    return {
        "safety": round(_safety_score(counts, radius_m) * 100, 1),
        "family": round(_family_score(counts, radius_m) * 100, 1),
        "transport": round(_transport_score(counts, radius_m) * 100, 1),
        "lifestyle": round(_lifestyle_score(counts, radius_m) * 100, 1),
        "grocery": round(_grocery_score(counts, radius_m) * 100, 1),
    }


# Keys used when `counts` is an ORM InfrastructureData instance.
# We keep legacy columns for compatibility even if they're ignored in scoring.
_COLUMN_KEYS = (
    "hospital_count",
    "school_count",
    "police_count",
    "fire_station_count",
    "park_count",
    "bus_stop_count",
    "metro_count",
    "train_station_count",
    "supermarket_count",
    "restaurant_count",
    "cafe_count",
    "gym_count",
    "bar_count",
)


def compute_final_score(
    counts: dict,
    profile: Optional[dict] = None,
    radius: int = 2000,
) -> dict:
    """Compute final livability score.

    Parameters
    ----------
    counts:
        Dict with keys like hospital_count, school_count, etc.
        Also accepts an ORM InfrastructureData instance.
    profile:
        Dict of boolean flags (has_children, relies_on_public_transport,
        prefers_vibrant_lifestyle, safety_priority).
    radius:
        Search radius in meters (kept for compatibility).
    """

    if not isinstance(counts, dict):
        counts = {col: getattr(counts, col, 0) or 0 for col in _COLUMN_KEYS}

    weights = _weights_for_profile(profile)

    subs = {
        "safety": _safety_score(counts, radius),
        "family": _family_score(counts, radius),
        "transport": _transport_score(counts, radius),
        "lifestyle": _lifestyle_score(counts, radius),
        "grocery": _grocery_score(counts, radius),
    }

    raw = sum(weights[k] * v for k, v in subs.items())
    overall = round(min(100.0, max(0.0, raw * 100.0)), 1)

    category_scores = {k: round(v * 100.0, 1) for k, v in subs.items()}
    highlights, concerns = _generate_insights(category_scores)

    return {
        "overall_score": overall,
        "category_scores": category_scores,
        "weights": {k: round(v, 3) for k, v in weights.items()},
        "summary": _summary_text(overall),
        "highlights": highlights,
        "concerns": concerns,
    }


# --- Insight generation ------------------------------------------------------

_CATEGORY_LABELS = {
    "safety": "Safety (hospitals, police, fire)",
    "family": "Family (schools, parks)",
    "transport": "Transport (bus stops)",
    "lifestyle": "Lifestyle (restaurants, gyms)",
    "grocery": "Groceries (supermarkets)",
}


def _generate_insights(category_scores: dict[str, float]):
    highlights: list[str] = []
    concerns: list[str] = []

    for cat, score in sorted(category_scores.items(), key=lambda x: x[1], reverse=True):
        label = _CATEGORY_LABELS.get(cat, cat)
        if score >= 70:
            highlights.append(f"Strong {label} ({score:.0f}/100)")
        elif score < 40:
            concerns.append(f"Limited {label} ({score:.0f}/100)")

    return highlights, concerns


def _summary_text(score: float) -> str:
    if score >= 85:
        return "Excellent livability - outstanding infrastructure for city living."
    if score >= 70:
        return "Very good livability - well-served area with most amenities close by."
    if score >= 55:
        return "Good livability - comfortable area with some gaps in amenities."
    if score >= 40:
        return "Moderate livability - key facilities present but coverage is uneven."
    if score >= 25:
        return "Below-average livability - limited infrastructure nearby."
    return "Poor livability - significantly underserved area."
