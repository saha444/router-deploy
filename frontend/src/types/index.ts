// Shared TypeScript types mirroring backend Pydantic schemas

export interface NetworkResponse {
  network_id: number;
  city: string;
  node_count: number;
  edge_count: number;
  is_connected: boolean;
  bbox?: { north: number; south: number; east: number; west: number };
}

export interface NodeInfo {
  id: number;
  lat: number;
  lon: number;
}

export interface ScenarioVehicle {
  id: number;
  name: string;
  capacity: number;
}

export interface ScenarioCustomer {
  id: number;
  name: string | null;
  node_id: number;
  lat: number;
  lon: number;
  pickup_weight: number;
  dropoff_weight: number;
  status: string;
}

export interface ScenarioOut {
  id: number;
  network_id: number;
  name: string;
  depot_node: number;
  depot_lat: number | null;
  depot_lon: number | null;
  vehicles: ScenarioVehicle[];
  customers: ScenarioCustomer[];
}

export interface VehicleCreate {
  name: string;
  capacity: number;           // max carriable weight (kg)
  currentWeight?: number;     // actual weight currently loaded at depot (kg)
  status?: 'running' | 'dormant'; // only 'running' vehicles join optimization
}

export interface CustomerCreate {
  name?: string;
  node_id: number;
  pickup_weight: number;
  dropoff_weight: number;
  lat: number;
  lon: number;
  vehicleIdx?: number;
}

export interface ScenarioCreate {
  network_id: number;
  name: string;
  depot_node: number;
  depot_lat?: number;
  depot_lon?: number;
  vehicles: VehicleCreate[];
  customers: CustomerCreate[];
}

export interface NearestNodeResponse {
  node_id: number;
  lat: number;
  lon: number;
  distance_meters: number;
}

export type OperationalPreference = 'fastest' | 'shortest' | 'low_congestion' | 'stable' | 'balanced';
export type DemoPresetType = 'urban_delivery' | 'peakhour_logistics' | 'network_disruption' | 'city_incident';

export interface Objectives {
  time: number;
  distance: number;
  congestion: number;
  disruption: number;
}

export interface ParetoSolution {
  id: number;
  objectives: Objectives;
  route_data: Record<string, number[]>;
  is_selected: boolean;
}

export interface OptimizationRunOut {
  id: number;
  scenario_id: number;
  algorithm: string;
  status: string;
  runtime_seconds: number | null;
  pareto_solutions: ParetoSolution[];
  convergence_data: Array<{ iteration: number; hypervolume: number; archive_size: number }>;
  archive_summary: {
    size: number;
    min: Objectives;
    max: Objectives;
    hypervolume: number;
  } | null;
}

export interface TrafficEventOut {
  id: number;
  event_type: string;
  edge_u: number;
  edge_v: number;
  delta_time: number;
  delta_congestion: number;
  road_closed: boolean;
  active: boolean;
  impact_score: number | null;
  triggered_reopt: boolean;
}

export interface ImpactAnalysisOut {
  event_id: number;
  edge_u: number;
  edge_v: number;
  delta_time: number;
  delta_congestion: number;
  route_exposure: number;
  impact_score: number;
  significant: boolean;
  affected_vehicle_ids: number[];
  threshold: number;
}

export interface Route {
  route_id: number;
  vehicle_id: number;
  customer_sequence: number[];
  road_path: number[];
  geometry?: [number, number][];
  distance_meters?: number;
  duration_seconds?: number;
  status: string;
}

export interface AlgorithmResult {
  algorithm: string;
  num_pareto_solutions: number;
  hypervolume: number | null;
  best_time: number | null;
  best_distance: number | null;
  best_congestion: number | null;
  runtime_seconds: number | null;
  convergence_data: Array<{ iteration: number; hypervolume: number }>;
}

export interface BenchmarkResultOut {
  benchmark_id: number;
  scenario_id: number;
  results: AlgorithmResult[];
}

export type AlgorithmType = 'qpso' | 'pso' | 'nsga2';
export type EventType = 'accident' | 'road_closure' | 'congestion_spike' | 'recovery';
export type SelectionStrategy = 'balanced' | 'min_time' | 'min_congestion' | 'min_disruption' | 'lexicographic';
