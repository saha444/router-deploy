import axios from 'axios';
import type {
  NetworkResponse, ScenarioOut, OptimizationRunOut,
  TrafficEventOut, ImpactAnalysisOut, Route, BenchmarkResultOut,
} from '../types';

const BASE = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000' : '');

const api = axios.create({ baseURL: BASE, timeout: 300_000 });

// ── Network ────────────────────────────────────────────────────────────────────
export const loadNetwork = (city: string, useSynthetic = false, syntheticNodes = 50) =>
  api.post<NetworkResponse>('/api/network/load', { city, use_synthetic: useSynthetic, synthetic_nodes: syntheticNodes });

export const getNetworkGeoJSON = (networkId: number) =>
  api.get<{ network_id: number; geojson: object }>(`/api/network/${networkId}/geojson`);

export const getNetworkNodes = (networkId: number) =>
  api.get<Array<{ id: number; lat: number; lon: number }>>(`/api/network/${networkId}/nodes`);

export const generateScenario = (params: {
  network_id: number;
  name?: string;
  n_vehicles: number;
  n_customers: number;
  vehicle_capacity: number;
  customer_demand_min?: number;
  customer_demand_max?: number;
  random_seed?: number;
}) => api.post<ScenarioOut>('/api/network/scenario/generate', params);

export const createCustomScenario = (params: {
  network_id: number;
  name: string;
  depot_node: number;
  depot_lat?: number;
  depot_lon?: number;
  vehicles: Array<{ name: string; capacity: number }>;
  customers: Array<{
    name?: string;
    node_id: number;
    pickup_weight?: number;
    dropoff_weight?: number;
    demand?: number;
    lat: number;
    lon: number;
  }>;
}) => api.post<ScenarioOut>('/api/network/scenario', params);

export const getNearestNode = (networkId: number, lat: number, lon: number) =>
  api.post<{ node_id: number; lat: number; lon: number; distance_meters: number }>(`/api/network/${networkId}/nearest_node`, { lat, lon });

export const loadDemoPreset = (networkId: number, preset: string) =>
  api.post<ScenarioOut>('/api/network/scenario/preset', { network_id: networkId, preset });

// ── Optimization ───────────────────────────────────────────────────────────────
export const runOptimization = (params: {
  scenario_id: number;
  algorithm: string;
  n_particles: number;
  max_iterations: number;
  beta_max?: number;
  beta_min?: number;
  archive_size?: number;
  w_inertia?: number;
  c1?: number;
  c2?: number;
  crossover_prob?: number;
  mutation_prob?: number;
}) => api.post<OptimizationRunOut>('/api/optimize', params);

export const selectRoute = (params: {
  run_id: number;
  strategy: string;
  weights?: number[];
}) => api.post('/api/routes/select', params);

export const getRoutes = (scenarioId: number) =>
  api.get<Route[]>(`/api/routes/${scenarioId}`);

// ── Benchmark ──────────────────────────────────────────────────────────────────
export const runBenchmark = (params: {
  scenario_id: number;
  n_particles: number;
  max_iterations: number;
}) => api.post<BenchmarkResultOut>('/api/benchmark', params);

// ── Traffic Events ─────────────────────────────────────────────────────────────
export const createEvent = (params: {
  scenario_id: number;
  event_type: string;
  edge_u: number;
  edge_v: number;
  delta_time: number;
  delta_congestion: number;
}) => api.post<TrafficEventOut>('/api/events', params);

export const listEvents = (scenarioId: number) =>
  api.get<TrafficEventOut[]>(`/api/events/${scenarioId}`);

export const resolveEvent = (eventId: number) =>
  api.delete(`/api/events/${eventId}/resolve`);

export const analyzeImpact = (params: {
  scenario_id: number;
  event_id: number;
  alpha?: number;
  beta?: number;
  gamma?: number;
  threshold?: number;
}) => api.post<ImpactAnalysisOut>('/api/events/impact', params);

export const rerouteVehicle = (params: {
  scenario_id: number;
  vehicle_id: number;
  current_node: number;
  remaining_customer_ids: number[];
}) => api.post('/api/events/reroute', params);

export const healthCheck = () => api.get('/api/health');
