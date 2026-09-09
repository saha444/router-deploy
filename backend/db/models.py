"""SQLAlchemy ORM models for ROUTER."""
from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Float, JSON, DateTime, Boolean,
    ForeignKey, Text, Enum as SAEnum
)
from sqlalchemy.orm import relationship
import enum

from backend.db.database import Base


class EventType(str, enum.Enum):
    accident = "accident"
    road_closure = "road_closure"
    congestion_spike = "congestion_spike"
    recovery = "recovery"


class AlgorithmType(str, enum.Enum):
    qpso = "qpso"
    pso = "pso"
    nsga2 = "nsga2"


class RunStatus(str, enum.Enum):
    pending = "pending"
    running = "running"
    completed = "completed"
    failed = "failed"


# ─────────────────────────────────────────────────────────────
# Network
# ─────────────────────────────────────────────────────────────

class Network(Base):
    """Stores metadata for a loaded OSM road network."""
    __tablename__ = "networks"

    id = Column(Integer, primary_key=True, index=True)
    city = Column(String, nullable=False)
    bbox_north = Column(Float, nullable=True)
    bbox_south = Column(Float, nullable=True)
    bbox_east = Column(Float, nullable=True)
    bbox_west = Column(Float, nullable=True)
    node_count = Column(Integer, default=0)
    edge_count = Column(Integer, default=0)
    graph_file = Column(String, nullable=True)   # path to pickled nx graph
    created_at = Column(DateTime, default=datetime.utcnow)

    scenarios = relationship("Scenario", back_populates="network")


# ─────────────────────────────────────────────────────────────
# Scenario (one VRP problem instance)
# ─────────────────────────────────────────────────────────────

class Scenario(Base):
    """A VRP scenario: network + depot + customers + vehicles."""
    __tablename__ = "scenarios"

    id = Column(Integer, primary_key=True, index=True)
    network_id = Column(Integer, ForeignKey("networks.id"), nullable=False)
    name = Column(String, default="Default Scenario")
    depot_node = Column(Integer, nullable=True)   # OSM node id
    depot_lat = Column(Float, nullable=True)
    depot_lon = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    network = relationship("Network", back_populates="scenarios")
    vehicles = relationship("Vehicle", back_populates="scenario", cascade="all, delete-orphan")
    customers = relationship("Customer", back_populates="scenario", cascade="all, delete-orphan")
    traffic_events = relationship("TrafficEvent", back_populates="scenario", cascade="all, delete-orphan")
    optimization_runs = relationship("OptimizationRun", back_populates="scenario", cascade="all, delete-orphan")
    benchmark_runs = relationship("BenchmarkRun", back_populates="scenario", cascade="all, delete-orphan")


# ─────────────────────────────────────────────────────────────
# Vehicle
# ─────────────────────────────────────────────────────────────

class Vehicle(Base):
    """A vehicle in the VRP fleet."""
    __tablename__ = "vehicles"

    id = Column(Integer, primary_key=True, index=True)
    scenario_id = Column(Integer, ForeignKey("scenarios.id"), nullable=False)
    name = Column(String, nullable=False)
    capacity = Column(Float, nullable=False)

    scenario = relationship("Scenario", back_populates="vehicles")
    routes = relationship("Route", back_populates="vehicle", cascade="all, delete-orphan")


# ─────────────────────────────────────────────────────────────
# Customer
# ─────────────────────────────────────────────────────────────

class Customer(Base):
    """A delivery customer in the VRP."""
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    scenario_id = Column(Integer, ForeignKey("scenarios.id"), nullable=False)
    name = Column(String, nullable=True)
    node_id = Column(Integer, nullable=False)    # OSM node id
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    pickup_weight = Column(Float, nullable=False, default=0.0)
    dropoff_weight = Column(Float, nullable=False, default=0.0)
    status = Column(String, default="pending")   # pending | served

    scenario = relationship("Scenario", back_populates="customers")


# ─────────────────────────────────────────────────────────────
# Traffic Event
# ─────────────────────────────────────────────────────────────

class TrafficEvent(Base):
    """A simulated traffic event on a road edge."""
    __tablename__ = "traffic_events"

    id = Column(Integer, primary_key=True, index=True)
    scenario_id = Column(Integer, ForeignKey("scenarios.id"), nullable=False)
    event_type = Column(SAEnum(EventType), nullable=False)
    edge_u = Column(Integer, nullable=False)
    edge_v = Column(Integer, nullable=False)
    delta_time = Column(Float, default=0.0)         # seconds added
    delta_congestion = Column(Float, default=0.0)   # 0‒100 scale
    road_closed = Column(Boolean, default=False)
    active = Column(Boolean, default=True)
    impact_score = Column(Float, nullable=True)
    triggered_reopt = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    scenario = relationship("Scenario", back_populates="traffic_events")


# ─────────────────────────────────────────────────────────────
# Optimization Run
# ─────────────────────────────────────────────────────────────

class OptimizationRun(Base):
    """A single optimization run (QPSO, PSO, or NSGA-II)."""
    __tablename__ = "optimization_runs"

    id = Column(Integer, primary_key=True, index=True)
    scenario_id = Column(Integer, ForeignKey("scenarios.id"), nullable=False)
    algorithm = Column(SAEnum(AlgorithmType), nullable=False)
    parameters = Column(JSON, default={})
    status = Column(SAEnum(RunStatus), default=RunStatus.pending)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    runtime_seconds = Column(Float, nullable=True)
    convergence_data = Column(JSON, default=[])   # list of {iteration, hypervolume}
    error_message = Column(Text, nullable=True)

    scenario = relationship("Scenario", back_populates="optimization_runs")
    pareto_solutions = relationship("ParetoSolution", back_populates="run", cascade="all, delete-orphan")


# ─────────────────────────────────────────────────────────────
# Pareto Solution
# ─────────────────────────────────────────────────────────────

class ParetoSolution(Base):
    """One non-dominated solution in the Pareto archive."""
    __tablename__ = "pareto_solutions"

    id = Column(Integer, primary_key=True, index=True)
    run_id = Column(Integer, ForeignKey("optimization_runs.id"), nullable=False)
    route_data = Column(JSON, nullable=False)   # {vehicle_id: [customer_ids]}
    road_paths = Column(JSON, default={})       # {vehicle_id: [[node_ids]]} per segment
    obj_time = Column(Float, nullable=False)
    obj_distance = Column(Float, nullable=False)
    obj_congestion = Column(Float, nullable=False)
    obj_disruption = Column(Float, nullable=False)
    is_selected = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    run = relationship("OptimizationRun", back_populates="pareto_solutions")


# ─────────────────────────────────────────────────────────────
# Route (currently active)
# ─────────────────────────────────────────────────────────────

class Route(Base):
    """Currently active route for a vehicle (derived from selected Pareto solution)."""
    __tablename__ = "routes"

    id = Column(Integer, primary_key=True, index=True)
    scenario_id = Column(Integer, ForeignKey("scenarios.id"), nullable=False)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=False)
    solution_id = Column(Integer, ForeignKey("pareto_solutions.id"), nullable=True)
    customer_sequence = Column(JSON, default=[])   # [customer_ids in visit order]
    road_path = Column(JSON, default=[])           # full road node sequence
    status = Column(String, default="active")      # active | rerouted | completed
    last_rerouted_at = Column(DateTime, nullable=True)

    vehicle = relationship("Vehicle", back_populates="routes")


# ─────────────────────────────────────────────────────────────
# Benchmark
# ─────────────────────────────────────────────────────────────

class BenchmarkRun(Base):
    """A benchmarking session running all 3 algorithms on the same data."""
    __tablename__ = "benchmark_runs"

    id = Column(Integer, primary_key=True, index=True)
    scenario_id = Column(Integer, ForeignKey("scenarios.id"), nullable=False)
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    scenario = relationship("Scenario", back_populates="benchmark_runs")
    results = relationship("BenchmarkResult", back_populates="benchmark_run", cascade="all, delete-orphan")


class BenchmarkResult(Base):
    """Per-algorithm result for a benchmark run."""
    __tablename__ = "benchmark_results"

    id = Column(Integer, primary_key=True, index=True)
    benchmark_run_id = Column(Integer, ForeignKey("benchmark_runs.id"), nullable=False)
    algorithm = Column(SAEnum(AlgorithmType), nullable=False)
    num_pareto_solutions = Column(Integer, default=0)
    hypervolume = Column(Float, nullable=True)
    best_time = Column(Float, nullable=True)
    best_distance = Column(Float, nullable=True)
    best_congestion = Column(Float, nullable=True)
    runtime_seconds = Column(Float, nullable=True)
    convergence_data = Column(JSON, default=[])  # [{iteration, hypervolume}]

    benchmark_run = relationship("BenchmarkRun", back_populates="results")
