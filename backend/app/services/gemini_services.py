"""
Gemini AI service – generates locality recommendations based on
user profile and scoring data. Falls back to a deterministic
generic recommendation when the API is unavailable or over quota.
"""

import logging
import httpx
from app.config import settings

logger = logging.getLogger(__name__)

GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "gemini-2.0-flash:generateContent"
)


def _build_prompt(
    locality_name: str,
    final_score: float,
    category_scores: dict,
    infrastructure: dict,
    profile: dict | None,
) -> str:
    """Build a deterministic prompt so Gemini returns a consistent short paragraph."""

    # ── System instruction telling Gemini exactly what we need ──
    system = (
        "You are Avenir, a concise lifestyle advisor for people considering "
        "localities in Hyderabad, India. "
        "Given locality score data and the user's personal profile, write "
        "EXACTLY 2-3 short sentences recommending whether this locality suits "
        "the person. Be specific about strengths and weaknesses based on the "
        "numbers provided. Do NOT use bullet points, markdown, bold, italics, "
        "headings, or asterisks. Keep the tone friendly and direct. "
        "If the user profile is missing or incomplete, give a general "
        "recommendation based on the scores alone."
    )

    # ── User profile section ──
    if profile and any(v for v in profile.values() if v is not None):
        profile_lines = []
        if profile.get("marital_status"):
            profile_lines.append(f"Marital status: {profile['marital_status']}")
        if profile.get("employment_status"):
            profile_lines.append(f"Employment: {profile['employment_status']}")
        if profile.get("income_range"):
            profile_lines.append(f"Income range: {profile['income_range']}")
        if profile.get("has_vehicle") is not None:
            profile_lines.append(f"Has vehicle: {'Yes' if profile['has_vehicle'] else 'No'}")
        if profile.get("has_elderly") is not None:
            profile_lines.append(f"Has elderly dependents: {'Yes' if profile['has_elderly'] else 'No'}")
        if profile.get("has_children") is not None:
            profile_lines.append(f"Has children: {'Yes' if profile['has_children'] else 'No'}")
        if profile.get("has_parents") is not None:
            profile_lines.append(f"Living with parents: {'Yes' if profile['has_parents'] else 'No'}")
        profile_section = "; ".join(profile_lines) if profile_lines else "No profile data available."
    else:
        profile_section = "No profile data available."

    # ── Infrastructure counts ──
    infra_section = ", ".join(
        f"{k.replace('_', ' ').title()}: {v}" for k, v in infrastructure.items()
    )

    # ── Category scores ──
    scores_section = ", ".join(
        f"{k.replace('_', ' ').title()}: {v}/100" for k, v in category_scores.items()
    )

    return f"""{system}

Locality: {locality_name}
Overall Lifestyle Score: {final_score}/100
Category Scores: {scores_section}
Nearby Infrastructure: {infra_section}
User Profile: {profile_section}

Write your 2-3 sentence recommendation now (plain text only):"""


def _generate_fallback(
    locality_name: str,
    final_score: float,
    category_scores: dict,
    infrastructure: dict,
    profile: dict | None,
) -> str:
    """
    Generate a deterministic, data-driven recommendation when Gemini
    is unavailable. Never hallucinates – only uses the numbers provided.
    """
    # Find best and worst categories
    if category_scores:
        best = max(category_scores, key=category_scores.get)
        worst = min(category_scores, key=category_scores.get)
        best_label = best.replace("_", " ").title()
        worst_label = worst.replace("_", " ").title()
    else:
        best_label = worst_label = None

    # Score tier
    if final_score >= 75:
        tier = "a strong choice"
    elif final_score >= 55:
        tier = "a decent option"
    elif final_score >= 35:
        tier = "a below-average option"
    else:
        tier = "not well-suited"

    sentence1 = f"{locality_name} scores {final_score}/100 overall, making it {tier} for your lifestyle needs."    # Strengths / weaknesses
    parts = []
    best_score = category_scores.get(best, 0) if best else 0
    worst_score = category_scores.get(worst, 0) if worst else 0
    if best_label and worst_label and best_label != worst_label:
        parts.append(
            "Its strongest area is %s (%d/100) while %s (%d/100) could use improvement."
            % (best_label, best_score, worst_label, worst_score)
        )
    elif best_label:
        parts.append("It performs best in %s (%d/100)." % (best_label, best_score))

    # Personalisation hint
    if profile:
        if profile.get("has_elderly") and category_scores.get("healthcare", 0) < 50:
            parts.append("Healthcare access may be a concern for elderly family members.")
        elif profile.get("has_children") and category_scores.get("education", 0) < 50:
            parts.append("Educational facilities are limited, which matters for families with children.")
        elif not profile.get("has_vehicle") and category_scores.get("transport", 0) < 50:
            parts.append("Public transport is limited — consider this if you don't own a vehicle.")

    if not parts:
        parts.append("Explore the detailed scores above to see which categories matter most to you.")

    return sentence1 + " " + " ".join(parts)


async def get_gemini_recommendation(
    locality_name: str,
    final_score: float,
    category_scores: dict,
    infrastructure: dict,
    profile: dict | None,
) -> str:
    """Call Gemini API and return a short recommendation paragraph.
    Falls back to a deterministic generic response on any failure."""

    prompt = _build_prompt(
        locality_name, final_score, category_scores, infrastructure, profile
    )

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.4,
            "maxOutputTokens": 200,
            "topP": 0.8,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{GEMINI_URL}?key={settings.GEMINI_API_KEY}",
                json=payload,
            )

            if resp.status_code == 429:
                logger.warning("Gemini API quota exceeded (429). Using fallback.")
                return _generate_fallback(
                    locality_name, final_score, category_scores,
                    infrastructure, profile,
                )

            resp.raise_for_status()
            data = resp.json()

        # Extract text from Gemini response
        text = (
            data.get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [{}])[0]
            .get("text", "")
        )
        if text and text.strip():
            return text.strip()

        logger.warning("Gemini returned empty text. Using fallback.")
        return _generate_fallback(
            locality_name, final_score, category_scores,
            infrastructure, profile,
        )

    except Exception as e:
        logger.error(f"Gemini API error: {e}")
        return _generate_fallback(
            locality_name, final_score, category_scores,
            infrastructure, profile,
        )