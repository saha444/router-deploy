"""Pydantic schemas for network and VRP configuration."""
from __future__ import annotations
from typing import List, Optional
from pydantic import BaseModel, Field


# ── Network ────────────────────────────────────────────────────────────────────

class NetworkLoadRequest(BaseModel):
    city: str = Field("Oxford, England", description="OSM place name to download")
    use_cache: bool = True
    use_synthetic: bool = False
    synthetic_nodes: int = Field(50, ge=10, le=200)


class NetworkResponse(BaseModel):
    network_id: int
    city: str
    node_count: int
    edge_count: int
    is_connected: bool
    bbox: Optional[dict] = None


class NetworkGeoJSON(BaseModel):
    network_id: int
    geojson: dict


# ── VRP Setup ─────────────────────────────────────────────────────────────────

class VehicleCreate(BaseModel):
    name: str
    capacity: float = Field(gt=0)


class CustomerCreate(BaseModel):
    name: Optional[str] = None
    node_id: int
    pickup_weight: float = 0.0
    dropoff_weight: float = 0.0
    lat: float = 0.0
    lon: float = 0.0


class ScenarioCreate(BaseModel):
    network_id: int
    name: str = "Default Scenario"
    depot_node: int
    depot_lat: Optional[float] = None
    depot_lon: Optional[float] = None
    vehicles: List[VehicleCreate]
    customers: List[CustomerCreate]


class ScenarioGenerateRequest(BaseModel):
    """Auto-generate a random VRP scenario on the current network."""
    network_id: int
    name: str = "Auto Scenario"
    n_vehicles: int = Field(3, ge=1, le=20)
    n_customers: int = Field(15, ge=3, le=100)
    vehicle_capacity: float = Field(50.0, gt=0)
    customer_demand_min: float = 1.0
    customer_demand_max: float = 10.0
    random_seed: Optional[int] = 42


class NearestNodeRequest(BaseModel):
    lat: float
    lon: float


class NearestNodeResponse(BaseModel):
    node_id: int
    lat: float
    lon: float
    distance_meters: float


class DemoPresetRequest(BaseModel):
    network_id: int
    preset: str = Field(..., description="'urban_delivery' | 'peakhour_logistics' | 'network_disruption' | 'city_incident'")


class VehicleOut(BaseModel):
    id: int
    name: str
    capacity: float

    class Config:
        from_attributes = True


class CustomerOut(BaseModel):
    id: int
    name: Optional[str]
    node_id: int
    lat: float
    lon: float
    pickup_weight: float
    dropoff_weight: float
    status: str

    class Config:
        from_attributes = True


class ScenarioOut(BaseModel):
    id: int
    network_id: int
    name: str
    depot_node: int
    depot_lat: Optional[float]
    depot_lon: Optional[float]
    vehicles: List[VehicleOut]
    customers: List[CustomerOut]

    class Config:
        from_attributes = True
