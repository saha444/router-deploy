"""FastAPI routes for road network management."""
from __future__ import annotations
import pickle
import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.db.database import get_db
from backend.db.models import Network
from backend.core.graph import RoadGraph, DATA_DIR
from backend.schemas.network import (
    NetworkLoadRequest, NetworkResponse, NetworkGeoJSON,
    ScenarioCreate, ScenarioGenerateRequest, ScenarioOut,
    VehicleOut, CustomerOut, NearestNodeRequest, NearestNodeResponse, DemoPresetRequest
)
from backend.db.models import Scenario, Vehicle, Customer

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/network", tags=["Network"])

# In-memory graph cache (network_id → RoadGraph)
_graph_cache: dict = {}


from backend.db.database import get_db, SessionLocal

def get_graph(network_id: int) -> RoadGraph:
    if network_id in _graph_cache:
        return _graph_cache[network_id]
    # Try auto-recovery from database
    db = SessionLocal()
    try:
        net = db.query(Network).filter(Network.id == network_id).first()
        if net:
            if "Synthetic" in net.city:
                g = RoadGraph.synthetic(n_nodes=max(20, net.node_count), seed=42)
            else:
                g = RoadGraph.load(city=net.city, cache=True)
            _graph_cache[network_id] = g
            return g
    except Exception as exc:
        logger.warning("Could not auto-recover graph %d: %s", network_id, exc)
    finally:
        db.close()
    raise HTTPException(status_code=404, detail=f"Graph {network_id} not loaded in memory. Reload the network.")


@router.post("/load", response_model=NetworkResponse)
def load_network(req: NetworkLoadRequest, db: Session = Depends(get_db)):
    """Download or load from cache an OSM road network."""
    try:
        if req.use_synthetic:
            graph = RoadGraph.synthetic(n_nodes=req.synthetic_nodes, seed=42)
            city_name = f"Synthetic ({req.synthetic_nodes} nodes)"
        else:
            graph = RoadGraph.load(city=req.city, cache=req.use_cache)
            city_name = req.city
    except Exception as exc:
        logger.error("Graph load failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))

    stats = graph.stats()
    G = graph.G

    # Compute bounding box from node coords
    lats = [d.get("y", 0) for _, d in G.nodes(data=True)]
    lons = [d.get("x", 0) for _, d in G.nodes(data=True)]
    bbox = {
        "north": max(lats), "south": min(lats),
        "east": max(lons), "west": min(lons),
    } if lats else None

    # Persist metadata
    db_network = Network(
        city=city_name,
        node_count=stats["node_count"],
        edge_count=stats["edge_count"],
        bbox_north=bbox["north"] if bbox else None,
        bbox_south=bbox["south"] if bbox else None,
        bbox_east=bbox["east"] if bbox else None,
        bbox_west=bbox["west"] if bbox else None,
    )
    db.add(db_network)
    db.commit()
    db.refresh(db_network)

    # Cache in memory
    _graph_cache[db_network.id] = graph

    return NetworkResponse(
        network_id=db_network.id,
        city=city_name,
        node_count=stats["node_count"],
        edge_count=stats["edge_count"],
        is_connected=stats["is_connected"],
        bbox=bbox,
    )


@router.get("/{network_id}/geojson", response_model=NetworkGeoJSON)
def get_geojson(network_id: int):
    """Return the road network as GeoJSON for Leaflet rendering."""
    graph = get_graph(network_id)
    return NetworkGeoJSON(network_id=network_id, geojson=graph.to_geojson())


@router.get("/{network_id}/nodes")
def get_nodes(network_id: int):
    """Return all node IDs and coordinates."""
    graph = get_graph(network_id)
    return [
        {"id": nid, "lat": data.get("y", 0), "lon": data.get("x", 0)}
        for nid, data in graph.G.nodes(data=True)
    ]


@router.get("/{network_id}/stats")
def get_stats(network_id: int, db: Session = Depends(get_db)):
    graph = get_graph(network_id)
    return graph.stats()


@router.post("/scenario/generate", response_model=ScenarioOut)
def generate_scenario(req: ScenarioGenerateRequest, db: Session = Depends(get_db)):
    """Auto-generate a random VRP scenario on the loaded network."""
    import numpy as np
    graph = get_graph(req.network_id)
    rng = np.random.default_rng(req.random_seed)

    all_nodes = list(graph.G.nodes())
    if len(all_nodes) < req.n_customers + 1:
        raise HTTPException(status_code=400, detail="Not enough nodes for the requested scenario size.")

    selected = rng.choice(len(all_nodes), size=req.n_customers + 1, replace=False)
    depot_node = int(all_nodes[selected[0]])
    customer_nodes = [int(all_nodes[i]) for i in selected[1:]]

    depot_data = graph.G.nodes[depot_node]
    depot_lat = float(depot_data.get("y", 0))
    depot_lon = float(depot_data.get("x", 0))

    db_scenario = Scenario(
        network_id=req.network_id,
        name=req.name,
        depot_node=depot_node,
        depot_lat=depot_lat,
        depot_lon=depot_lon,
    )
    db.add(db_scenario)
    db.flush()

    for i in range(req.n_vehicles):
        db.add(Vehicle(
            scenario_id=db_scenario.id,
            name=f"V{i + 1}",
            capacity=req.vehicle_capacity,
        ))

    for i, nid in enumerate(customer_nodes):
        ndata = graph.G.nodes[nid]
        demand = float(rng.uniform(req.customer_demand_min, req.customer_demand_max))
        # For auto-generated scenarios, just assign the demand to dropoff
        db.add(Customer(
            scenario_id=db_scenario.id,
            name=f"C{i + 1}",
            node_id=nid,
            lat=float(ndata.get("y", 0)),
            lon=float(ndata.get("x", 0)),
            pickup_weight=0.0,
            dropoff_weight=round(demand, 2),
        ))

    db.commit()
    db.refresh(db_scenario)
    return db_scenario


@router.post("/{network_id}/nearest_node", response_model=NearestNodeResponse)
def find_nearest_node(network_id: int, req: NearestNodeRequest):
    """Find the nearest road network node to (lat, lon) coordinates."""
    graph = get_graph(network_id)
    nid, nlat, nlon, dist = graph.nearest_node(req.lat, req.lon)
    return NearestNodeResponse(
        node_id=nid,
        lat=nlat,
        lon=nlon,
        distance_meters=dist,
    )


@router.post("/scenario", response_model=ScenarioOut)
def create_custom_scenario(req: ScenarioCreate, db: Session = Depends(get_db)):
    """Create a scenario with custom user-placed depot, vehicles, and stops."""
    graph = get_graph(req.network_id)
    depot_node = req.depot_node
    depot_data = graph.G.nodes[depot_node] if depot_node in graph.G else {}
    depot_lat = req.depot_lat if (req.depot_lat is not None and req.depot_lat != 0.0) else float(depot_data.get("y", 0))
    depot_lon = req.depot_lon if (req.depot_lon is not None and req.depot_lon != 0.0) else float(depot_data.get("x", 0))

    db_scenario = Scenario(
        network_id=req.network_id,
        name=req.name,
        depot_node=depot_node,
        depot_lat=depot_lat,
        depot_lon=depot_lon,
    )
    db.add(db_scenario)
    db.flush()

    for v in req.vehicles:
        db.add(Vehicle(
            scenario_id=db_scenario.id,
            name=v.name,
            capacity=v.capacity,
        ))

    for i, c in enumerate(req.customers):
        if c.node_id not in graph.G:
            raise HTTPException(status_code=400, detail=f"Customer node {c.node_id} not in network.")
        ndata = graph.G.nodes[c.node_id]
        clat = c.lat if c.lat != 0.0 else float(ndata.get("y", 0))
        clon = c.lon if c.lon != 0.0 else float(ndata.get("x", 0))
        db.add(Customer(
            scenario_id=db_scenario.id,
            name=c.name or f"C{i + 1}",
            node_id=c.node_id,
            lat=clat,
            lon=clon,
            pickup_weight=c.pickup_weight,
            dropoff_weight=c.dropoff_weight,
        ))

    db.commit()
    db.refresh(db_scenario)
    return db_scenario


@router.post("/scenario/preset", response_model=ScenarioOut)
def generate_preset_scenario(req: DemoPresetRequest, db: Session = Depends(get_db)):
    """Generate one of the 4 standard demo scenarios."""
    configs = {
        "urban_delivery": {
            "name": "Urban Delivery",
            "n_vehicles": 5,
            "n_customers": 25,
            "vehicle_capacity": 60.0,
            "seed": 101,
        },
        "peakhour_logistics": {
            "name": "Peak-Hour Logistics",
            "n_vehicles": 8,
            "n_customers": 50,
            "vehicle_capacity": 80.0,
            "seed": 202,
        },
        "network_disruption": {
            "name": "Network Disruption",
            "n_vehicles": 5,
            "n_customers": 25,
            "vehicle_capacity": 60.0,
            "seed": 303,
        },
        "city_incident": {
            "name": "City Incident",
            "n_vehicles": 4,
            "n_customers": 20,
            "vehicle_capacity": 50.0,
            "seed": 404,
        },
    }

    cfg = configs.get(req.preset, configs["urban_delivery"])
    graph = get_graph(req.network_id)
    max_avail = max(3, len(graph.G.nodes()) - 1)
    actual_customers = min(cfg["n_customers"], max_avail)
    actual_vehicles = min(cfg["n_vehicles"], max(1, actual_customers // 2))

    gen_req = ScenarioGenerateRequest(
        network_id=req.network_id,
        name=cfg["name"],
        n_vehicles=actual_vehicles,
        n_customers=actual_customers,
        vehicle_capacity=cfg["vehicle_capacity"],
        random_seed=cfg["seed"],
    )
    return generate_scenario(gen_req, db)


import json
import urllib.request
from pydantic import BaseModel
from typing import List

class RouteGeometryRequest(BaseModel):
    waypoints: List[List[float]]

@router.post("/route-geometry")
def get_route_geometry(req: RouteGeometryRequest):
    """Proxy road driving geometry from OSRM or fallback."""
    if len(req.waypoints) < 2:
        return {"coordinates": req.waypoints, "distance_meters": 0, "duration_seconds": 0}

    coord_str = ";".join(f"{wp[1]},{wp[0]}" for wp in req.waypoints)
    url = f"http://router.project-osrm.org/route/v1/driving/{coord_str}?overview=full&geometries=geojson"
    try:
        req_obj = urllib.request.Request(url, headers={"User-Agent": "RouterApp/1.0"})
        with urllib.request.urlopen(req_obj, timeout=5) as resp:
            data = json.loads(resp.read().decode())
            if data.get("routes") and len(data["routes"]) > 0:
                route = data["routes"][0]
                # Convert [lon, lat] -> [lat, lon]
                coords = [[c[1], c[0]] for c in route["geometry"]["coordinates"]]
                return {
                    "coordinates": coords,
                    "distance_meters": route.get("distance", 0),
                    "duration_seconds": route.get("duration", 0),
                }
    except Exception as exc:
        logger.warning("OSRM proxy error: %s", exc)

    return {"coordinates": req.waypoints, "distance_meters": 0, "duration_seconds": 0}

