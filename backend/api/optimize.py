"""FastAPI routes for running optimization algorithms."""
from __future__ import annotations
import logging
import time
from datetime import datetime
from typing import List, Optional

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session

from backend.db.database import get_db
from backend.db.models import (
    OptimizationRun, ParetoSolution, Scenario, Vehicle, Customer, Route,
    AlgorithmType, RunStatus
)
from backend.schemas.optimization import (
    OptimizeRequest, OptimizationRunOut, ParetoSolutionOut, ObjectivesOut,
    RouteSelectRequest, BenchmarkRequest, BenchmarkResultOut, AlgorithmResultOut
)
from backend.core.vrp import VRPInstance, CustomerDef, VehicleDef, routes_to_node_sequences
from backend.core.algorithms.qpso import ETMaOQPSO
from backend.core.algorithms.pso import ClassicalPSO
from backend.core.algorithms.nsga2 import NSGAII
from backend.core.algorithms.dijkstra import road_path
from backend.core.decision import DecisionModule
from backend.api.network import get_graph
from backend.db.models import BenchmarkRun, BenchmarkResult

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["Optimization"])
decision_module = DecisionModule()


def _build_instance(scenario_id: int, db: Session) -> tuple:
    """Load scenario from DB and build a VRPInstance."""
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(404, f"Scenario {scenario_id} not found")

    graph = get_graph(scenario.network_id)
    vehicles_db = db.query(Vehicle).filter(Vehicle.scenario_id == scenario_id).all()
    customers_db = db.query(Customer).filter(Customer.scenario_id == scenario_id).all()

    if not vehicles_db or not customers_db:
        raise HTTPException(400, "Scenario must have at least one vehicle and one customer")

    instance = VRPInstance(
        graph=graph.G,
        depot_node=scenario.depot_node,
        customers=[CustomerDef(c.id, c.node_id, c.demand, c.lat, c.lon) for c in customers_db],
        vehicles=[VehicleDef(v.id, v.capacity) for v in vehicles_db],
    )
    return instance, scenario, graph


def _run_optimizer(algorithm: str, instance: VRPInstance, req: OptimizeRequest):
    """Execute the requested optimizer and return (archive, convergence)."""
    if algorithm == "qpso":
        opt = ETMaOQPSO(
            instance=instance,
            n_particles=req.n_particles,
            max_iterations=req.max_iterations,
            beta_max=req.beta_max,
            beta_min=req.beta_min,
            archive_size=req.archive_size,
        )
    elif algorithm == "pso":
        opt = ClassicalPSO(
            instance=instance,
            n_particles=req.n_particles,
            max_iterations=req.max_iterations,
            w_inertia=req.w_inertia,
            c1=req.c1,
            c2=req.c2,
        )
    elif algorithm == "nsga2":
        opt = NSGAII(
            instance=instance,
            pop_size=req.n_particles,
            max_iterations=req.max_iterations,
            crossover_prob=req.crossover_prob,
            mutation_prob=req.mutation_prob,
        )
    else:
        raise HTTPException(400, f"Unknown algorithm: {algorithm}")

    return opt.run()


@router.post("/optimize", response_model=OptimizationRunOut)
def run_optimization(req: OptimizeRequest, db: Session = Depends(get_db)):
    """Run the selected optimizer and persist the Pareto solution set."""
    instance, scenario, graph = _build_instance(req.scenario_id, db)

    # Create run record
    run = OptimizationRun(
        scenario_id=req.scenario_id,
        algorithm=AlgorithmType(req.algorithm),
        parameters=req.model_dump(),
        status=RunStatus.running,
        started_at=datetime.utcnow(),
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    try:
        t0 = time.perf_counter()
        archive, convergence = _run_optimizer(req.algorithm, instance, req)
        elapsed = time.perf_counter() - t0

        run.status = RunStatus.completed
        run.completed_at = datetime.utcnow()
        run.runtime_seconds = round(elapsed, 3)
        run.convergence_data = convergence

        # Persist Pareto solutions
        db_solutions = []
        for sol in archive.get_all():
            db_sol = ParetoSolution(
                run_id=run.id,
                route_data={str(k): v for k, v in sol.route_data.items()},
                obj_time=float(sol.objectives[0]),
                obj_distance=float(sol.objectives[1]),
                obj_congestion=float(sol.objectives[2]),
                obj_disruption=float(sol.objectives[3]),
            )
            db.add(db_sol)
            db_solutions.append((sol, db_sol))

        db.commit()
        db.refresh(run)

        # Build response
        solutions_out = []
        for db_sol in db.query(ParetoSolution).filter(ParetoSolution.run_id == run.id).all():
            solutions_out.append(ParetoSolutionOut(
                id=db_sol.id,
                objectives=ObjectivesOut(
                    time=db_sol.obj_time,
                    distance=db_sol.obj_distance,
                    congestion=db_sol.obj_congestion,
                    disruption=db_sol.obj_disruption,
                ),
                route_data=db_sol.route_data,
                is_selected=db_sol.is_selected,
            ))

        return OptimizationRunOut(
            id=run.id,
            scenario_id=run.scenario_id,
            algorithm=run.algorithm.value,
            status=run.status.value,
            runtime_seconds=run.runtime_seconds,
            pareto_solutions=solutions_out,
            convergence_data=convergence,
            archive_summary=archive.summary(),
        )

    except Exception as exc:
        logger.exception("Optimization failed")
        run.status = RunStatus.failed
        run.error_message = str(exc)
        db.commit()
        raise HTTPException(500, str(exc))


@router.post("/routes/select")
def select_route(req: RouteSelectRequest, db: Session = Depends(get_db)):
    """
    Select a solution from the Pareto archive and activate it as the live routes.
    """
    run = db.query(OptimizationRun).filter(OptimizationRun.id == req.run_id).first()
    if not run:
        raise HTTPException(404, "Run not found")

    db_solutions = db.query(ParetoSolution).filter(ParetoSolution.run_id == req.run_id).all()
    if not db_solutions:
        raise HTTPException(404, "No Pareto solutions found for this run")

    from backend.core.algorithms.pareto import ParetoArchive, Solution
    archive = ParetoArchive()
    sol_map = {}
    for ds in db_solutions:
        sol = Solution(
            objectives=np.array([ds.obj_time, ds.obj_distance, ds.obj_congestion, ds.obj_disruption]),
            route_data=ds.route_data,
        )
        archive.add(sol)
        sol_map[id(sol)] = ds

    weights = np.array(req.weights) if req.weights else None
    selected_sol = decision_module.select(archive, strategy=req.strategy, weights=weights)

    if selected_sol is None:
        raise HTTPException(404, "Could not select a solution")

    # Find the DB record for the selected solution
    selected_db = None
    for ds in db_solutions:
        if (abs(ds.obj_time - selected_sol.objectives[0]) < 1e-3 and
                abs(ds.obj_distance - selected_sol.objectives[1]) < 1e-3):
            selected_db = ds
            break

    if selected_db is None:
        selected_db = db_solutions[0]

    # Mark selected
    for ds in db_solutions:
        ds.is_selected = False
    selected_db.is_selected = True

    # Write active routes
    instance, scenario, graph = _build_instance(run.scenario_id, db)
    cust_map = {c.customer_id: c.node_id for c in instance.customers}

    # Clear existing active routes
    db.query(Route).filter(Route.scenario_id == run.scenario_id).delete()

    for vid_str, cust_ids in selected_db.route_data.items():
        vid = int(vid_str)
        node_seq = [scenario.depot_node] + [cust_map[int(cid)] for cid in cust_ids] + [scenario.depot_node]
        # Build full road path via Dijkstra
        full_path = []
        for a, b in zip(node_seq[:-1], node_seq[1:]):
            seg = road_path(graph.G, a, b)
            if full_path:
                full_path.extend(seg[1:])
            else:
                full_path.extend(seg)

        db.add(Route(
            scenario_id=run.scenario_id,
            vehicle_id=vid,
            solution_id=selected_db.id,
            customer_sequence=[int(c) for c in cust_ids],
            road_path=full_path,
            status="active",
        ))

    db.commit()
    return {"selected_solution_id": selected_db.id, "strategy": req.strategy}


@router.get("/routes/{scenario_id}")
def get_routes(scenario_id: int, db: Session = Depends(get_db)):
    """Return all active routes for a scenario."""
    routes = db.query(Route).filter(Route.scenario_id == scenario_id, Route.status == "active").all()
    return [
        {
            "route_id": r.id,
            "vehicle_id": r.vehicle_id,
            "customer_sequence": r.customer_sequence,
            "road_path": r.road_path,
            "status": r.status,
        }
        for r in routes
    ]


@router.post("/benchmark", response_model=BenchmarkResultOut)
def run_benchmark(req: BenchmarkRequest, db: Session = Depends(get_db)):
    """Run PSO, NSGA-II, and ET-MaO-QPSO on the same scenario and compare."""
    instance, scenario, graph = _build_instance(req.scenario_id, db)

    bm_run = BenchmarkRun(scenario_id=req.scenario_id, started_at=datetime.utcnow())
    db.add(bm_run)
    db.commit()
    db.refresh(bm_run)

    results_out = []
    for algo in ["pso", "nsga2", "qpso"]:
        fake_req = OptimizeRequest(
            scenario_id=req.scenario_id,
            algorithm=algo,
            n_particles=req.n_particles,
            max_iterations=req.max_iterations,
        )
        t0 = time.perf_counter()
        try:
            archive, convergence = _run_optimizer(algo, instance, fake_req)
        except Exception as exc:
            logger.error("Benchmark %s failed: %s", algo, exc)
            continue
        elapsed = time.perf_counter() - t0

        hv = archive.hypervolume()
        best_t = archive.best_by("time")
        best_d = archive.best_by("distance")
        best_c = archive.best_by("congestion")

        db_result = BenchmarkResult(
            benchmark_run_id=bm_run.id,
            algorithm=AlgorithmType(algo),
            num_pareto_solutions=len(archive),
            hypervolume=round(hv, 4),
            best_time=float(best_t.objectives[0]) if best_t else None,
            best_distance=float(best_d.objectives[1]) if best_d else None,
            best_congestion=float(best_c.objectives[2]) if best_c else None,
            runtime_seconds=round(elapsed, 3),
            convergence_data=convergence,
        )
        db.add(db_result)

        results_out.append(AlgorithmResultOut(
            algorithm=algo,
            num_pareto_solutions=len(archive),
            hypervolume=round(hv, 4),
            best_time=float(best_t.objectives[0]) if best_t else None,
            best_distance=float(best_d.objectives[1]) if best_d else None,
            best_congestion=float(best_c.objectives[2]) if best_c else None,
            runtime_seconds=round(elapsed, 3),
            convergence_data=convergence,
        ))

    bm_run.completed_at = datetime.utcnow()
    db.commit()

    return BenchmarkResultOut(
        benchmark_id=bm_run.id,
        scenario_id=req.scenario_id,
        results=results_out,
    )
