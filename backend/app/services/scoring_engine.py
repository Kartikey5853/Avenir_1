"""
Scoring Engine – computes lifestyle scores for areas based on infrastructure
data and user profile preferences.

Scoring steps:
1. Compute raw category scores from infrastructure counts
2. Normalize to 0–100 scale
3. Generate weight matrix (default or profile-based)
4. Compute weighted final score
"""

from app.models.infrastructure import InfrastructureData
from app.models.profile import UserProfile


# ─── Default weights (used when no user profile exists) ───
DEFAULT_WEIGHTS = {
    "transport": 0.25,
    "healthcare": 0.20,
    "education": 0.20,
    "lifestyle": 0.20,
    "grocery": 0.15,
}

# ─── Normalization caps (used to scale raw scores to 0–100) ───
# These represent the "expected max" for each raw score in a well-served area
SCORE_CAPS = {
    "transport": 100,   # metro*5 + bus*2 → cap at 100
    "healthcare": 80,   # hospital*4 → cap at 80
    "education": 60,    # school*3 → cap at 60
    "lifestyle": 100,   # restaurant*2 → cap at 100
    "grocery": 40,      # supermarket*2 → cap at 40
}


def compute_raw_scores(infra: InfrastructureData) -> dict[str, float]:
    """
    Step 1: Compute raw category scores from infrastructure counts.

    Formulas:
    - Transport = metro_count * 5 + bus_stop_count * 2
    - Healthcare = hospital_count * 4
    - Education = school_count * 3
    - Lifestyle = restaurant_count * 2
    - Grocery = supermarket_count * 2
    """
    return {
        "transport": infra.metro_count * 5 + infra.bus_stop_count * 2,
        "healthcare": infra.hospital_count * 4,
        "education": infra.school_count * 3,
        "lifestyle": infra.restaurant_count * 2,
        "grocery": infra.supermarket_count * 2,
    }


def normalize_scores(raw: dict[str, float]) -> dict[str, float]:
    """
    Step 2: Normalize raw scores to 0–100 scale.
    Uses SCORE_CAPS as the reference maximum. Values are clamped to [0, 100].
    """
    normalized = {}
    for key, value in raw.items():
        cap = SCORE_CAPS.get(key, 100)
        score = min((value / cap) * 100, 100) if cap > 0 else 0
        normalized[key] = round(score, 2)
    return normalized


def generate_weights(profile: UserProfile | None) -> tuple[dict[str, float], list[str]]:
    """
    Step 3: Generate weight matrix based on user profile.

    If no profile → use DEFAULT_WEIGHTS.
    If profile exists → adjust weights based on:
    - has_parents = True → increase healthcare weight (+0.10)
    - employment_status = working → increase transport weight (+0.08)
    - marital_status = single → increase lifestyle weight (+0.08)
    - marital_status = married → increase education weight (+0.08)
    - employment_status = student → increase education weight (+0.05)

    Weights are always normalized to sum to 1.0.
    """
    adjustments: list[str] = []

    if profile is None:
        return DEFAULT_WEIGHTS.copy(), ["Using default weights (no profile)"]

    weights = DEFAULT_WEIGHTS.copy()

    # ── Profile-based adjustments ──
    if profile.has_parents:
        weights["healthcare"] += 0.10
        adjustments.append("Living with parents → Healthcare weight increased (+0.10)")

    # Has elderly people → healthcare goes up
    if profile.has_elderly:
        weights["healthcare"] += 0.12
        adjustments.append("Lives with elderly → Healthcare weight increased (+0.12)")

    # Has children → education goes up
    if profile.has_children:
        weights["education"] += 0.10
        adjustments.append("Has children → Education weight increased (+0.10)")

    # Has vehicle → transport weight goes down
    if profile.has_vehicle:
        weights["transport"] -= 0.08
        if weights["transport"] < 0.05:
            weights["transport"] = 0.05
        adjustments.append("Has vehicle → Transport weight decreased (-0.08)")

    if profile.employment_status == "working":
        weights["transport"] += 0.08
        adjustments.append("Employed (working) → Transport weight increased (+0.08)")
    elif profile.employment_status == "student":
        weights["education"] += 0.05
        weights["transport"] += 0.03
        adjustments.append("Student → Education weight increased (+0.05), Transport +0.03")

    if profile.marital_status == "single":
        weights["lifestyle"] += 0.08
        adjustments.append("Single → Lifestyle weight increased (+0.08)")
    elif profile.marital_status == "married":
        weights["education"] += 0.08
        weights["grocery"] += 0.04
        adjustments.append("Married → Education weight increased (+0.08), Grocery +0.04")

    # ── Normalize weights to sum to 1.0 ──
    total = sum(weights.values())
    if total > 0:
        weights = {k: round(v / total, 4) for k, v in weights.items()}

    if not adjustments:
        adjustments.append("Profile exists but no specific adjustments triggered")

    return weights, adjustments


def compute_final_score(
    infra: InfrastructureData,
    profile: UserProfile | None = None,
) -> dict:
    """
    Main scoring function. Returns a complete score breakdown.

    Returns dict with:
    - category_scores: normalized 0-100 scores per category
    - weights_used: the weight applied to each category
    - final_score: weighted sum (0-100)
    - infrastructure: raw counts
    - profile_context: how profile influenced weights (if applicable)
    """
    # Step 1 & 2: Raw → Normalized scores
    raw = compute_raw_scores(infra)
    normalized = normalize_scores(raw)

    # Step 3: Generate weights
    weights, adjustments = generate_weights(profile)

    # Step 4: Weighted final score
    final = sum(normalized[k] * weights[k] for k in normalized)
    final = round(min(final, 100), 2)

    result = {
        "category_scores": normalized,
        "weights_used": weights,
        "final_score": final,
        "infrastructure": {
            "hospitals": infra.hospital_count,
            "schools": infra.school_count,
            "bus_stops": infra.bus_stop_count,
            "metro_stations": infra.metro_count,
            "supermarkets": infra.supermarket_count,
            "restaurants": infra.restaurant_count,
            "gyms": getattr(infra, "gym_count", 0),
            "bars": getattr(infra, "bar_count", 0),        },
    }

    # Add profile context if profile exists
    if profile:
        result["profile_context"] = {
            "marital_status": profile.marital_status,
            "has_parents": profile.has_parents,
            "employment_status": profile.employment_status,
            "has_vehicle": getattr(profile, "has_vehicle", False),
            "has_elderly": getattr(profile, "has_elderly", False),
            "has_children": getattr(profile, "has_children", False),
            "income_range": getattr(profile, "income_range", None),
            "adjustments": adjustments,
        }
    else:
        result["profile_context"] = None

    return result