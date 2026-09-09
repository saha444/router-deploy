"""Pydantic schemas for optimization runs and Pareto solutions."""
from __future__ import annotations
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class OptimizeRequest(BaseModel):
    scenario_id: int
    algorithm: str = Field("qpso", pattern="^(qpso|pso|nsga2)$")
    n_particles: int = Field(30, ge=5, le=200)
    max_iterations: int = Field(50, ge=5, le=500)
    # QPSO-specific
    beta_max: float = Field(1.0, ge=0.1, le=2.0)
    beta_min: float = Field(0.5, ge=0.1, le=2.0)
    archive_size: int = Field(100, ge=10, le=500)
    # PSO-specific
    w_inertia: float = Field(0.7, ge=0.0, le=1.0)
    c1: float = Field(1.5, ge=0.0, le=3.0)
    c2: float = Field(1.5, ge=0.0, le=3.0)
    # NSGA-II
    crossover_prob: float = Field(0.9, ge=0.0, le=1.0)
    mutation_prob: float = Field(0.1, ge=0.0, le=1.0)


class ObjectivesOut(BaseModel):
    time: float
    distance: float
    congestion: float
    disruption: float


class ParetoSolutionOut(BaseModel):
    id: int
    objectives: ObjectivesOut
    route_data: Dict[str, List[int]]
    is_selected: bool


class OptimizationRunOut(BaseModel):
    id: int
    scenario_id: int
    algorithm: str
    status: str
    runtime_seconds: Optional[float]
    pareto_solutions: List[ParetoSolutionOut]
    convergence_data: List[dict]
    archive_summary: Optional[dict] = None

    class Config:
        from_attributes = True


class RouteSelectRequest(BaseModel):
    run_id: int
    strategy: str = Field("balanced", pattern="^(balanced|min_time|min_congestion|min_disruption|lexicographic)$")
    weights: Optional[List[float]] = None


class BenchmarkRequest(BaseModel):
    scenario_id: int
    n_particles: int = Field(20, ge=5, le=100)
    max_iterations: int = Field(30, ge=5, le=200)


class AlgorithmResultOut(BaseModel):
    algorithm: str
    num_pareto_solutions: int
    hypervolume: Optional[float]
    best_time: Optional[float]
    best_distance: Optional[float]
    best_congestion: Optional[float]
    runtime_seconds: Optional[float]
    convergence_data: List[dict]


class BenchmarkResultOut(BaseModel):
    benchmark_id: int
    scenario_id: int
    results: List[AlgorithmResultOut]
