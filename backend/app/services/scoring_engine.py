"""
Density-based scoring engine — calibrated for Indian cities (Hyderabad).

Target calibration
------------------
Madhapur / Hitech City (2 km radius) → overall score ≈ 80–95
LB Nagar (2.5 km radius)             → overall score ≈ 55–70

Composites
----------
safety     = hospitals(50 %) + police(30 %) + fire(20 %)
family     = schools(70 %)   + parks(30 %)
transport  = bus(60 %)       + metro(25 %) + train(15 %)
lifestyle  = restaurants(35 %)+ cafes(25 %) + gyms(20 %) + bars(20 %)
grocery    = supermarkets(100 %)

Profile-driven weights (4 Yes/No questions)
-------------------------------------------
Q1 has_children               → family   weight increases (30 % vs 10 %)
Q2 relies_on_public_transport → transport weight increases (25 % vs 5 %)
Q3 prefers_vibrant_lifestyle  → lifestyle weight increases (25 % vs 15 %)
Q4 safety_priority            → safety   weight increases (30 % vs 20 %)

Minimum lifestyle weight: 15 % (never deprioritised below this)
"""

from __future__ import annotations

import math
from typing import Optional

# ── Saturation thresholds (count / km²) ───────────────────────────────────────
# Calibrated for Hyderabad's dense tech-corridor (Madhapur / Hitech / Gachibowli).
# A density AT or ABOVE the threshold earns 100 points for that sub-score.

_T = {
    "hospitals":     1.2,   # clinics included
    "schools":       3.0,
    "police":        0.30,  # lower threshold → easier to hit full score
    "fire":          0.20,
    "parks":         0.80,  # lowered from 2.0 — parks scarce in Hyderabad urban core
    "bus_stops":     5.0,
    "metro":         0.20,  # lowered from 0.4
    "trains":        0.10,  # lowered from 0.25
    "supermarkets":  3.5,
    "restaurants":   6.0,
    "cafes":         4.0,
    "gyms":          1.5,
    "bars":          2.0,
}

# ── Default weights (no profile) ─────────────────────────────────────────────
# These produce ~85–92 for Madhapur with typical OSM data.
DEFAULT_WEIGHTS: dict[str, float] = {
    "safety":    0.20,
    "family":    0.15,
    "transport": 0.20,
    "lifestyle": 0.25,
    "grocery":   0.20,
}


# ── Weight engine ─────────────────────────────────────────────────────────────

def _weights_for_profile(profile: Optional[dict]) -> dict[str, float]:
    """
    Derive category weights from the user's 5-question profile.
    Guarantees lifestyle ≥ 15 % and all values sum to 1.0.
    """
    if not profile:
        return dict(DEFAULT_WEIGHTS)

    # Raw point allocations (not yet normalised)
    raw: dict[str, float] = {
        "safety":    30.0 if profile.get("safety_priority")             else 20.0,
        "family":    30.0 if profile.get("has_children")                else 10.0,
        "transport": 25.0 if profile.get("relies_on_public_transport")  else  5.0,
        "lifestyle": 25.0 if profile.get("prefers_vibrant_lifestyle")   else 15.0,
        "grocery":   15.0,
    }

    total = sum(raw.values())
    w = {k: v / total for k, v in raw.items()}

    # Enforce lifestyle minimum at 15 %
    if w["lifestyle"] < 0.15:
        w["lifestyle"] = 0.15
        rest = {k: v for k, v in w.items() if k != "lifestyle"}
        rest_total = sum(rest.values())
        factor = 0.85 / rest_total
        for k in rest:
            w[k] = rest[k] * factor

    return {k: round(v, 4) for k, v in w.items()}


# ── Sub-score helpers ─────────────────────────────────────────────────────────

def _density(count: int | float, radius_m: int) -> float:
    area_km2 = math.pi * (radius_m / 1000.0) ** 2
    return count / area_km2


def _saturate(density: float, threshold: float) -> float:
    """Linear saturation: clipped at 1.0."""
    if threshold <= 0:
        return 0.0
    return min(1.0, density / threshold)


def _safety_score(counts: dict, radius_m: int) -> float:
    hosp = _saturate(_density(counts.get("hospital_count", 0),     radius_m), _T["hospitals"])
    pol  = _saturate(_density(counts.get("police_count", 0),        radius_m), _T["police"])
    fire = _saturate(_density(counts.get("fire_station_count", 0),  radius_m), _T["fire"])
    return 0.50 * hosp + 0.30 * pol + 0.20 * fire


def _family_score(counts: dict, radius_m: int) -> float:
    sch  = _saturate(_density(counts.get("school_count", 0), radius_m), _T["schools"])
    park = _saturate(_density(counts.get("park_count", 0),   radius_m), _T["parks"])
    return 0.70 * sch + 0.30 * park


def _transport_score(counts: dict, radius_m: int) -> float:
    bus   = _saturate(_density(counts.get("bus_stop_count", 0),      radius_m), _T["bus_stops"])
    metro = _saturate(_density(counts.get("metro_count", 0),          radius_m), _T["metro"])
    train = _saturate(_density(counts.get("train_station_count", 0),  radius_m), _T["trains"])
    return 0.60 * bus + 0.25 * metro + 0.15 * train


def _lifestyle_score(counts: dict, radius_m: int) -> float:
    rest = _saturate(_density(counts.get("restaurant_count", 0), radius_m), _T["restaurants"])
    cafe = _saturate(_density(counts.get("cafe_count", 0),        radius_m), _T["cafes"])
    gym  = _saturate(_density(counts.get("gym_count", 0),         radius_m), _T["gyms"])
    bar  = _saturate(_density(counts.get("bar_count", 0),         radius_m), _T["bars"])
    return 0.35 * rest + 0.25 * cafe + 0.20 * gym + 0.20 * bar


def _grocery_score(counts: dict, radius_m: int) -> float:
    sup = _saturate(_density(counts.get("supermarket_count", 0), radius_m), _T["supermarkets"])
    return sup


# ── Public API ────────────────────────────────────────────────────────────────

def compute_subscores(counts: dict, radius_m: int) -> dict[str, float]:
    return {
        "safety":    round(_safety_score(counts, radius_m)    * 100, 1),
        "family":    round(_family_score(counts, radius_m)     * 100, 1),
        "transport": round(_transport_score(counts, radius_m)  * 100, 1),
        "lifestyle": round(_lifestyle_score(counts, radius_m)  * 100, 1),
        "grocery":   round(_grocery_score(counts, radius_m)    * 100, 1),
    }


_COLUMN_KEYS = (
    "hospital_count", "school_count", "police_count",
    "fire_station_count", "park_count",
    "bus_stop_count", "metro_count", "train_station_count",
    "supermarket_count", "restaurant_count",
    "cafe_count", "gym_count", "bar_count",
)


def compute_final_score(
    counts: dict,
    profile: Optional[dict] = None,
    radius: int = 2000,
) -> dict:
    """
    Compute final livability score.

    Parameters
    ----------
    counts  : dict with keys like ``hospital_count``, ``school_count`` …
              Also accepts an ORM ``InfrastructureData`` instance.
    profile : dict of boolean flags from the 5-question profile
              (``has_children``, ``relies_on_public_transport``, …).
    radius  : search radius in metres.
    """
    if not isinstance(counts, dict):
        counts = {col: getattr(counts, col, 0) or 0 for col in _COLUMN_KEYS}

    weights = _weights_for_profile(profile)

    subs = {
        "safety":    _safety_score(counts, radius),
        "family":    _family_score(counts, radius),
        "transport": _transport_score(counts, radius),
        "lifestyle": _lifestyle_score(counts, radius),
        "grocery":   _grocery_score(counts, radius),
    }

    raw = sum(weights[k] * v for k, v in subs.items())
    overall = round(min(100.0, max(0.0, raw * 100)), 1)
    category_scores = {k: round(v * 100, 1) for k, v in subs.items()}
    highlights, concerns = _generate_insights(category_scores)

    return {
        "overall_score":   overall,
        "category_scores": category_scores,
        "weights":         {k: round(v, 3) for k, v in weights.items()},
        "summary":         _summary_text(overall),
        "highlights":      highlights,
        "concerns":        concerns,
    }


# ── Insight generation ────────────────────────────────────────────────────────

_CATEGORY_LABELS = {
    "safety":    "Safety (hospitals, police, fire)",
    "family":    "Family (schools, parks)",
    "transport": "Transport (bus, metro, train)",
    "lifestyle": "Lifestyle (restaurants, cafes, gyms, bars)",
    "grocery":   "Groceries (supermarkets)",
}


def _generate_insights(category_scores: dict[str, float]):
    highlights, concerns = [], []
    for cat, score in sorted(category_scores.items(), key=lambda x: x[1], reverse=True):
        label = _CATEGORY_LABELS.get(cat, cat)
        if score >= 70:
            highlights.append(f"Strong {label} ({score:.0f}/100)")
        elif score < 40:
            concerns.append(f"Limited {label} ({score:.0f}/100)")
    return highlights, concerns


def _summary_text(score: float) -> str:
    if score >= 85:
        return "Excellent livability — outstanding infrastructure for city living."
    if score >= 70:
        return "Very good livability — well-served area with most amenities close by."
    if score >= 55:
        return "Good livability — comfortable area with some gaps in amenities."
    if score >= 40:
        return "Moderate livability — key facilities present but coverage is uneven."
    if score >= 25:
        return "Below-average livability — limited infrastructure nearby."
    return "Poor livability — significantly underserved area."
