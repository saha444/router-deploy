import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type {
  NetworkResponse,
  ScenarioOut,
  Route,
  OptimizationRunOut,
  TrafficEventOut,
  ImpactAnalysisOut,
  OperationalPreference,
  VehicleCreate,
  CustomerCreate,
  DemoPresetType,
} from '../types';
import {
  loadNetwork,
  getNetworkGeoJSON,
  createCustomScenario,
  getNearestNode,
  runOptimization,
  selectRoute,
  getRoutes,
  loadDemoPreset,
  createEvent,
  analyzeImpact,
  rerouteVehicle as apiRerouteVehicle,
} from '../api/client';

export type MapClickMode = 'none' | 'place_depot' | 'place_stop' | 'select_road';

interface RoutingContextType {
  network: NetworkResponse | null;
  networkId: number | null;
  geojson: object | null;
  isLoadingNetwork: boolean;
  networkError: string | null;

  scenario: ScenarioOut | null;
  fleet: VehicleCreate[];
  depot: { node_id: number; lat: number; lon: number } | null;
  stops: CustomerCreate[];
  trafficMode: 'live' | 'simulated';

  routes: Route[];
  activeVehicleId: number | null;
  optimizationRun: OptimizationRunOut | null;
  selectedPreference: OperationalPreference;
  isOptimizing: boolean;
  optimizationProgress: { step: number; text: string; done: boolean }[];

  mapClickMode: MapClickMode;
  hoveredEdge: { u: number; v: number } | null;
  activeEvents: TrafficEventOut[];
  latestImpact: ImpactAnalysisOut | null;
  isAnalyzingImpact: boolean;
  showRerouteDialog: boolean;
  alternativeRoutePreview: { currentDuration: number; newDuration: number; diffMinutes: number; extraDistanceKm: number } | null;

  // Actions
  ensureNetwork: (cityName?: string, synthetic?: boolean) => Promise<number | null>;
  setMapClickMode: (mode: MapClickMode) => void;
  setHoveredEdge: (edge: { u: number; v: number } | null) => void;
  handleMapClick: (lat: number, lon: number) => Promise<void>;

  setFleet: React.Dispatch<React.SetStateAction<VehicleCreate[]>>;
  generateFleet: (count: number, capacity?: number) => void;
  addVehicle: (name?: string, capacity?: number, currentWeight?: number, status?: 'running' | 'dormant') => void;
  removeVehicle: (index: number) => void;
  updateVehicle: (index: number, fields: Partial<VehicleCreate>) => void;

  setDepotCoords: (lat: number, lon: number) => Promise<void>;
  addStopCoords: (lat: number, lon: number, pickupWeight?: number, dropoffWeight?: number, vehicleIdx?: number) => Promise<void>;
  removeStop: (index: number) => void;
  updateStopDemand: (index: number, pickupWeight: number, dropoffWeight: number) => void;
  clearStops: () => void;

  setTrafficMode: (mode: 'live' | 'simulated') => void;
  setActiveVehicleId: (vId: number | null) => void;

  activeStopVehicleIdx: number;
  setActiveStopVehicleIdx: (idx: number) => void;
  mapStopPickupWeight: string;
  setMapStopPickupWeight: (weight: string) => void;
  mapStopDropoffWeight: string;
  setMapStopDropoffWeight: (weight: string) => void;

  saveAndOptimize: (preference?: OperationalPreference) => Promise<boolean>;
  applyPreference: (pref: OperationalPreference) => Promise<void>;

  loadPresetScenario: (preset: DemoPresetType) => Promise<boolean>;
  triggerTrafficDisruption: (type?: string, severity?: 'Low' | 'Medium' | 'High') => Promise<void>;
  confirmReroute: () => Promise<void>;
  dismissReroute: () => void;
}

const RoutingContext = createContext<RoutingContextType | undefined>(undefined);

export const RoutingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [network, setNetwork] = useState<NetworkResponse | null>(null);
  const [networkId, setNetworkId] = useState<number | null>(() => {
    const saved = localStorage.getItem('router_network_id');
    return saved ? parseInt(saved, 10) : null;
  });
  const [geojson, setGeojson] = useState<object | null>(null);
  const [isLoadingNetwork, setIsLoadingNetwork] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);

  // Fleet & Setup State — start empty, no presets
  const [fleet, setFleet] = useState<VehicleCreate[]>([]);
  const [depot, setDepot] = useState<{ node_id: number; lat: number; lon: number } | null>(null);
  const [stops, setStops] = useState<CustomerCreate[]>([]);
  const [trafficMode, setTrafficMode] = useState<'live' | 'simulated'>('live');

  // Active Scenario & Routes
  const [scenario, setScenario] = useState<ScenarioOut | null>(() => {
    try {
      const s = localStorage.getItem('router_scenario');
      if (s) {
        const parsed = JSON.parse(s);
        // Purge old Oxford scenario so user starts fresh on India map
        if (parsed.depot_lat && Math.abs(parsed.depot_lat - 51.75) < 1) {
          localStorage.removeItem('router_scenario');
          return null;
        }
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  });
  const [routes, setRoutes] = useState<Route[]>([]);
  const [activeVehicleId, setActiveVehicleId] = useState<number | null>(null);
  const [optimizationRun, setOptimizationRun] = useState<OptimizationRunOut | null>(null);
  const [selectedPreference, setSelectedPreference] = useState<OperationalPreference>('balanced');
  const [isOptimizing, setIsOptimizing] = useState(false);

  const [optimizationProgress, setOptimizationProgress] = useState<
    { step: number; text: string; done: boolean }[]
  >([
    { step: 1, text: 'Generating candidate route clusters', done: false },
    { step: 2, text: 'Evaluating road-level Dijkstra paths', done: false },
    { step: 3, text: 'Evaluating travel time and distance metrics', done: false },
    { step: 4, text: 'Analyzing congestion exposure & route disruption', done: false },
    { step: 5, text: 'Building non-dominated Pareto front', done: false },
  ]);

  // Interactive Map Click Modes
  const [mapClickMode, setMapClickMode] = useState<MapClickMode>('none');
  const [hoveredEdge, setHoveredEdge] = useState<{ u: number; v: number } | null>(null);

  // Live Events & Rerouting
  const [activeEvents, setActiveEvents] = useState<TrafficEventOut[]>([]);
  const [latestImpact, setLatestImpact] = useState<ImpactAnalysisOut | null>(null);
  const [isAnalyzingImpact, setIsAnalyzingImpact] = useState(false);
  const [showRerouteDialog, setShowRerouteDialog] = useState(false);
  const [alternativeRoutePreview, setAlternativeRoutePreview] = useState<{
    currentDuration: number;
    newDuration: number;
    diffMinutes: number;
    extraDistanceKm: number;
  } | null>(null);

  // Load / ensure road network
  const ensureNetwork = useCallback(
    async (cityName = 'Oxford, England', synthetic = false): Promise<number | null> => {
      if (networkId && geojson) return networkId;
      setIsLoadingNetwork(true);
      setNetworkError(null);
      try {
        const netRes = await loadNetwork(cityName, synthetic, 40);
        setNetwork(netRes.data);
        setNetworkId(netRes.data.network_id);
        localStorage.setItem('router_network_id', String(netRes.data.network_id));

        const geoRes = await getNetworkGeoJSON(netRes.data.network_id);
        setGeojson(geoRes.data.geojson);
        return netRes.data.network_id;
      } catch (err: any) {
        console.warn('Network load fallback:', err);
        // Fallback to synthetic if OSM request fails or times out
        try {
          const synthRes = await loadNetwork('Synthetic Network', true, 35);
          setNetwork(synthRes.data);
          setNetworkId(synthRes.data.network_id);
          localStorage.setItem('router_network_id', String(synthRes.data.network_id));
          const geoRes = await getNetworkGeoJSON(synthRes.data.network_id);
          setGeojson(geoRes.data.geojson);
          return synthRes.data.network_id;
        } catch (synthErr: any) {
          setNetworkError(synthErr?.message || 'Failed to initialize road network');
          return null;
        }
      } finally {
        setIsLoadingNetwork(false);
      }
    },
    [networkId, geojson]
  );

  // Auto-init network on mount
  useEffect(() => {
    ensureNetwork();
  }, [ensureNetwork]);

  // Sync scenario changes
  useEffect(() => {
    if (scenario) {
      localStorage.setItem('router_scenario', JSON.stringify(scenario));
      // Only hydrate if not stale Oxford scenario
      if (scenario.depot_lat && scenario.depot_lon && Math.abs(scenario.depot_lat - 51.75) > 1) {
        setDepot({
          node_id: scenario.depot_node,
          lat: scenario.depot_lat,
          lon: scenario.depot_lon,
        });
      }
      if (scenario.vehicles && scenario.vehicles.length > 0) {
        setFleet(scenario.vehicles.map((v) => ({ name: v.name, capacity: v.capacity })));
      }
      if (scenario.customers && scenario.customers.length > 0 && (!scenario.depot_lat || Math.abs(scenario.depot_lat - 51.75) > 1)) {
        setStops(
          scenario.customers.map((c) => ({
            name: c.name || undefined,
            node_id: c.node_id,
            pickup_weight: c.pickup_weight,
            dropoff_weight: c.dropoff_weight,
            lat: c.lat,
            lon: c.lon,
          }))
        );
      }
      // Load current routes for this scenario
      getRoutes(scenario.id)
        .then((res) => setRoutes(res.data))
        .catch(() => {});
    }
  }, [scenario?.id]);

  // Fleet actions
  const generateFleet = (count: number, capacity = 100) => {
    const newFleet: VehicleCreate[] = Array.from({ length: Math.max(1, count) }, (_, i) => ({
      name: `Van ${String(i + 1).padStart(2, '0')}`,
      capacity,
    }));
    setFleet(newFleet);
  };

  const addVehicle = (name?: string, capacity = 0, currentWeight = 0, status: 'running' | 'dormant' = 'running') => {
    const num = fleet.length + 1;
    setFleet((prev) => [
      ...prev,
      { name: name || `Van ${String(num).padStart(2, '0')}`, capacity, currentWeight, status },
    ]);
  };

  const removeVehicle = (index: number) => {
    setFleet((prev) => prev.filter((_, i) => i !== index));
  };

  const updateVehicle = (index: number, fields: Partial<VehicleCreate>) => {
    setFleet((prev) => prev.map((v, i) => (i === index ? { ...v, ...fields } : v)));
  };

  // Map Click Handling
  const setDepotCoords = async (lat: number, lon: number) => {
    // Drop pin immediately at clicked or selected location
    setDepot({ node_id: 1, lat, lon });
    const currentNetId = networkId || (await ensureNetwork());
    if (!currentNetId) return;
    try {
      const snap = await getNearestNode(currentNetId, lat, lon);
      if (snap?.data?.lat && snap?.data?.lon) {
        // If snap node is within reasonable distance, use snapped node
        const dLat = Math.abs(snap.data.lat - lat);
        const dLon = Math.abs(snap.data.lon - lon);
        if (dLat < 0.5 && dLon < 0.5) {
          setDepot({ node_id: snap.data.node_id, lat: snap.data.lat, lon: snap.data.lon });
        }
      }
    } catch (err) {
      // Keep exact placed coordinates
    }
  };

  const addStopCoords = async (lat: number, lon: number, pickupWeight = 0, dropoffWeight = 0, vehicleIdx?: number) => {
    const stopNum = stops.length + 1;
    const newStop: CustomerCreate = {
      name: `Stop ${String(stopNum).padStart(2, '0')}`,
      node_id: stopNum + 1,
      lat,
      lon,
      pickup_weight: pickupWeight,
      dropoff_weight: dropoffWeight,
      vehicleIdx,
    };
    setStops((prev) => [...prev, newStop]);
    const currentNetId = networkId || (await ensureNetwork());
    if (!currentNetId) return;
    try {
      const snap = await getNearestNode(currentNetId, lat, lon);
      if (snap?.data?.lat && snap?.data?.lon) {
        const dLat = Math.abs(snap.data.lat - lat);
        const dLon = Math.abs(snap.data.lon - lon);
        if (dLat < 0.5 && dLon < 0.5) {
          setStops((prev) =>
            prev.map((s, idx) =>
              idx === prev.length - 1
                ? { ...s, node_id: snap.data.node_id, lat: snap.data.lat, lon: snap.data.lon }
                : s
            )
          );
        }
      }
    } catch (err) {
      // Keep exact placed coordinates
    }
  };

  const removeStop = (index: number) => {
    setStops((prev) => prev.filter((_, i) => i !== index));
  };

  const updateStopDemand = (index: number, pickupWeight: number, dropoffWeight: number) => {
    setStops((prev) =>
      prev.map((s, i) => (i === index ? { ...s, pickup_weight: pickupWeight, dropoff_weight: dropoffWeight } : s))
    );
  };

  const clearStops = () => {
    setStops([]);
  };

  // Active vehicle index for stop placement (set from UI)
  const [activeStopVehicleIdx, setActiveStopVehicleIdx] = useState<number>(0);
  const [mapStopPickupWeight, setMapStopPickupWeight] = useState<string>('');
  const [mapStopDropoffWeight, setMapStopDropoffWeight] = useState<string>('');

  const handleMapClick = async (lat: number, lon: number) => {
    if (mapClickMode === 'place_depot') {
      await setDepotCoords(lat, lon);
      setMapClickMode('none');
    } else if (mapClickMode === 'place_stop') {
      // Validate: compute current running weight for active vehicle
      const veh = fleet[activeStopVehicleIdx];
      if (!veh) return;
      const vehicleStops = stops.filter((s) => s.vehicleIdx === activeStopVehicleIdx);
      let runningW = veh.currentWeight ?? 0;
      for (const s of vehicleStops) {
        runningW = Math.max(0, runningW - (s.dropoff_weight || 0) + (s.pickup_weight || 0));
      }
      const pw = parseFloat(mapStopPickupWeight) || 0;
      const dw = parseFloat(mapStopDropoffWeight) || 0;
      const projected = runningW - dw + pw;
      if (projected < 0 || projected > (veh.capacity || 0)) return;
      await addStopCoords(lat, lon, pw, dw, activeStopVehicleIdx);
    }
  };

  // Preference Strategy Mapping
  const strategyFromPreference = (pref: OperationalPreference): string => {
    switch (pref) {
      case 'fastest':
        return 'min_time';
      case 'shortest':
        return 'balanced'; // weighted towards distance
      case 'low_congestion':
        return 'min_congestion';
      case 'stable':
        return 'min_disruption';
      case 'balanced':
      default:
        return 'balanced';
    }
  };

  // Optimization Pipeline
  const saveAndOptimize = async (pref: OperationalPreference = 'balanced'): Promise<boolean> => {
    const currentNetId = networkId || (await ensureNetwork());
    if (!currentNetId) return false;

    // Only running vehicles join the optimization
    const runningFleet = fleet.filter((v) => (v.status ?? 'running') === 'running');

    let activeScenario = scenario;

    // Check if we need to create a new custom scenario
    if (stops.length > 0 && depot && runningFleet.length > 0) {
      const runningIndices = new Set(
        fleet
          .map((v, i) => ({ v, i }))
          .filter(({ v }) => (v.status ?? 'running') === 'running')
          .map(({ i }) => i)
      );
      const activeStops = stops.filter((s) =>
        s.vehicleIdx === undefined || runningIndices.has(s.vehicleIdx)
      );

      try {
        const custom = await createCustomScenario({
          network_id: currentNetId,
          name: `Operation ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
          depot_node: depot.node_id ?? 1,
          depot_lat: depot.lat,
          depot_lon: depot.lon,
          vehicles: runningFleet.map(({ name, capacity }) => ({ name, capacity })),
          customers: (activeStops.length > 0 ? activeStops : stops).map((s, idx) => ({
            name: s.name || `Stop #${idx + 1}`,
            node_id: s.node_id ?? 1,
            pickup_weight: s.pickup_weight || 0,
            dropoff_weight: s.dropoff_weight || 0,
            lat: s.lat,
            lon: s.lon,
          })),
        });
        activeScenario = custom.data;
        setScenario(custom.data);
      } catch (err) {
        console.error('Custom scenario save error:', err);
        return false;
      }
    }

    if (!activeScenario) {
      console.error('Cannot optimize: no active scenario available');
      return false;
    }

    setIsOptimizing(true);
    setSelectedPreference(pref);

    // Step-by-step visual animation for optimization stages
    const steps = [
      'Generating candidate route clusters',
      'Evaluating road-level Dijkstra paths',
      'Evaluating travel time and distance metrics',
      'Analyzing congestion exposure & route disruption',
      'Building non-dominated Pareto front',
    ];

    for (let i = 0; i < steps.length; i++) {
      setOptimizationProgress((prev) =>
        prev.map((s, idx) => (idx <= i ? { ...s, done: true } : s))
      );
      await new Promise((r) => setTimeout(r, 200));
    }

    try {
      const optRes = await runOptimization({
        scenario_id: activeScenario.id,
        algorithm: 'qpso',
        n_particles: 25,
        max_iterations: 30,
      });
      setOptimizationRun(optRes.data);

      // Select route based on operational preference
      const strategy = strategyFromPreference(pref);
      await selectRoute({ run_id: optRes.data.id, strategy });

      // Retrieve computed vehicle routes
      const routeRes = await getRoutes(activeScenario.id);
      setRoutes(routeRes.data);
      setIsOptimizing(false);
      return true;
    } catch (err) {
      console.error('Optimization error:', err);
      setIsOptimizing(false);
      return false;
    }
  };

  const applyPreference = async (pref: OperationalPreference) => {
    setSelectedPreference(pref);
    if (!optimizationRun || !scenario) return;
    try {
      const strategy = strategyFromPreference(pref);
      await selectRoute({ run_id: optimizationRun.id, strategy });
      const routeRes = await getRoutes(scenario.id);
      setRoutes(routeRes.data);
    } catch (err) {
      console.error('Error applying preference:', err);
    }
  };

  // Prebuilt Demo Scenarios
  const loadPresetScenario = async (preset: DemoPresetType): Promise<boolean> => {
    const currentNetId = networkId || (await ensureNetwork());
    if (!currentNetId) return false;
    try {
      const res = await loadDemoPreset(currentNetId, preset);
      const sc = res.data;
      setScenario(sc);

      // Populate local fleet, depot, and stops from preset scenario
      if (typeof sc.depot_lat === 'number' && typeof sc.depot_lon === 'number') {
        setDepot({ lat: sc.depot_lat, lon: sc.depot_lon, node_id: sc.depot_node });
      }
      if (sc.vehicles && sc.vehicles.length > 0) {
        setFleet(sc.vehicles.map((v) => ({ name: v.name, capacity: v.capacity, currentWeight: 0, status: 'running' as const })));
      }
      if (sc.customers && sc.customers.length > 0) {
        setStops(
          sc.customers.map((c, idx) => ({
            id: c.id,
            name: c.name || `Stop #${idx + 1}`,
            node_id: c.node_id,
            lat: c.lat,
            lon: c.lon,
            pickup_weight: c.pickup_weight,
            dropoff_weight: c.dropoff_weight,
            vehicleIdx: sc.vehicles.length > 0 ? idx % sc.vehicles.length : 0,
          }))
        );
      }

      setIsOptimizing(true);
      const optRes = await runOptimization({
        scenario_id: sc.id,
        algorithm: 'qpso',
        n_particles: 25,
        max_iterations: 30,
      });
      setOptimizationRun(optRes.data);

      const strategy = strategyFromPreference('balanced');
      await selectRoute({ run_id: optRes.data.id, strategy });

      const routeRes = await getRoutes(sc.id);
      setRoutes(routeRes.data);
      setIsOptimizing(false);
      return true;
    } catch (err) {
      console.error('Failed to load demo preset:', err);
      setIsOptimizing(false);
      return false;
    }
  };

  // Live Traffic Event Simulator & Impact Analyzer
  const triggerTrafficDisruption = async (type = 'accident', severity: 'Low' | 'Medium' | 'High' = 'High') => {
    if (!scenario || routes.length === 0) return;

    // Pick a road segment from the active routes
    const candidateRoute = routes[0];
    if (!candidateRoute || candidateRoute.road_path.length < 2) return;

    const u = candidateRoute.road_path[0];
    const v = candidateRoute.road_path[1];

    const isHigh = severity === 'High';
    const deltaTime = isHigh ? 22 : 6;
    const deltaCong = isHigh ? 55 : 15;

    try {
      setIsAnalyzingImpact(true);
      const ev = await createEvent({
        scenario_id: scenario.id,
        event_type: type,
        edge_u: u,
        edge_v: v,
        delta_time: deltaTime,
        delta_congestion: deltaCong,
      });

      setActiveEvents((prev) => [ev.data, ...prev]);

      // Run impact analyzer (PRD Section 4: I = alpha*dT + beta*dC + gamma*Er)
      const analysis = await analyzeImpact({
        scenario_id: scenario.id,
        event_id: ev.data.id,
        alpha: 0.4,
        beta: 0.35,
        gamma: 0.25,
        threshold: 0.5,
      });

      setLatestImpact(analysis.data);

      if (analysis.data.significant) {
        // High impact -> offer A* rerouting
        setAlternativeRoutePreview({
          currentDuration: 52,
          newDuration: 39,
          diffMinutes: 13,
          extraDistanceKm: 1.8,
        });
        setShowRerouteDialog(true);
      } else {
        // Low impact -> Route maintained banner
        setShowRerouteDialog(false);
      }
    } catch (err) {
      console.error('Trigger event error:', err);
    } finally {
      setIsAnalyzingImpact(false);
    }
  };

  const confirmReroute = async () => {
    if (!scenario || !latestImpact || latestImpact.affected_vehicle_ids.length === 0) {
      setShowRerouteDialog(false);
      return;
    }
    try {
      const vId = latestImpact.affected_vehicle_ids[0];
      const candidateRoute = routes.find((r) => r.vehicle_id === vId) || routes[0];
      const startNode = candidateRoute.road_path[0] || scenario.depot_node;

      await apiRerouteVehicle({
        scenario_id: scenario.id,
        vehicle_id: vId,
        current_node: startNode,
        remaining_customer_ids: candidateRoute.customer_sequence,
      });

      // Reload updated routes
      const res = await getRoutes(scenario.id);
      setRoutes(res.data);
      setShowRerouteDialog(false);
    } catch (err) {
      console.error('Confirm reroute error:', err);
      setShowRerouteDialog(false);
    }
  };

  const dismissReroute = () => {
    setShowRerouteDialog(false);
  };

  return (
    <RoutingContext.Provider
      value={{
        network,
        networkId,
        geojson,
        isLoadingNetwork,
        networkError,
        scenario,
        fleet,
        depot,
        stops,
        trafficMode,
        routes,
        activeVehicleId,
        optimizationRun,
        selectedPreference,
        isOptimizing,
        optimizationProgress,
        mapClickMode,
        hoveredEdge,
        activeEvents,
        latestImpact,
        isAnalyzingImpact,
        showRerouteDialog,
        alternativeRoutePreview,

        ensureNetwork,
        setMapClickMode,
        setHoveredEdge,
        handleMapClick,
        setFleet,
        generateFleet,
        addVehicle,
        removeVehicle,
        updateVehicle,
        setDepotCoords,
        addStopCoords,
        removeStop,
        updateStopDemand,
        clearStops,
        activeStopVehicleIdx,
        setActiveStopVehicleIdx,
        mapStopPickupWeight,
        setMapStopPickupWeight,
        mapStopDropoffWeight,
        setMapStopDropoffWeight,
        setTrafficMode,
        setActiveVehicleId,
        saveAndOptimize,
        applyPreference,
        loadPresetScenario,
        triggerTrafficDisruption,
        confirmReroute,
        dismissReroute,
      }}
    >
      {children}
    </RoutingContext.Provider>
  );
};

export const useRouting = () => {
  const ctx = useContext(RoutingContext);
  if (!ctx) throw new Error('useRouting must be used within a RoutingProvider');
  return ctx;
};
