"""Pydantic schemas for traffic events and impact analysis."""
from __future__ import annotations
from typing import List, Optional
from pydantic import BaseModel, Field


class TrafficEventCreate(BaseModel):
    scenario_id: int
    event_type: str = Field(..., pattern="^(accident|road_closure|congestion_spike|recovery)$")
    edge_u: int
    edge_v: int
    delta_time: float = Field(0.0, ge=0.0, description="Additional travel time in seconds")
    delta_congestion: float = Field(0.0, ge=0.0, le=100.0, description="Congestion increase 0–100")


class TrafficEventOut(BaseModel):
    id: int
    event_type: str
    edge_u: int
    edge_v: int
    delta_time: float
    delta_congestion: float
    road_closed: bool
    active: bool
    impact_score: Optional[float]
    triggered_reopt: bool

    class Config:
        from_attributes = True


class ImpactAnalysisRequest(BaseModel):
    scenario_id: int
    event_id: int
    alpha: float = Field(0.4, ge=0.0, le=10.0)
    beta: float = Field(0.3, ge=0.0, le=10.0)
    gamma: float = Field(30.0, ge=0.0, le=100.0)
    threshold: float = Field(50.0, ge=0.0)


class ImpactAnalysisOut(BaseModel):
    event_id: int
    edge_u: int
    edge_v: int
    delta_time: float
    delta_congestion: float
    route_exposure: int
    impact_score: float
    significant: bool
    affected_vehicle_ids: List[int]
    threshold: float


class RerouteRequest(BaseModel):
    scenario_id: int
    vehicle_id: int
    current_node: int
    remaining_customer_ids: List[int]
    algorithm: str = Field("astar", pattern="^(astar|dijkstra)$")


class RerouteOut(BaseModel):
    vehicle_id: int
    road_path: List[int]
    new_travel_time: float
    improvement_seconds: float
