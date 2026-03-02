"""
Scoring response schemas.
"""

from pydantic import BaseModel


class CategoryScores(BaseModel):
    transport: float
    healthcare: float
    education: float
    lifestyle: float
    grocery: float


class WeightsUsed(BaseModel):
    transport: float
    healthcare: float
    education: float
    lifestyle: float
    grocery: float


class ProfileContext(BaseModel):
    """Shows how user profile influenced the weights."""
    marital_status: str
    has_parents: bool
    employment_status: str
    has_vehicle: bool = False
    has_elderly: bool = False
    has_children: bool = False
    income_range: str | None = None
    adjustments: list[str]  # Human-readable explanations


class InfrastructureCounts(BaseModel):
    hospitals: int
    schools: int
    bus_stops: int
    metro_stations: int
    supermarkets: int
    restaurants: int
    gyms: int = 0
    bars: int = 0


class ScoreResponse(BaseModel):
    area_id: int
    area_name: str
    final_score: float
    category_scores: CategoryScores
    weights_used: WeightsUsed
    infrastructure: InfrastructureCounts
    profile_context: ProfileContext | None = None