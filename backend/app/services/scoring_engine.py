"""
Density-based scoring engine calibrated for Indian cities.

Score = weighted sum of five composite categories, each normalised against
an Indian-city calibrated saturation threshold.

Target: Bandra Mumbai (2 km radius) -> overall score approximately 72-78.

Composites
----------
safety     = hospitals(50 %) + police(30 %) + fire(20 %)
family     = schools(70 %)   + parks(30 %)
transport  = bus(70 %)       + metro(20 %) + train(10 %)
lifestyle  = restaurants(35 %)+ cafes(25 %) + gyms(20 %) + bars(20 %)
grocery    = supermarkets(100 %)

Default weights
---------------
safety: 0.25, family: 0.20, transport: 0.25, lifestyle: 0.20, grocery: 0.10
"""

from __future__ import annotations

import math
from typing import Optional

# Saturation thresholds (count / km²) – calibrated for Indian cities.
# At this density the sub-score caps at 1.0 (linear saturation).
# Philosophy: a density AT or ABOVE the threshold earns full points;
#             below it earns a proportional fraction.
_T = {
    "hospitals":     1.5,   # hospitals + clinics
    "schools":       3.0,
    "police":        0.5,
    "fire":          0.25,
    "parks":         2.0,
    "bus_stops":     5.0,   # ~63 stops in 2 km radius = full score
    "metro":         0.4,
    "trains":        0.25,
    "supermarkets":  4.0,
    "restaurants":   6.0,   # ~75 restaurants in 2 km radius = full score
    "cafes":         5.0,
    "gyms":          2.0,
    "bars":          2.5,
}

# Profile -> weight delta map
_PROFILE_WEIGHT_DELTAS: dict[str, dict[str, float]] = {
    "has_children":        {"family": +0.10, "safety": +0.05, "lifestyle": -0.10, "grocery": -0.05},
    "is_senior":           {"safety": +0.10, "transport": +0.05, "lifestyle": -0.10, "grocery": -0.05},
    "values_nightlife":    {"lifestyle": +0.15, "grocery": -0.05, "family": -0.10},
    "is_fitness_focused":  {"lifestyle": +0.05, "family": +0.05, "grocery": -0.05, "safety": -0.05},
    "no_car":              {"transport": +0.15, "lifestyle": -0.05, "grocery": -0.05, "family": -0.05},
    "grocery_priority":    {"grocery": +0.10, "lifestyle": -0.05, "family": -0.05},
    "safety_priority":     {"safety": +0.15, "lifestyle": -0.10, "grocery": -0.05},
}

DEFAULT_WEIGHTS: dict[str, float] = {
    "safety":    0.25,
    "family":    0.20,
    "transport": 0.25,
    "lifestyle": 0.20,
    "grocery":   0.10,
}


def _density(count: int, radius_m: int) -> float:
    area_km2 = math.pi * (radius_m / 1000.0) ** 2
    return count / area_km2


def _saturate(density: float, threshold: float) -> float:
    """Linear saturation: score = density/threshold, capped at 1.0."""
    if threshold <= 0:
        return 0.0
    return min(1.0, density / threshold)


def _weights_for_profile(profile: Optional[dict]) -> dict[str, float]:
    w = dict(DEFAULT_WEIGHTS)
    if profile:
        for flag, deltas in _PROFILE_WEIGHT_DELTAS.items():
            if profile.get(flag):
                for cat, delta in deltas.items():
                    w[cat] = w.get(cat, 0.0) + delta
    w = {k: max(0.02, v) for k, v in w.items()}
    total = sum(w.values())
    return {k: v / total for k, v in w.items()}


def _safety_score(counts: dict, radius_m: int) -> float:
    hosp  = _saturate(_density(counts.get("hospital_count", 0),      radius_m), _T["hospitals"])
    pol   = _saturate(_density(counts.get("police_count", 0),         radius_m), _T["police"])
    fire  = _saturate(_density(counts.get("fire_station_count", 0),   radius_m), _T["fire"])
    return 0.50 * hosp + 0.30 * pol + 0.20 * fire


def _family_score(counts: dict, radius_m: int) -> float:
    sch  = _saturate(_density(counts.get("school_count", 0),  radius_m), _T["schools"])
    park = _saturate(_density(counts.get("park_count", 0),    radius_m), _T["parks"])
    return 0.70 * sch + 0.30 * park


def _transport_score(counts: dict, radius_m: int) -> float:
    bus   = _saturate(_density(counts.get("bus_stop_count", 0),      radius_m), _T["bus_stops"])
    metro = _saturate(_density(counts.get("metro_count", 0),          radius_m), _T["metro"])
    train = _saturate(_density(counts.get("train_station_count", 0),  radius_m), _T["trains"])
    return 0.70 * bus + 0.20 * metro + 0.10 * train


def _lifestyle_score(counts: dict, radius_m: int) -> float:
    rest  = _saturate(_density(counts.get("restaurant_count", 0), radius_m), _T["restaurants"])
    cafe  = _saturate(_density(counts.get("cafe_count", 0),        radius_m), _T["cafes"])
    gym   = _saturate(_density(counts.get("gym_count", 0),         radius_m), _T["gyms"])
    bar   = _saturate(_density(counts.get("bar_count", 0),         radius_m), _T["bars"])
    return 0.35 * rest + 0.25 * cafe + 0.20 * gym + 0.20 * bar


def _grocery_score(counts: dict, radius_m: int) -> float:
    sup = _saturate(_density(counts.get("supermarket_count", 0), radius_m), _T["supermarkets"])
    return sup


def compute_subscores(counts: dict, radius_m: int) -> dict[str, float]:
    return {
        "safety":    round(_safety_score(counts, radius_m)    * 100, 1),
        "family":    round(_family_score(counts, radius_m)     * 100, 1),
        "transport": round(_transport_score(counts, radius_m)  * 100, 1),
        "lifestyle": round(_lifestyle_score(counts, radius_m)  * 100, 1),
        "grocery":   round(_grocery_score(counts, radius_m)    * 100, 1),
    }


def compute_final_score(
    counts: dict,
    profile: Optional[dict] = None,
    radius: int = 2000,
) -> dict:
    """
    Compute final livability score.

    Parameters
    ----------
    counts  : dict with keys like "hospital_count", "school_count", etc.
              Can be a plain dict or an ORM InfrastructureData object.
    profile : dict of boolean profile flags (e.g. {"has_children": True}).
    radius  : search radius in metres.
    """
    if not isinstance(counts, dict):
        counts = {
            col: getattr(counts, col, 0) or 0
            for col in (
                "hospital_count", "school_count", "police_count",
                "fire_station_count", "park_count",
                "bus_stop_count", "metro_count", "train_station_count",
                "supermarket_count", "restaurant_count",
                "cafe_count", "gym_count", "bar_count",
            )
        }

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
    if score >= 80:
        return "Excellent livability - this area has outstanding infrastructure."
    if score >= 65:
        return "Good livability - well-served area with most amenities nearby."
    if score >= 50:
        return "Moderate livability - some amenities present but notable gaps."
    if score >= 35:
        return "Below-average livability - limited infrastructure nearby."
    return "Poor livability - significantly underserved area."
