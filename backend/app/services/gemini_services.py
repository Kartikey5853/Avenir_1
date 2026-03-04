
"""
Gemini AI service – generates lifestyle recommendations for a location
based only on latitude and longitude. Falls back to a generic message
when the API is unavailable or over quota.
"""


import logging
import httpx
from app.config import settings

logger = logging.getLogger(__name__)

GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "gemini-2.5-flash:generateContent"
)

_FALLBACK_MSG = (
    "AI Recommendation is currently unavailable. "
    "This may be due to an invalid API key, quota limits, or a temporary service outage. "
    "Please try again later."
)



def _build_prompt(lat: float | None = None, lon: float | None = None) -> str:
    """Build a prompt for Gemini using only lat/lon."""
    if lat is not None and lon is not None:
        location_str = f"Latitude: {lat:.4f}, Longitude: {lon:.4f}"
    else:
        location_str = "Unknown location"
    return (
        f"Based only on the coordinates {location_str}, describe in 4-5 sentences what it would be like to live at this place. "
        f"Focus on daily life, amenities, transport, safety, and social atmosphere. "
        f"Your answer should help someone decide if they should live there. "
        f"Do not use bullet points or markdown, just plain text."
    )



def _generate_fallback() -> str:
    """Consistent fallback message when Gemini is unavailable."""
    return _FALLBACK_MSG



async def get_gemini_recommendation(
    lat: float | None = None,
    lon: float | None = None,
) -> str:
    """Call Gemini and return a lifestyle description for the location. Falls back on any failure."""

    if not settings.GEMINI_API_KEY:
        logger.warning("GEMINI_API_KEY not configured.")
        return _generate_fallback()

    prompt = _build_prompt(lat=lat, lon=lon)

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": 400,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(
                f"{GEMINI_URL}?key={settings.GEMINI_API_KEY}",
                json=payload,
            )
            logger.info(f"Gemini status: {resp.status_code}")

            if resp.status_code == 429:
                logger.warning("Gemini quota exceeded (429). Using fallback.")
                return _generate_fallback()

            if resp.status_code != 200:
                logger.error(f"Gemini error {resp.status_code}: {resp.text[:300]}")
                return _generate_fallback()

            data = resp.json()

        text = (
            data.get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [{}])[0]
            .get("text", "")
            or ""
        ).strip()

        # Guard against garbage / suspiciously short responses
        if text and len(text) >= 40:
            return text

        logger.warning(f"Gemini returned a short/empty response ({len(text)} chars). Using fallback.")
        return _generate_fallback()

    except Exception as e:
        logger.error(f"Gemini API error: {e}")
        return _generate_fallback()