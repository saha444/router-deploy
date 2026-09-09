"""FastAPI routes for traffic event simulation and impact analysis."""
from __future__ import annotations
import logging
from typing import Dict, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.db.database import get_db
from backend.db.models import TrafficEvent as DBTrafficEvent, Scenario, Route
from backend.schemas.event import (
    TrafficEventCreate, TrafficEventOut, ImpactAnalysisRequest, ImpactAnalysisOut,
    RerouteRequest, RerouteOut
)
from backend.core.traffic import TrafficSimulator
from backend.core.impact_analyzer import ImpactAnalyzer
from backend.core.algorithms.astar import reroute_vehicle, astar_path_cost
from backend.api.network import get_graph

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/events", tags=["Traffic"])

# In-memory simulators per scenario
_simulators: Dict[int, TrafficSimulator] = {}


def get_simulator(scenario_id: int, db: Session) -> TrafficSimulator:
    if scenario_id not in _simulators:
        scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
        if not scenario:
            raise HTTPException(404, f"Scenario {scenario_id} not found")
        graph = get_graph(scenario.network_id)
        _simulators[scenario_id] = TrafficSimulator(graph)
    return _simulators[scenario_id]


@router.post("", response_model=TrafficEventOut)
def create_event(req: TrafficEventCreate, db: Session = Depends(get_db)):
    """Apply a traffic event to the road graph."""
    sim = get_simulator(req.scenario_id, db)

    evt = sim.apply_event(
        event_type=req.event_type,
        edge_u=req.edge_u,
        edge_v=req.edge_v,
        delta_time=req.delta_time,
        delta_congestion=req.delta_congestion,
    )

    db_evt = DBTrafficEvent(
        scenario_id=req.scenario_id,
        event_type=req.event_type,
        edge_u=req.edge_u,
        edge_v=req.edge_v,
        delta_time=req.delta_time,
        delta_congestion=req.delta_congestion,
        road_closed=(req.event_type == "road_closure"),
        active=True,
    )
    db.add(db_evt)
    db.commit()
    db.refresh(db_evt)

    return db_evt


@router.get("/{scenario_id}", response_model=List[TrafficEventOut])
def list_events(scenario_id: int, db: Session = Depends(get_db)):
    return db.query(DBTrafficEvent).filter(DBTrafficEvent.scenario_id == scenario_id).all()


@router.delete("/{event_id}/resolve")
def resolve_event(event_id: int, db: Session = Depends(get_db)):
    """Resolve (deactivate) a traffic event and restore original edge conditions."""
    db_evt = db.query(DBTrafficEvent).filter(DBTrafficEvent.id == event_id).first()
    if not db_evt:
        raise HTTPException(404, "Event not found")

    sim = _simulators.get(db_evt.scenario_id)
    if sim:
        # Find the in-memory event by matching edge
        for mem_evt in sim.all_events():
            if mem_evt.edge_u == db_evt.edge_u and mem_evt.edge_v == db_evt.edge_v and mem_evt.active:
                sim.resolve_event(mem_evt.event_id)
                break

    db_evt.active = False
    db.commit()
    return {"resolved": True, "event_id": event_id}


@router.post("/impact", response_model=ImpactAnalysisOut)
def analyze_impact(req: ImpactAnalysisRequest, db: Session = Depends(get_db)):
    """Analyze the impact of a traffic event on active routes."""
    db_evt = db.query(DBTrafficEvent).filter(DBTrafficEvent.id == req.event_id).first()
    if not db_evt:
        raise HTTPException(404, "Event not found")

    # Collect active route road paths for exposure calculation
    active_routes = db.query(Route).filter(
        Route.scenario_id == req.scenario_id,
        Route.status == "active",
    ).all()

    route_paths: Dict[int, List[List[int]]] = {}
    for r in active_routes:
        route_paths.setdefault(r.vehicle_id, []).append(r.road_path or [])

    analyzer = ImpactAnalyzer(
        alpha=req.alpha,
        beta=req.beta,
        gamma=req.gamma,
        threshold=req.threshold,
    )
    result = analyzer.analyze(
        event_id=req.event_id,
        edge_u=db_evt.edge_u,
        edge_v=db_evt.edge_v,
        delta_time=db_evt.delta_time,
        delta_congestion=db_evt.delta_congestion,
        active_routes=route_paths,
    )

    # Update DB record
    db_evt.impact_score = result.impact_score
    db_evt.triggered_reopt = result.significant
    db.commit()

    return ImpactAnalysisOut(
        event_id=result.event_id,
        edge_u=result.edge_u,
        edge_v=result.edge_v,
        delta_time=result.delta_time,
        delta_congestion=result.delta_congestion,
        route_exposure=result.route_exposure,
        impact_score=result.impact_score,
        significant=result.significant,
        affected_vehicle_ids=result.affected_vehicle_ids,
        threshold=result.threshold,
    )


@router.post("/reroute", response_model=RerouteOut)
def reroute(req: RerouteRequest, db: Session = Depends(get_db)):
    """Perform A* rerouting for an affected vehicle."""
    scenario = db.query(Scenario).filter(Scenario.id == req.scenario_id).first()
    if not scenario:
        raise HTTPException(404, "Scenario not found")

    graph = get_graph(scenario.network_id)
    G = graph.G

    from backend.db.models import Customer as DBCustomer
    customers_db = db.query(DBCustomer).filter(
        DBCustomer.scenario_id == req.scenario_id,
        DBCustomer.id.in_(req.remaining_customer_ids),
    ).all()
    customer_node_map = {c.id: c.node_id for c in customers_db}
    remaining_nodes = [customer_node_map[cid] for cid in req.remaining_customer_ids
                       if cid in customer_node_map]

    new_path = reroute_vehicle(
        G=G,
        current_node=req.current_node,
        remaining_customers=remaining_nodes,
        depot_node=scenario.depot_node,
        weight="travel_time",
    )

    # Estimate new travel time
    new_time = 0.0
    for a, b in zip(new_path[:-1], new_path[1:]):
        if G.has_edge(a, b):
            keys = list(G[a][b].keys())
            new_time += G[a][b][keys[0]].get("travel_time", 0)

    # Estimate improvement over old Dijkstra path
    old_time = astar_path_cost(G, req.current_node, remaining_nodes[-1] if remaining_nodes else scenario.depot_node)
    improvement = max(0.0, old_time - new_time)

    # Update DB route for this vehicle
    db_route = db.query(Route).filter(
        Route.scenario_id == req.scenario_id,
        Route.vehicle_id == req.vehicle_id,
        Route.status == "active",
    ).first()
    if db_route:
        from datetime import datetime
        db_route.road_path = new_path
        db_route.last_rerouted_at = datetime.utcnow()
        db_route.status = "rerouted"
        db.commit()

    return RerouteOut(
        vehicle_id=req.vehicle_id,
        road_path=new_path,
        new_travel_time=round(new_time, 2),
        improvement_seconds=round(improvement, 2),
    )
