"""
Scoring response schemas.
"""

from typing import Optional
from pydantic import BaseModel


class CategoryScores(BaseModel):
    safety:    float
    family:    float
    transport: float
    lifestyle: float
    grocery:   float


class ScoreResponse(BaseModel):
    area_id:         int
    area_name:       str
    overall_score:   float
    category_scores: CategoryScores
    weights:         dict[str, float]
    summary:         str
    highlights:      list[str]
    concerns:        list[str]
    counts:          Optional[dict[str, int]] = None   # raw facility counts
    radius_m:        Optional[int] = None
