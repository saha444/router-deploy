import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRouting } from '../../context/RoutingContext';
import { useTheme } from '../../context/ThemeContext';
import { VEHICLE_COLOURS } from '../../components/MapView';
import AddressAutocomplete, { type AddressSuggestion } from '../../components/AddressAutocomplete';
import type { OperationalPreference, DemoPresetType, Route } from '../../types';
import DemoMap from './DemoMap';
import {
  DEMO_NODES,
  DEMO_ROADS,
  DEMO_PRESET_SCENARIOS,
  findMultiIncidentAlternatives,
  generateMultiVehicleDispatchPlan,
  getAllStrategiesComparison,
  getRoadById,
  nodeById,
  type ActiveIncident,
  type DemoNode,
  type StrategyMetrics,
} from './demoMapData';

type WizardStep = 'fleet' | 'depot' | 'stops' | 'focus' | 'plan' | 'simulate';

const PREFERENCE_CARDS: {
  id: OperationalPreference;
  title: string;
  subtitle: string;
  desc: string;
  tag: string;
}[] = [
  { id: 'fastest', title: 'FASTEST', subtitle: 'Minimize travel time', desc: 'Bypasses slow road segments to reach all destinations as quickly as possible.', tag: 'Min Time' },
  { id: 'shortest', title: 'SHORTEST', subtitle: 'Minimize road distance', desc: 'Reduces total road kilometres and fleet fuel consumption.', tag: 'Min Distance' },
  { id: 'low_congestion', title: 'LOW CONGESTION', subtitle: 'Avoid traffic bottlenecks', desc: 'Prioritizes free-flowing urban corridors and avoids delayed choke points.', tag: 'Free Flow' },
  { id: 'stable', title: 'STABLE', subtitle: 'Minimize route disruption', desc: 'Keeps dispatch paths predictable and avoids unnecessary path deviations.', tag: 'Robust Path' },
  { id: 'balanced', title: 'BALANCED', subtitle: 'Optimal trade-off', desc: 'Harmonious multi-objective compromise across time, distance, congestion, and disruption.', tag: 'Recommended' },
];

interface DemoScenarioCard {
  id: DemoPresetType;
  title: string;
  badge: string;
  stops: number;
  vehicles: number;
  desc: string;
  color: string;
}

const DEMO_PRESETS: DemoScenarioCard[] = [
  {
    id: 'urban_delivery',
    title: 'Urban Delivery',
    badge: 'Standard',
    stops: 25,
    vehicles: 5,
    desc: 'Dense city parcel distribution balancing travel time and road congestion hotspots.',
    color: '#4f46e5',
  },
  {
    id: 'peakhour_logistics',
    title: 'Peak-Hour Logistics',
    badge: 'Heavy Load',
    stops: 50,
    vehicles: 8,
    desc: 'High-density multi-vehicle delivery during peak urban commuter hours.',
    color: '#d97706',
  },
  {
    id: 'network_disruption',
    title: 'Network Disruption',
    badge: 'Severe Weather',
    stops: 25,
    vehicles: 5,
    desc: 'Testing algorithm stability when critical arterial corridors face speed penalties.',
    color: '#0284c7',
  },
  {
    id: 'city_incident',
    title: 'City Incident',
    badge: 'Incident Response',
    stops: 20,
    vehicles: 4,
    desc: 'Emergency road closure and dynamic traffic diversion evaluating event-triggered A* rerouting.',
    color: '#e11d48',
  },
];

const INCIDENT_TYPES = [
  { id: 'accident', label: 'Accident', icon: '!' },
  { id: 'congestion_spike', label: 'Congestion Spike', icon: '~' },
  { id: 'road_closure', label: 'Road Closure', icon: 'X' },
  { id: 'recovery', label: 'Road Recovery', icon: '+' },
];

interface IncidentLogEntry {
  id: number;
  type: string;
  severity: 'Low' | 'Medium' | 'High';
  timestamp: Date;
  impactScore: number;
  significant: boolean;
  rerouted: boolean;
  deltaTime: number;
  deltaCongestion: number;
}

const DemoPage: React.FC = () => {
  const { isDark } = useTheme();
  const {
    fleet, depot, stops, routes,
    activeVehicleId, isOptimizing,
    latestImpact,
    showRerouteDialog, alternativeRoutePreview,
    activeStopVehicleIdx,
    setMapClickMode, addVehicle, removeVehicle, updateVehicle,
    setDepotCoords, addStopCoords,
    setActiveVehicleId, saveAndOptimize, applyPreference,
    confirmReroute, dismissReroute, ensureNetwork,
    setActiveStopVehicleIdx, mapStopPickupWeight, setMapStopPickupWeight, mapStopDropoffWeight, setMapStopDropoffWeight,
    loadPresetScenario, triggerTrafficDisruption,
  } = useRouting();

  const [currentStep, setCurrentStep] = useState<WizardStep>('fleet');

  // Fleet form state
  const [newVehicleName, setNewVehicleName] = useState('');
  const [newVehicleMaxWeight, setNewVehicleMaxWeight] = useState('');
  const [newVehicleCurrentWeight, setNewVehicleCurrentWeight] = useState('');
  const [newVehicleStatus, setNewVehicleStatus] = useState<'running' | 'dormant'>('running');
  const [isFleetConfirmed, setIsFleetConfirmed] = useState(false);
  const [depotAddressText, setDepotAddressText] = useState('');
  const [operationalFocus, setOperationalFocus] = useState<OperationalPreference>('balanced');

  // Demo-specific state
  const [selectedPresetId, setSelectedPresetId] = useState<DemoPresetType | null>(null);
  const [isLoadingPreset, setIsLoadingPreset] = useState(false);
  const [previousRoutes, setPreviousRoutes] = useState<Route[]>([]);
  const [incidentLog, setIncidentLog] = useState<IncidentLogEntry[]>([]);
  const [eventType, setEventType] = useState('accident');
  const [eventSeverity, setEventSeverity] = useState<'Low' | 'Medium' | 'High'>('High');
  const [rerouteCount, setRerouteCount] = useState(0);
  const [isInjectingIncident, setIsInjectingIncident] = useState(false);
  const lastIncidentIdRef = useRef<number | null>(null);

  // Meridian City Demo Map State
  const [demoDepotNodeId, setDemoDepotNodeId] = useState<number | null>(null);
  const [demoStops, setDemoStops] = useState<
    Array<{
      nodeId: number;
      stopNumber?: number;
      vehicleIdx?: number;
      name?: string;
      pickup_weight?: number;
      dropoff_weight?: number;
    }>
  >([]);
  const [demoRoutes, setDemoRoutes] = useState<
    Array<{
      vehicleIdx: number;
      vehicleName: string;
      path: number[];
      stops?: number[];
    }>
  >([]);
  const [demoPreviousRoutes, setDemoPreviousRoutes] = useState<
    Array<{
      vehicleIdx: number;
      vehicleName: string;
      path: number[];
    }>
  >([]);
  const [selectedIncidentRoadId, setSelectedIncidentRoadId] = useState<string>('a12');
  const [isSelectingLocationOnMap, setIsSelectingLocationOnMap] = useState(false);
  const [mobileView, setMobileView] = useState<'panel' | 'map'>('panel');
  const [activeIncidents, setActiveIncidents] = useState<ActiveIncident[]>([]);

  // Auto-switch to map view on mobile when entering map targeting mode
  useEffect(() => {
    if (isSelectingLocationOnMap) {
      setMobileView('map');
    }
  }, [isSelectingLocationOnMap]);

  const [alternativeRoutes, setAlternativeRoutes] = useState<Array<{
    vehicleIdx: number;
    vehicleName: string;
    blockedRoadIds: string[];
    originalPath: number[];
    reroutedPath: number[];
    timeSaved: number;
    extraDistance: number;
  }>>([]);

  // Stop addition confirmation modal state
  const [pendingStopNode, setPendingStopNode] = useState<DemoNode | null>(null);
  const [pendingStopCustomName, setPendingStopCustomName] = useState<string>('');
  const [pendingOperationType, setPendingOperationType] = useState<'dropoff' | 'pickup'>('dropoff');
  const [pendingWeightAmount, setPendingWeightAmount] = useState<string>('25');
  const [pendingVehicleIdx, setPendingVehicleIdx] = useState<number>(0);

  // Effective depot node ID (uses explicit demo depot, or maps user depot / default to fake city node)
  const effectiveDepotNodeId = useMemo(() => {
    if (demoDepotNodeId !== null) return demoDepotNodeId;
    if (depot) {
      if (typeof depot.node_id === 'number' && depot.node_id >= 1 && depot.node_id <= DEMO_NODES.length) {
        return depot.node_id;
      }
      const depotName = (depot as { name?: string; lat: number; lon: number }).name;
      const hash = Math.abs((depotName || `${depot.lat},${depot.lon}`).split('').reduce((acc: number, c: string) => acc + c.charCodeAt(0), 0));
      return DEMO_NODES[hash % DEMO_NODES.length].id;
    }
    if (fleet.length > 0 || stops.length > 0) {
      return 20; // Default central hub in Meridian City
    }
    return null;
  }, [demoDepotNodeId, depot, fleet.length, stops.length]);

  // Unified effective stops calculation (maps user stops to fake city nodes if not already set)
  const effectiveStops = useMemo(() => {
    if (demoStops.length > 0) return demoStops;
    if (!stops || stops.length === 0) return [];
    const depotId = effectiveDepotNodeId || 20;
    const usedNodeIds = new Set<number>([depotId]);

    return stops.map((s, idx) => {
      let targetNodeId: number;
      if (s.node_id && s.node_id >= 1 && s.node_id <= DEMO_NODES.length && !usedNodeIds.has(s.node_id)) {
        targetNodeId = s.node_id;
      } else {
        const hash = Math.abs((s.name || `${s.lat},${s.lon}`).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) + (idx + 1) * 7);
        let candidate = (hash % DEMO_NODES.length) + 1;
        let attempts = 0;
        while (usedNodeIds.has(candidate) && attempts < DEMO_NODES.length) {
          candidate = (candidate % DEMO_NODES.length) + 1;
          attempts++;
        }
        targetNodeId = candidate;
      }
      usedNodeIds.add(targetNodeId);
      return {
        nodeId: targetNodeId,
        stopNumber: idx + 1,
        vehicleIdx: s.vehicleIdx ?? 0,
        name: s.name || `Stop #${idx + 1}`,
        pickup_weight: s.pickup_weight || 0,
        dropoff_weight: s.dropoff_weight || 0,
      };
    });
  }, [demoStops, stops, effectiveDepotNodeId]);

  const effectiveStopsCount = effectiveStops.length;
  const totalStopsDemand = effectiveStops.reduce((sum, s) => sum + (s.pickup_weight || 0) + (s.dropoff_weight || 0), 0);

  // Computed fleet stats
  const runningFleet = fleet.filter((v) => (v.status ?? 'running') === 'running');
  const totalRunningMaxCapacity = runningFleet.reduce((sum, v) => sum + (v.capacity || 0), 0);
  const runningVehicleCount = runningFleet.length;
  const dormantVehicleCount = fleet.length - runningVehicleCount;

  // Effective routes dynamically generated for user's vehicles and stops
  const effectiveRoutes = useMemo(() => {
    if (demoRoutes.length > 0) return demoRoutes;
    if (effectiveDepotNodeId && effectiveStops.length > 0 && runningFleet.length > 0) {
      const blockedRoads = activeIncidents.map((i) => i.roadId);
      return generateMultiVehicleDispatchPlan(
        effectiveDepotNodeId,
        effectiveStops,
        runningFleet,
        operationalFocus,
        blockedRoads
      );
    }
    return [];
  }, [demoRoutes, effectiveDepotNodeId, effectiveStops, runningFleet, operationalFocus, activeIncidents]);

  // Jump to simulate step if user already has fleet and stops set
  useEffect(() => {
    if (fleet.length > 0 && stops.length > 0) {
      setCurrentStep('simulate');
    }
  }, []);

  const getVehicleWeightSummary = (vehicleIdx: number) => {
    const vehicle = fleet[vehicleIdx];
    if (!vehicle) return { currentWeight: 0, maxWeight: 0, stopsForVehicle: [] as typeof effectiveStops, isOverloaded: false, isUnderloaded: false, weightTrace: [] as { stopName: string; pickup: number; dropoff: number; weight: number; over: boolean; under: boolean }[], returnWeight: 0 };
    const stopsForVehicle = effectiveStops.filter((s) => s.vehicleIdx === vehicleIdx);
    let runningWeight = vehicle.currentWeight ?? 0;
    let isOverloaded = false;
    let isUnderloaded = false;
    const weightTrace: { stopName: string; pickup: number; dropoff: number; weight: number; over: boolean; under: boolean }[] = [];
    for (const stop of stopsForVehicle) {
      const pw = stop.pickup_weight || 0;
      const dw = stop.dropoff_weight || 0;
      runningWeight = runningWeight - dw + pw;
      const under = runningWeight < 0;
      if (under) { isUnderloaded = true; runningWeight = 0; }
      const over = runningWeight > (vehicle.capacity || 0);
      if (over) isOverloaded = true;
      weightTrace.push({ stopName: stop.name ?? 'Stop', pickup: pw, dropoff: dw, weight: runningWeight, over, under });
    }
    return { currentWeight: vehicle.currentWeight ?? 0, maxWeight: vehicle.capacity || 0, stopsForVehicle, isOverloaded, isUnderloaded, weightTrace, returnWeight: runningWeight };
  };

  useEffect(() => {
    if (currentStep !== 'fleet') ensureNetwork();
  }, [currentStep, ensureNetwork]);

  useEffect(() => {
    if (currentStep === 'depot') setMapClickMode('place_depot');
    else if (currentStep === 'stops') setMapClickMode('place_stop');
    else setMapClickMode('none');
  }, [currentStep, setMapClickMode]);



  // Update latest incident entry when impact data arrives from context
  useEffect(() => {
    if (latestImpact && lastIncidentIdRef.current) {
      setIncidentLog((prev) =>
        prev.map((e, i) =>
          i === 0
            ? {
                ...e,
                impactScore: latestImpact.impact_score,
                significant: latestImpact.significant,
                deltaTime: latestImpact.delta_time,
                deltaCongestion: latestImpact.delta_congestion,
              }
            : e
        )
      );
    }
  }, [latestImpact]);

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const handleQuickLaunch = async (id: DemoPresetType) => {
    setSelectedPresetId(id);
    setIsLoadingPreset(true);

    // Populate Meridian City local demo data
    const presetData = DEMO_PRESET_SCENARIOS[id] || DEMO_PRESET_SCENARIOS.urban_delivery;
    if (presetData) {
      setDemoDepotNodeId(presetData.depotNodeId);
      const stopsList: Array<{
        nodeId: number;
        stopNumber: number;
        vehicleIdx: number;
        name: string;
        demand: number;
      }> = [];
      let globalStopNum = 1;
      presetData.routes.forEach((r) => {
        r.stops.forEach((sId) => {
          const node = nodeById(sId);
          stopsList.push({
            nodeId: sId,
            stopNumber: globalStopNum++,
            vehicleIdx: r.vehicleIdx,
            name: node?.name || `Stop #${sId}`,
            demand: Math.round(15 + Math.random() * 20),
          });
        });
      });
      setDemoStops(stopsList);
      // Generate dispatch plan for selected preference
      const initialRoutes = generateMultiVehicleDispatchPlan(
        presetData.depotNodeId,
        stopsList,
        presetData.fleet,
        operationalFocus,
        []
      );
      setDemoRoutes(initialRoutes.length > 0 ? initialRoutes : presetData.routes);
      setDemoPreviousRoutes([]);
      setActiveIncidents([]);
      setAlternativeRoutes([]);
    }

    try {
      await loadPresetScenario(id);
    } catch {
      // Backend unavailable, self-contained demo mode continues seamlessly
    } finally {
      setIsLoadingPreset(false);
      setCurrentStep('plan');
    }
  };

  const handleAddVehicle = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newVehicleName.trim();
    const maxW = parseFloat(newVehicleMaxWeight);
    const curW = parseFloat(newVehicleCurrentWeight);
    if (!name || isNaN(maxW) || maxW <= 0) return;
    const currentW = isNaN(curW) ? 0 : Math.min(curW, maxW);

    // If adding first manual vehicle, reset preset stops so user starts with a clean slate
    if (fleet.length === 0 && selectedPresetId === null) {
      setDemoStops([]);
      setDemoRoutes([]);
    }

    addVehicle(name, maxW, currentW, newVehicleStatus);
    setNewVehicleName(''); setNewVehicleMaxWeight(''); setNewVehicleCurrentWeight(''); setNewVehicleStatus('running');
    setIsFleetConfirmed(false);
  };

  const handleMapNodeClick = (node: DemoNode) => {
    if (currentStep === 'depot') {
      setDemoDepotNodeId(node.id);
      setDepotAddressText(`${node.name}, ${node.district}`);
      return;
    }
    if (currentStep === 'stops') {
      // If fleet has no vehicles yet, add a default vehicle
      if (fleet.length === 0) {
        addVehicle('Vehicle 1', 500, 100, 'running');
        setActiveStopVehicleIdx(0);
      }
      const vehIdx = activeStopVehicleIdx < fleet.length ? activeStopVehicleIdx : 0;
      const pw = parseFloat(mapStopPickupWeight) || 0;
      const dw = parseFloat(mapStopDropoffWeight) || 0;

      setPendingOperationType(dw > pw ? 'dropoff' : 'pickup');
      setPendingWeightAmount(String(Math.abs(dw - pw)));
      setPendingVehicleIdx(vehIdx);
      setPendingStopCustomName(`${node.name} (${node.district})`);
      setPendingStopNode(node);
    }
  };

  const handleConfirmPendingStop = () => {
    if (!pendingStopNode) return;
    const amount = parseFloat(pendingWeightAmount);
    if (isNaN(amount) || amount <= 0) return;
    const pw = pendingOperationType === 'pickup' ? amount : 0;
    const dw = pendingOperationType === 'dropoff' ? amount : 0;
    const vehIdx = pendingVehicleIdx < fleet.length ? pendingVehicleIdx : 0;

    setDemoStops((prev) => {
      // Prevent duplicate stop at same node for same vehicle
      const exists = prev.some((s) => s.nodeId === pendingStopNode.id && s.vehicleIdx === vehIdx);
      if (exists) return prev;
      return [
        ...prev,
        {
          nodeId: pendingStopNode.id,
          stopNumber: prev.length + 1,
          vehicleIdx: vehIdx,
          name: pendingStopCustomName.trim() || `${pendingStopNode.name} (${pendingStopNode.district})`,
          pickup_weight: pw,
          dropoff_weight: dw,
        },
      ];
    });

    setPendingStopNode(null);
  };

  const handleCancelPendingStop = () => {
    setPendingStopNode(null);
  };

  const handleRemoveStop = (nodeId: number, vehicleIdx: number, idxInVehicle?: number) => {
    setDemoStops((prev) => {
      const idx = prev.findIndex((s) => s.nodeId === nodeId && s.vehicleIdx === vehicleIdx);
      if (idx >= 0) {
        const copy = [...prev];
        copy.splice(idx, 1);
        return copy.map((s, i) => ({ ...s, stopNumber: i + 1 }));
      }
      if (idxInVehicle !== undefined) {
        let count = 0;
        return prev
          .filter((s) => {
            if (s.vehicleIdx === vehicleIdx) {
              const match = count === idxInVehicle;
              count++;
              return !match;
            }
            return true;
          })
          .map((s, i) => ({ ...s, stopNumber: i + 1 }));
      }
      return prev;
    });
  };

  const handleClearVehicleStops = (vehicleIdx: number) => {
    setDemoStops((prev) => prev.filter((s) => s.vehicleIdx !== vehicleIdx).map((s, i) => ({ ...s, stopNumber: i + 1 })));
  };

  const handleClearAllStops = () => {
    setDemoStops([]);
  };

  const handleResetFleetAndStops = () => {
    setDemoStops([]);
    setDemoRoutes([]);
    setDemoPreviousRoutes([]);
    setActiveIncidents([]);
    setAlternativeRoutes([]);
    setSelectedPresetId(null);
  };

  const handleSelectDepotAddress = async (item: AddressSuggestion) => {
    setDepotAddressText(item.name);
    const hash = Math.abs(item.name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0));
    const targetNode = DEMO_NODES[hash % DEMO_NODES.length];
    setDemoDepotNodeId(targetNode.id);
    try {
      await setDepotCoords(item.lat, item.lon);
    } catch {
      // Offline fallback
    }
  };

  const handleSelectStopAddress = async (item: AddressSuggestion) => {
    const pw = parseFloat(mapStopPickupWeight) || 0;
    const dw = parseFloat(mapStopDropoffWeight) || 0;
    if (pw === 0 && dw === 0) return;
    const summary = getVehicleWeightSummary(activeStopVehicleIdx);
    const projected = summary.returnWeight - dw + pw;
    // Block if would cause negative weight or exceed max
    if (projected < 0) return;
    if (projected > summary.maxWeight) return;
    await addStopCoords(item.lat, item.lon, pw, dw, activeStopVehicleIdx);
  };

  const handleRunOptimization = async () => {
    // Generate deterministic Meridian City multi-vehicle dispatch paths for selected preference
    const blockedRoads = activeIncidents.map((i) => i.roadId);
    const demoVehicles = runningFleet.length > 0
      ? runningFleet
      : [{ name: 'Van Alpha', capacity: 500, currentWeight: 0, status: 'running' as const }];
    const generated = generateMultiVehicleDispatchPlan(
      effectiveDepotNodeId || 20,
      effectiveStops,
      demoVehicles,
      operationalFocus,
      blockedRoads
    );
    if (generated && generated.length > 0) {
      setDemoRoutes(generated);
    }
    // Also trigger context saveAndOptimize if available
    try {
      await saveAndOptimize(operationalFocus);
    } catch {
      // Backend not running, demo mode operates smoothly
    }
    setCurrentStep('plan');
  };

  const handleSelectPreferenceInPlan = (pref: OperationalPreference) => {
    setOperationalFocus(pref);
    applyPreference(pref);
    const blockedRoads = activeIncidents.map((i) => i.roadId);
    const demoVehicles = runningFleet.length > 0
      ? runningFleet
      : [{ name: 'Van Alpha', capacity: 500, currentWeight: 0, status: 'running' as const }];
    const recomputed = generateMultiVehicleDispatchPlan(
      effectiveDepotNodeId || 20,
      effectiveStops,
      demoVehicles,
      pref,
      blockedRoads
    );
    if (recomputed && recomputed.length > 0) {
      setDemoRoutes(recomputed);
    }
  };

  const handleInjectIncident = async () => {
    if (isInjectingIncident || !selectedIncidentRoadId) return;
    setIsInjectingIncident(true);
    setIsSelectingLocationOnMap(false);

    const newId = Date.now();
    lastIncidentIdRef.current = newId;
    const baseDeltaTime = eventSeverity === 'High' ? 22 : eventSeverity === 'Medium' ? 12 : 6;
    const baseDeltaCong = eventSeverity === 'High' ? 55 : eventSeverity === 'Medium' ? 30 : 15;

    if (eventType === 'recovery') {
      const updatedIncidents = activeIncidents.filter((i) => i.roadId !== selectedIncidentRoadId);
      setActiveIncidents(updatedIncidents);
      const remainingAlts = findMultiIncidentAlternatives(
        updatedIncidents.map((i) => i.roadId),
        effectiveRoutes,
        operationalFocus
      );
      setAlternativeRoutes(remainingAlts);

      setIncidentLog((prev) => [
        {
          id: newId,
          type: eventType,
          severity: eventSeverity,
          timestamp: new Date(),
          impactScore: 0,
          significant: false,
          rerouted: false,
          deltaTime: -baseDeltaTime,
          deltaCongestion: -baseDeltaCong,
        },
        ...prev,
      ]);
      setIsInjectingIncident(false);
      return;
    }

    const newIncident: ActiveIncident = {
      id: `inc-${newId}`,
      roadId: selectedIncidentRoadId,
      type: eventType as any,
      severity: eventSeverity,
      timestamp: new Date(),
    };

    // Add or update incident for that road (supports multiple simultaneous incidents)
    const updatedIncidents = [
      ...activeIncidents.filter((i) => i.roadId !== selectedIncidentRoadId),
      newIncident,
    ];
    setActiveIncidents(updatedIncidents);

    // Compute dynamic detour bypasses for all active incidents
    const newAlts = findMultiIncidentAlternatives(
      updatedIncidents.map((i) => i.roadId),
      effectiveRoutes,
      operationalFocus
    );
    setAlternativeRoutes(newAlts);

    setIncidentLog((prev) => [
      {
        id: newId,
        type: eventType,
        severity: eventSeverity,
        timestamp: new Date(),
        impactScore: eventSeverity === 'High' ? 0.92 : eventSeverity === 'Medium' ? 0.65 : 0.35,
        significant: newAlts.length > 0,
        rerouted: false,
        deltaTime: baseDeltaTime,
        deltaCongestion: baseDeltaCong,
      },
      ...prev,
    ]);

    try {
      await triggerTrafficDisruption(eventType, eventSeverity);
    } catch {
      // Local demo mode handled gracefully
    } finally {
      setIsInjectingIncident(false);
    }
  };

  const handleRemoveIncident = (roadId: string) => {
    const updated = activeIncidents.filter((i) => i.roadId !== roadId);
    setActiveIncidents(updated);
    const newAlts = findMultiIncidentAlternatives(
      updated.map((i) => i.roadId),
      effectiveRoutes,
      operationalFocus
    );
    setAlternativeRoutes(newAlts);
  };

  const handleRevertAllRouteChanges = () => {
    setActiveIncidents([]);
    setAlternativeRoutes([]);
    setIncidentLog([]);
    setRerouteCount(0);
    setDemoPreviousRoutes([]);
    
    const demoVehicles = runningFleet.length > 0
      ? runningFleet
      : [{ name: 'Van Alpha', capacity: 500, currentWeight: 0, status: 'running' as const }];
    const pristineRoutes = generateMultiVehicleDispatchPlan(
      effectiveDepotNodeId || 20,
      effectiveStops,
      demoVehicles,
      operationalFocus,
      []
    );
    if (pristineRoutes && pristineRoutes.length > 0) {
      setDemoRoutes(pristineRoutes);
    }
  };

  const handleApplyAllAlternatives = () => {
    if (alternativeRoutes.length === 0) return;
    setDemoPreviousRoutes([...effectiveRoutes]);

    setDemoRoutes((prev) => {
      let current = [...(prev.length > 0 ? prev : effectiveRoutes)];
      for (const alt of alternativeRoutes) {
        current = current.map((r) => {
          if (r.vehicleIdx !== alt.vehicleIdx) return r;
          const p = [...r.path];
          const orig = alt.originalPath;
          const rerouted = alt.reroutedPath;

          for (let i = 0; i <= p.length - orig.length; i++) {
            let match = true;
            for (let j = 0; j < orig.length; j++) {
              if (p[i + j] !== orig[j]) {
                match = false;
                break;
              }
            }
            if (match) {
              const before = p.slice(0, i);
              const after = p.slice(i + orig.length);
              return {
                ...r,
                path: [...before, ...rerouted, ...after],
              };
            }
          }
          return r;
        });
      }
      return current;
    });

    setRerouteCount((c) => c + alternativeRoutes.length);
    setIncidentLog((prev) =>
      prev.map((e, i) => (i === 0 ? { ...e, rerouted: true } : e))
    );
    setAlternativeRoutes([]);
  };

  const handleConfirmReroute = async () => {
    handleApplyAllAlternatives();
    setPreviousRoutes([...routes]);
    try {
      await confirmReroute();
    } catch {
      // Local demo mode fallback
    }
  };

  const handleResetSimulation = () => {
    setPreviousRoutes([]);
    setDemoPreviousRoutes([]);
    setActiveIncidents([]);
    setAlternativeRoutes([]);
    setIsSelectingLocationOnMap(false);
    setIncidentLog([]);
    setRerouteCount(0);
    lastIncidentIdRef.current = null;

    if (selectedPresetId) {
      const presetData = DEMO_PRESET_SCENARIOS[selectedPresetId];
      if (presetData) {
        setDemoRoutes(presetData.routes);
      }
    } else {
      const demoVehicles = runningFleet.length > 0
        ? runningFleet
        : [{ name: 'Van Alpha', capacity: 500, currentWeight: 0, status: 'running' as const }];
      const pristineRoutes = generateMultiVehicleDispatchPlan(
        effectiveDepotNodeId || 20,
        effectiveStops,
        demoVehicles,
        operationalFocus,
        []
      );
      setDemoRoutes(pristineRoutes);
    }
  };

  // ─── Style helpers ────────────────────────────────────────────────────────────

  const ic = (extra = '') =>
    `w-full px-4 py-2.5 rounded-xl border text-base outline-none transition-colors ${
      isDark
        ? 'bg-neutral-900 border-neutral-700 text-white focus:border-white'
        : 'bg-neutral-50 border-neutral-300 text-black focus:border-black'
    } ${extra}`;
  const borderCls = isDark ? 'border-[#222222]' : 'border-[#e5e5e5]';
  const bgCls = isDark ? 'bg-[#070707]' : 'bg-white';

  const stepDefs = [
    { key: 'fleet', label: 'Fleet Setup', enabled: true },
    { key: 'depot', label: 'Depot Location', enabled: fleet.length > 0 || effectiveDepotNodeId !== null },
    { key: 'stops', label: 'Stops per Vehicle', enabled: !!depot || effectiveDepotNodeId !== null || effectiveStopsCount > 0 },
    { key: 'focus', label: 'Operational Focus', enabled: effectiveStopsCount > 0 },
    { key: 'plan', label: 'Dispatch Plan', enabled: effectiveRoutes.length > 0 || routes.length > 0 },
    { key: 'simulate', label: 'Simulation', enabled: effectiveRoutes.length > 0 || routes.length > 0, special: true },
  ];

  const strategyComparison: StrategyMetrics[] = useMemo(() => {
    return getAllStrategiesComparison(effectiveRoutes);
  }, [effectiveRoutes]);

  interface DisplayVehicleItem {
    key: string;
    vehicleId: number;
    name: string;
    colour: string;
    capacity: number;
    startWeight: number;
    totalDropped: number;
    totalPickup: number;
    returnWeight: number;
    stops: Array<{ name: string }>;
  }

  const displayVehicles: DisplayVehicleItem[] = useMemo(() => {
    if (effectiveRoutes.length > 0) {
      return effectiveRoutes.map((route) => {
        const colour = VEHICLE_COLOURS[route.vehicleIdx % VEHICLE_COLOURS.length];
        const vehicleStops = effectiveStops.filter((s) => s.vehicleIdx === route.vehicleIdx);
        const veh = fleet[route.vehicleIdx];
        const startWeight = veh?.currentWeight ?? 0;
        let runningW = startWeight;
        let totalDropped = 0;
        let totalPickup = 0;
        for (const stop of vehicleStops) {
          const pw = stop.pickup_weight || 0;
          const dw = stop.dropoff_weight || 0;
          runningW = runningW - dw + pw;
          runningW = Math.max(0, runningW);
          totalDropped += dw;
          totalPickup += pw;
        }
        return {
          key: `demo-route-${route.vehicleIdx}`,
          vehicleId: route.vehicleIdx,
          name: route.vehicleName,
          colour,
          capacity: veh?.capacity ?? 450,
          startWeight,
          totalDropped,
          totalPickup,
          returnWeight: runningW,
          stops: vehicleStops.map((s) => ({ name: s.name ?? `Stop #${s.nodeId}` })),
        };
      });
    }
    return [];
  }, [effectiveRoutes, effectiveStops, fleet]);

  const formatTime = (d: Date) =>
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const severityColor = (sev: 'Low' | 'Medium' | 'High') =>
    sev === 'High' ? 'text-red-400' : sev === 'Medium' ? 'text-amber-400' : 'text-emerald-400';

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div
      className={`h-[calc(100vh-4rem)] max-h-[calc(100vh-4rem)] w-full flex flex-col font-garamond transition-colors duration-300 select-none overflow-hidden ${
        isDark ? 'bg-[#050505] text-[#fafafa]' : 'bg-[#fafafa] text-[#0a0a0a]'
      }`}
      style={{ fontFamily: '"EB Garamond", serif' }}
    >
      {/* ── Step Indicator ── */}
      <div
        className={`w-full px-6 md:px-14 py-3 border-b flex flex-wrap items-center justify-between gap-4 transition-colors shrink-0 ${
          isDark ? 'border-[#222222] bg-[#090909]/90' : 'border-[#e5e5e5] bg-[#f5f5f5]/90'
        } backdrop-blur-sm z-30`}
      >
        <div className="flex items-center gap-2 sm:gap-4 text-base overflow-x-auto py-1">
          {stepDefs.map((step, i) => (
            <React.Fragment key={step.key}>
              {i > 0 && <span className="opacity-30 shrink-0">→</span>}
              <button
                onClick={() => { if (step.enabled) setCurrentStep(step.key as WizardStep); }}
                disabled={!step.enabled}
                className={`flex items-center gap-1.5 transition-opacity shrink-0 ${
                  currentStep === step.key
                    ? (step as any).special
                      ? 'text-red-400 font-semibold underline underline-offset-4'
                      : isDark
                      ? 'text-white font-semibold underline underline-offset-4'
                      : 'text-black font-semibold underline underline-offset-4'
                    : step.enabled
                    ? 'opacity-50 hover:opacity-100'
                    : 'opacity-25 cursor-not-allowed'
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full border text-xs flex items-center justify-center shrink-0 ${
                    (step as any).special && step.enabled
                      ? 'border-red-500 text-red-400'
                      : ''
                  }`}
                >
                  {i + 1}
                </span>
                <span>{step.label}</span>
                {(step as any).special && step.enabled && (
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                )}
              </button>
            </React.Fragment>
          ))}
        </div>

        <div className="flex items-center gap-3 text-sm">
          {currentStep === 'fleet' && <span className="opacity-70">{fleet.length} vehicles · {runningVehicleCount} running · {totalRunningMaxCapacity} kg capacity</span>}
          {currentStep === 'depot' && <span className="opacity-70">{demoDepotNodeId || depot ? `Depot at Node #${demoDepotNodeId || depot?.node_id}` : 'Click map to place depot'}</span>}
          {currentStep === 'stops' && <span className="opacity-70">{effectiveStopsCount} stops · {totalStopsDemand} kg demand</span>}
          {currentStep === 'plan' && (
            <button onClick={() => setCurrentStep('fleet')} className={`px-3 py-1 rounded-full border text-xs transition-all ${isDark ? 'border-neutral-700 hover:border-white' : 'border-neutral-300 hover:border-black'}`}>Modify Setup</button>
          )}
          {currentStep === 'simulate' && (
            <span className="opacity-70">{incidentLog.length} events · {rerouteCount} reroutes</span>
          )}
          <span className={`px-2.5 py-0.5 rounded-full text-xs border shrink-0 ${isDark ? 'border-red-800 bg-red-950/30 text-red-400' : 'border-red-300 bg-red-50 text-red-600'}`}>
            Demo Mode
          </span>
        </div>
      </div>

      <div className="flex-1 w-full flex flex-col min-h-0 overflow-hidden">

        {/* Mobile Sub-Header: Segmented Switcher for Panel vs. Map */}
        {['depot', 'stops', 'plan', 'simulate'].includes(currentStep) && (
          <div
            className={`lg:hidden flex items-center justify-center px-4 py-2 border-b shrink-0 z-30 transition-colors backdrop-blur-md ${borderCls} ${
              isDark ? 'bg-neutral-950/95' : 'bg-white/95'
            }`}
          >
            <div className={`flex p-1 rounded-full border text-xs w-full max-w-xs mx-auto justify-center ${isDark ? 'border-neutral-800 bg-neutral-900/70' : 'border-neutral-200 bg-neutral-100/90'}`}>
              <button
                type="button"
                onClick={() => setMobileView('panel')}
                className={`flex-1 py-1.5 px-3 rounded-full font-medium transition-all text-center ${
                  mobileView === 'panel'
                    ? (isDark ? 'bg-white text-black font-semibold shadow' : 'bg-black text-white font-semibold shadow')
                    : (isDark ? 'text-neutral-400 hover:text-white' : 'text-neutral-600 hover:text-black')
                }`}
              >
                Controls & Setup
              </button>
              <button
                type="button"
                onClick={() => setMobileView('map')}
                className={`flex-1 py-1.5 px-3 rounded-full font-medium transition-all text-center flex items-center justify-center gap-1.5 ${
                  mobileView === 'map'
                    ? (isDark ? 'bg-white text-black font-semibold shadow' : 'bg-black text-white font-semibold shadow')
                    : (isDark ? 'text-neutral-400 hover:text-white' : 'text-neutral-600 hover:text-black')
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Interactive Map
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════ */}
        {/* STEP 1: FLEET — with Quick Launch presets              */}
        {/* ══════════════════════════════════════════════════════ */}
        {currentStep === 'fleet' && (
          <div className="flex-1 w-full overflow-y-auto sleek-scrollbar">
            <div className="max-w-5xl w-full mx-auto px-6 md:px-12 py-10 space-y-10">

              {/* Page heading */}
              <div className="space-y-2 text-left">
                <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight">Route Simulation Laboratory</h1>
                <p className="text-lg opacity-75 max-w-2xl">Configure your own fleet and scenario — or quick-launch a preset to skip straight to simulation.</p>
              </div>

              {/* ── Quick Launch Presets ── */}
              <div className="space-y-4 text-left">
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-semibold">Quick Launch Presets</h2>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs border ${isDark ? 'border-red-800 bg-red-950/30 text-red-400' : 'border-red-300 bg-red-50 text-red-600'}`}>Skips to Dispatch Plan →</span>
                </div>
                <p className="text-sm opacity-60">Pre-configured fleet distributions evaluated against dynamic road disruptions.</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {DEMO_PRESETS.map((sc) => {
                    const isLoading = selectedPresetId === sc.id && isLoadingPreset;
                    return (
                      <button
                        key={sc.id}
                        onClick={() => handleQuickLaunch(sc.id)}
                        disabled={isLoadingPreset}
                        className={`p-4 rounded-2xl border text-left transition-all flex flex-col gap-3 ${
                          isLoading
                            ? isDark
                              ? 'border-white bg-neutral-900 animate-pulse'
                              : 'border-black bg-neutral-100 animate-pulse'
                            : isDark
                            ? 'border-neutral-800 bg-[#0a0a0a] hover:border-neutral-600 hover:scale-[1.02] hover:bg-neutral-900/60'
                            : 'border-neutral-200 bg-white hover:border-neutral-400 hover:scale-[1.02] hover:shadow-lg'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: sc.color }}
                          />
                          <span className={`text-[10px] px-2 py-0.5 rounded border font-mono ${isDark ? 'border-neutral-700 text-neutral-400' : 'border-neutral-300 text-neutral-600'}`}>
                            {sc.badge}
                          </span>
                        </div>
                        <div>
                          <div className="font-semibold text-base">{sc.title}</div>
                          <p className="text-xs opacity-60 mt-1 leading-relaxed">{sc.desc}</p>
                        </div>
                        <div className={`flex items-center justify-between text-xs opacity-60 pt-2 border-t ${isDark ? 'border-neutral-800/50' : 'border-neutral-200'}`}>
                          <span>{sc.stops} stops · {sc.vehicles} vehicles</span>
                          <span className="font-semibold">
                            {isLoading ? 'Loading...' : 'Launch →'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-4">
                <div className={`flex-1 border-t ${isDark ? 'border-neutral-800/60' : 'border-neutral-300/60'}`} />
                <span className="text-sm opacity-40 shrink-0 font-mono">— or configure manually —</span>
                <div className={`flex-1 border-t ${isDark ? 'border-neutral-800/60' : 'border-neutral-300/60'}`} />
              </div>

              {/* ── Manual Fleet Config ── */}
              <div className="space-y-2 text-left">
                <h2 className="text-2xl font-semibold">Fleet Configuration</h2>
                <p className="text-base opacity-75">Add vehicles manually. Set name, max capacity, current load, and status.</p>
              </div>

              <div className={`p-6 sm:p-8 rounded-2xl border transition-colors ${isDark ? 'bg-[#0a0a0a] border-neutral-800' : 'bg-white border-neutral-200'}`}>
                <form onSubmit={handleAddVehicle} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="text-left space-y-1.5">
                      <label className="block text-sm opacity-80">Vehicle Name / ID</label>
                      <input type="text" value={newVehicleName} onChange={(e) => setNewVehicleName(e.target.value)} placeholder="e.g. Truck Alpha" className={ic()} />
                    </div>
                    <div className="text-left space-y-1.5">
                      <label className="block text-sm opacity-80">Max Weight (kg)</label>
                      <input type="number" min="1" value={newVehicleMaxWeight} onChange={(e) => setNewVehicleMaxWeight(e.target.value)} placeholder="e.g. 500" className={ic()} />
                    </div>
                    <div className="text-left space-y-1.5">
                      <label className="block text-sm opacity-80">Current Load (kg)</label>
                      <input type="number" min="0" value={newVehicleCurrentWeight} onChange={(e) => setNewVehicleCurrentWeight(e.target.value)} placeholder="e.g. 200" className={ic()} />
                    </div>
                    <div className="text-left space-y-1.5">
                      <label className="block text-sm opacity-80">Status</label>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setNewVehicleStatus('running')} className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-all ${newVehicleStatus === 'running' ? isDark ? 'bg-emerald-900/50 border-emerald-600 text-emerald-300' : 'bg-emerald-50 border-emerald-500 text-emerald-800' : isDark ? 'bg-neutral-900 border-neutral-700 text-neutral-400' : 'bg-neutral-50 border-neutral-300 text-neutral-500'}`}>Running</button>
                        <button type="button" onClick={() => setNewVehicleStatus('dormant')} className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-all ${newVehicleStatus === 'dormant' ? isDark ? 'bg-neutral-700/50 border-neutral-500 text-neutral-300' : 'bg-neutral-200 border-neutral-400 text-neutral-700' : isDark ? 'bg-neutral-900 border-neutral-700 text-neutral-400' : 'bg-neutral-50 border-neutral-300 text-neutral-500'}`}>Dormant</button>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button type="submit" disabled={!newVehicleName.trim() || !newVehicleMaxWeight || parseFloat(newVehicleMaxWeight) <= 0} className={`px-8 py-2.5 rounded-xl border text-base font-medium transition-all ${!newVehicleName.trim() || !newVehicleMaxWeight || parseFloat(newVehicleMaxWeight) <= 0 ? 'opacity-40 cursor-not-allowed border-neutral-700' : isDark ? 'bg-white text-black border-white hover:bg-neutral-200' : 'bg-black text-white border-black hover:bg-neutral-800'}`}>+ Add Vehicle</button>
                  </div>
                </form>
              </div>

              {/* Fleet roster */}
              <div className="space-y-4 text-left">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-semibold">Active Fleet Roster</h2>
                  <span className="text-sm opacity-70">{fleet.length} vehicles registered</span>
                </div>
                {fleet.length === 0 ? (
                  <div className={`p-8 rounded-2xl border text-center ${isDark ? 'border-neutral-800 bg-[#0a0a0a]' : 'border-neutral-200 bg-white'}`}>
                    <p className="text-lg opacity-70">No vehicles added yet. Use a Quick Launch preset above or fill the form to add vehicles.</p>
                  </div>
                ) : (
                  <div className={`rounded-2xl border overflow-hidden ${isDark ? 'border-neutral-800 bg-[#0a0a0a]' : 'border-neutral-200 bg-white'}`}>
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className={`border-b text-sm ${isDark ? 'border-neutral-800 text-neutral-400' : 'border-neutral-200 text-neutral-600'}`}>
                          <th className="py-3 px-4 font-normal">#</th>
                          <th className="py-3 px-4 font-normal">Vehicle Name</th>
                          <th className="py-3 px-4 font-normal">Max Weight</th>
                          <th className="py-3 px-4 font-normal">Current Load</th>
                          <th className="py-3 px-4 font-normal">Status</th>
                          <th className="py-3 px-4 text-right font-normal">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fleet.map((v, idx) => {
                          const isRunning = (v.status ?? 'running') === 'running';
                          const colour = VEHICLE_COLOURS[idx % VEHICLE_COLOURS.length];
                          const dColour = colour === '#000000' && isDark ? '#ffffff' : colour;
                          return (
                            <tr key={idx} className={`border-b last:border-b-0 transition-colors ${isDark ? 'border-neutral-800/60 hover:bg-neutral-900/30' : 'border-neutral-200/60 hover:bg-neutral-50'}`}>
                              <td className="py-3 px-4 opacity-60 text-sm">{idx + 1}</td>
                              <td className="py-3 px-4 font-medium text-base"><div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: dColour }} />{v.name}</div></td>
                              <td className="py-3 px-4 text-base"><span className="font-semibold">{v.capacity}</span> <span className="text-xs opacity-70">kg</span></td>
                              <td className="py-3 px-4 text-base"><span className="font-semibold">{v.currentWeight ?? 0}</span> <span className="text-xs opacity-70">kg</span></td>
                              <td className="py-3 px-4">
                                <button onClick={() => updateVehicle(idx, { status: isRunning ? 'dormant' : 'running' })} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border transition-all ${isRunning ? isDark ? 'border-emerald-700/60 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/50' : 'border-emerald-500 bg-emerald-50 text-emerald-800 hover:bg-emerald-100' : isDark ? 'border-neutral-700 bg-neutral-800/50 text-neutral-400 hover:border-neutral-500' : 'border-neutral-300 bg-neutral-100 text-neutral-600 hover:border-neutral-400'}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-emerald-400' : 'bg-neutral-500'}`} />
                                  {isRunning ? 'Running' : 'Dormant'}
                                </button>
                              </td>
                              <td className="py-3 px-4 text-right"><button onClick={() => removeVehicle(idx)} className="text-sm opacity-60 hover:opacity-100 hover:text-red-500 transition-colors">Remove</button></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div className={`p-5 border-t flex flex-wrap items-center justify-between gap-4 text-base ${isDark ? 'border-neutral-800 bg-neutral-900/40' : 'border-neutral-200 bg-neutral-50'}`}>
                      <div><span className="opacity-70">Total Vehicles: </span><strong className="text-lg">{fleet.length}</strong>{dormantVehicleCount > 0 && <span className="text-xs opacity-50 ml-2">({dormantVehicleCount} dormant, excluded)</span>}</div>
                      <div><span className="opacity-70">Running Fleet Capacity: </span><strong className="text-xl">{totalRunningMaxCapacity} kg</strong></div>
                      <div><span className="opacity-70">Running: </span><strong className="text-lg">{runningVehicleCount}</strong></div>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-6 border-t flex flex-wrap items-center justify-between gap-4 border-neutral-800/40">
                <div>
                  {isFleetConfirmed
                    ? <span className="text-sm text-emerald-400">Fleet confirmed ({runningVehicleCount} running, {totalRunningMaxCapacity} kg capacity).</span>
                    : <span className="text-sm opacity-60">Review your fleet and confirm to proceed to depot placement.</span>
                  }
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={handleResetFleetAndStops} className={`px-4 py-2.5 rounded-full border text-sm transition-colors opacity-70 hover:opacity-100 ${isDark ? 'border-neutral-700 hover:border-white' : 'border-neutral-300 hover:border-black'}`}>Clear Stops & Reset</button>
                  {isFleetConfirmed && <button onClick={() => setIsFleetConfirmed(false)} className={`px-5 py-2.5 rounded-full border text-base transition-colors ${isDark ? 'border-neutral-700 hover:border-white' : 'border-neutral-300 hover:border-black'}`}>Edit Fleet</button>}
                  <button disabled={fleet.length === 0 || runningVehicleCount === 0} onClick={() => { setIsFleetConfirmed(true); setCurrentStep('depot'); }} className={`px-8 py-3 rounded-full text-lg font-medium transition-all ${fleet.length === 0 || runningVehicleCount === 0 ? 'opacity-40 cursor-not-allowed border border-neutral-700' : isDark ? 'bg-white text-black hover:bg-neutral-200 shadow-xl' : 'bg-black text-white hover:bg-neutral-800 shadow-xl'}`}>Confirm Fleet & Proceed to Depot →</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════ */}
        {/* STEP 2: DEPOT                                         */}
        {/* ══════════════════════════════════════════════════════ */}
        {currentStep === 'depot' && (
          <div className="flex-1 w-full flex flex-col lg:flex-row h-full min-h-0 overflow-hidden">
            <div className={`${mobileView === 'panel' ? 'flex' : 'hidden'} lg:flex w-full lg:w-[440px] h-full p-6 sm:p-8 flex-col justify-between border-r text-left overflow-y-auto sleek-scrollbar shrink-0 ${borderCls} ${bgCls}`}>
              <div className="space-y-6">
                <div>
                  <h2 className="text-3xl font-semibold">Depot Location</h2>
                  <p className="text-base opacity-75 mt-1">Set the origin and return terminal for the fleet. Search an address or click a road on the map.</p>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm opacity-80">Search Address</label>
                  <AddressAutocomplete placeholder="Search address, city, or street in India..." value={depotAddressText} onSelect={handleSelectDepotAddress} />
                </div>
                <div className={`p-4 rounded-xl border space-y-2 ${depot ? isDark ? 'border-white bg-neutral-900/50' : 'border-black bg-neutral-50' : isDark ? 'border-neutral-800 opacity-60' : 'border-neutral-300 opacity-60'}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-amber-400 border border-black" />
                      Depot Terminal [D]
                    </span>
                    {(demoDepotNodeId || depot) && <span className="text-xs font-mono text-emerald-400">Locked</span>}
                  </div>
                  {demoDepotNodeId ? (
                    <div className="text-xs space-y-1 font-mono">
                      <div>Hub Node: #{demoDepotNodeId} ({nodeById(demoDepotNodeId)?.name})</div>
                      <div>District: {nodeById(demoDepotNodeId)?.district}</div>
                    </div>
                  ) : depot ? (
                    <div className="text-xs space-y-1 font-mono">
                      <div>Node ID: #{depot.node_id}</div>
                      <div>Latitude: {depot.lat.toFixed(5)}</div>
                      <div>Longitude: {depot.lon.toFixed(5)}</div>
                    </div>
                  ) : (
                    <p className="text-xs">Click any intersection node on the Meridian City map to drop the central depot terminal.</p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setMobileView('map')}
                  className="lg:hidden w-full py-2.5 px-4 rounded-xl border border-dashed text-xs text-center flex items-center justify-center gap-2 text-indigo-400 border-indigo-500/40 hover:bg-indigo-500/10 transition-colors font-medium"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>
                  <span>Open Map to Drop Depot Pin [D]</span>
                </button>
              </div>
              <div className="pt-6 border-t border-neutral-800/40 flex items-center justify-between gap-4 mt-6">
                <button onClick={() => setCurrentStep('fleet')} className={`px-4 py-2.5 rounded-full border text-sm transition-colors ${isDark ? 'border-neutral-700 hover:border-white' : 'border-neutral-300 hover:border-black'}`}>← Back to Fleet</button>
                <button disabled={!demoDepotNodeId && !depot} onClick={() => setCurrentStep('stops')} className={`px-6 py-2.5 rounded-full text-base font-medium transition-all ${!demoDepotNodeId && !depot ? 'opacity-40 cursor-not-allowed border border-neutral-700' : isDark ? 'bg-white text-black hover:bg-neutral-200 shadow-xl' : 'bg-black text-white hover:bg-neutral-800 shadow-xl'}`}>Confirm Depot & Add Stops →</button>
              </div>
            </div>
            <div className={`${mobileView === 'map' ? 'flex' : 'hidden'} lg:flex flex-1 h-full min-h-0 overflow-hidden relative`}>
              <DemoMap
                depotNodeId={effectiveDepotNodeId}
                stops={effectiveStops}
                interactionMode="place-depot"
                onNodeClick={handleMapNodeClick}
              />
              <button
                type="button"
                onClick={() => setMobileView('panel')}
                className="lg:hidden absolute bottom-3 right-3 z-30 px-3.5 py-2 rounded-full backdrop-blur-md border text-xs font-semibold shadow-xl flex items-center gap-1.5 bg-white text-black border-neutral-300 hover:bg-neutral-100 active:scale-95 transition-all"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                <span>Back to Setup</span>
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════ */}
        {/* STEP 3: STOPS PER VEHICLE                             */}
        {/* ══════════════════════════════════════════════════════ */}
        {currentStep === 'stops' && (
          <div className="flex-1 w-full flex flex-col lg:flex-row h-full min-h-0 overflow-hidden">
            <div className={`${mobileView === 'panel' ? 'flex' : 'hidden'} lg:flex w-full lg:w-[460px] h-full p-6 sm:p-8 flex-col justify-between border-r text-left overflow-y-auto sleek-scrollbar shrink-0 ${borderCls} ${bgCls}`}>
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-3xl font-semibold">Stops per Vehicle</h2>
                    <p className="text-base opacity-75 mt-1">Select a vehicle, set a weight change per stop, then click the map or search an address.</p>
                  </div>
                  {effectiveStopsCount > 0 && (
                    <button
                      onClick={handleClearAllStops}
                      className="text-xs text-red-400 hover:text-red-300 transition-colors border border-red-900/40 px-2.5 py-1 rounded-lg shrink-0 mt-1"
                    >
                      Clear All Stops
                    </button>
                  )}
                </div>

                {/* Vehicle Selector */}
                <div className="space-y-2">
                  <span className="text-xs uppercase tracking-wider opacity-60">Select Active Vehicle:</span>
                  <div className="flex flex-col gap-1.5">
                    {fleet.map((v, idx) => {
                      const isRunning = (v.status ?? 'running') === 'running';
                      const isSelected = activeStopVehicleIdx === idx;
                      const colour = VEHICLE_COLOURS[idx % VEHICLE_COLOURS.length];
                      const dColour = colour === '#000000' && isDark ? '#ffffff' : colour;
                      const summary = getVehicleWeightSummary(idx);
                      return (
                        <button key={idx} disabled={!isRunning} onClick={() => setActiveStopVehicleIdx(idx)}
                          className={`text-left px-3.5 py-2.5 rounded-xl border text-xs transition-all flex items-center justify-between ${!isRunning ? 'opacity-30 cursor-not-allowed ' + (isDark ? 'border-neutral-800' : 'border-neutral-200') : isSelected ? isDark ? 'border-white bg-neutral-900' : 'border-black bg-neutral-100' : isDark ? 'border-neutral-800 hover:border-neutral-600 hover:bg-neutral-900' : 'border-neutral-200 hover:border-neutral-400 hover:bg-neutral-100'}`}>
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: dColour }} />
                            <div>
                              <div className="font-semibold text-sm">{v.name}</div>
                              <div className="opacity-60 text-[10px]">{isRunning ? `${summary.stopsForVehicle.length} stops · ${summary.currentWeight} → ${summary.returnWeight} kg` : 'Dormant — excluded'}</div>
                            </div>
                          </div>
                          {summary.isOverloaded && <span className="text-red-400 text-[10px] font-bold">OVERLOADED</span>}
                          {isSelected && isRunning && <span className="text-[10px] opacity-60">Active</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Weight Delta & Stop Details */}
                {(() => {
                  const activeVeh = fleet[activeStopVehicleIdx];
                  const summary = getVehicleWeightSummary(activeStopVehicleIdx);
                  if (!activeVeh || (activeVeh.status ?? 'running') !== 'running') return null;
                  return (
                    <div className={`p-4 rounded-xl border space-y-3 ${isDark ? 'bg-[#0e0e0e] border-neutral-800' : 'bg-neutral-50 border-neutral-300'}`}>
                      <div className="text-sm font-semibold">{activeVeh.name} — Weight Tracking</div>
                      <div className="text-xs font-mono space-y-1 opacity-80">
                        <div className="flex justify-between"><span>Start load:</span><span>{summary.currentWeight} kg</span></div>
                        {summary.weightTrace.map((wt, i) => (
                          <div key={i} className={`flex justify-between ${wt.over ? 'text-red-400' : wt.under ? 'text-orange-400' : ''}`}>
                            <span>{wt.stopName}: +{wt.pickup} kg / -{wt.dropoff} kg</span>
                            <span>{wt.weight} kg {wt.over ? '(OVER MAX)' : wt.under ? '(CLAMPED → 0)' : ''}</span>
                          </div>
                        ))}
                        <div className="flex justify-between pt-1 border-t border-neutral-800/40 font-semibold">
                          <span>Return weight:</span>
                          <span className={summary.returnWeight > summary.maxWeight ? 'text-red-400' : 'text-emerald-400'}>{summary.returnWeight} / {summary.maxWeight} kg</span>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-xs opacity-70">Weight change at stop:</label>
                        <div className="flex items-center gap-2">
                          <input type="number" value={mapStopPickupWeight} onChange={(e) => setMapStopPickupWeight(e.target.value)} placeholder="Pickup (kg)" min="0" className={`w-full px-3 py-2 rounded-xl border text-sm outline-none font-semibold ${isDark ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-black'}`} />
                          <input type="number" value={mapStopDropoffWeight} onChange={(e) => setMapStopDropoffWeight(e.target.value)} placeholder="Dropoff (kg)" min="0" className={`w-full px-3 py-2 rounded-xl border text-sm outline-none font-semibold ${isDark ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-black'}`} />
                        </div>
                        {(() => {
                          const pw = parseFloat(mapStopPickupWeight) || 0;
                          const dw = parseFloat(mapStopDropoffWeight) || 0;
                          if (pw === 0 && dw === 0) return null;
                          const projected = summary.returnWeight - dw + pw;
                          const over = projected > summary.maxWeight;
                          const under = projected < 0;
                          return (
                            <p className={`text-[11px] ${over || under ? 'text-red-400' : 'text-emerald-400'}`}>
                              Next stop result: {Math.max(0, projected)} kg
                              {over ? ` — exceeds max (${summary.maxWeight} kg)` : under ? ' — would go negative (not allowed)' : ' — within limit'}
                            </p>
                          );
                        })()}
                      </div>
                    </div>
                  );
                })()}

                <div className="space-y-2">
                  <label className="block text-sm opacity-80">Add Stop by Address</label>
                  <AddressAutocomplete placeholder="Search address or street..." onSelect={handleSelectStopAddress} />
                  <p className="text-xs opacity-50">Or click on the map to drop a stop for the selected vehicle.</p>
                </div>

                <button
                  type="button"
                  onClick={() => setMobileView('map')}
                  className="lg:hidden w-full py-2.5 px-4 rounded-xl border border-dashed text-xs text-center flex items-center justify-center gap-2 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/10 transition-colors font-medium"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>
                  <span>Tap to Place Stops on Map</span>
                </button>

                {/* Stops list */}
                {(() => {
                  const summary = getVehicleWeightSummary(activeStopVehicleIdx);
                  if (summary.stopsForVehicle.length === 0) return <div className={`p-4 rounded-xl border text-center opacity-60 text-xs ${isDark ? 'border-neutral-800' : 'border-neutral-200'}`}>No stops added for this vehicle yet. Click anywhere on the map or an intersection to drop a stop.</div>;
                  return (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-xs uppercase tracking-wider opacity-60">{fleet[activeStopVehicleIdx]?.name} — {summary.stopsForVehicle.length} stop{summary.stopsForVehicle.length !== 1 ? 's' : ''}:</div>
                        <button onClick={() => handleClearVehicleStops(activeStopVehicleIdx)} className="text-[11px] text-red-400 hover:text-red-300 transition-colors">Clear all</button>
                      </div>
                      <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1 sleek-scrollbar">
                        {summary.stopsForVehicle.map((stop, i) => {
                          const pw = stop.pickup_weight || 0;
                          const dw = stop.dropoff_weight || 0;
                          return (
                            <div key={i} className={`p-2.5 rounded-xl border flex items-center justify-between text-xs ${isDark ? 'border-neutral-800 bg-neutral-900/40' : 'border-neutral-200 bg-neutral-50'}`}>
                              <div><div className="font-semibold">{stop.name}</div><div className="opacity-60 font-mono">+{pw} kg / -{dw} kg</div></div>
                              <button onClick={() => handleRemoveStop(stop.nodeId, activeStopVehicleIdx, i)} className="text-xs opacity-50 hover:opacity-100 hover:text-red-500 transition-colors px-1.5 py-0.5">Remove</button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
              <div className="pt-6 border-t border-neutral-800/40 flex items-center justify-between gap-4 mt-6">
                <button onClick={() => setCurrentStep('depot')} className={`px-4 py-2.5 rounded-full border text-sm transition-colors ${isDark ? 'border-neutral-700 hover:border-white' : 'border-neutral-300 hover:border-black'}`}>← Back to Depot</button>
                <button disabled={effectiveStopsCount === 0} onClick={() => setCurrentStep('focus')} className={`px-6 py-2.5 rounded-full text-base font-medium transition-all ${effectiveStopsCount === 0 ? 'opacity-40 cursor-not-allowed border border-neutral-700' : isDark ? 'bg-white text-black hover:bg-neutral-200 shadow-xl' : 'bg-black text-white hover:bg-neutral-800 shadow-xl'}`}>Confirm Stops & Set Focus →</button>
              </div>
            </div>
            <div className={`${mobileView === 'map' ? 'flex' : 'hidden'} lg:flex flex-1 h-full min-h-0 overflow-hidden relative`}>
              <DemoMap
                depotNodeId={effectiveDepotNodeId}
                stops={effectiveStops}
                pendingStopNodeId={pendingStopNode?.id}
                interactionMode="place-stop"
                onNodeClick={handleMapNodeClick}
              />
              <button
                type="button"
                onClick={() => setMobileView('panel')}
                className="lg:hidden absolute bottom-3 right-3 z-30 px-3.5 py-2 rounded-full backdrop-blur-md border text-xs font-semibold shadow-xl flex items-center gap-1.5 bg-white text-black border-neutral-300 hover:bg-neutral-100 active:scale-95 transition-all"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                <span>Back to Stops List</span>
              </button>

              {/* ── Confirm Stop with Weight On-Map Modal ── */}
              {pendingStopNode && (
                <div className="absolute inset-0 z-40 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
                  <div
                    className={`w-full max-w-md p-6 rounded-2xl border shadow-2xl space-y-5 animate-scaleUp ${
                      isDark ? 'bg-[#0f0f0f] border-amber-500/50 text-white' : 'bg-white border-amber-500 text-neutral-900'
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center font-bold text-[10px] text-amber-500">
                          STOP
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-wider font-mono text-amber-400 font-semibold">
                            Confirm Delivery Stop
                          </div>
                          <h3 className="text-lg font-bold">{pendingStopNode.name}</h3>
                          <p className="text-xs opacity-60">District: {pendingStopNode.district} · Node #{pendingStopNode.id}</p>
                        </div>
                      </div>
                      <button
                        onClick={handleCancelPendingStop}
                        className="text-lg opacity-50 hover:opacity-100 transition-opacity p-1"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Target Vehicle Selector */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold uppercase tracking-wider opacity-70">
                        Assign to Vehicle
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {fleet.map((veh, idx) => {
                          const isRunning = (veh.status ?? 'running') === 'running';
                          const isSelected = pendingVehicleIdx === idx;
                          const colour = VEHICLE_COLOURS[idx % VEHICLE_COLOURS.length];
                          return (
                            <button
                              key={idx}
                              type="button"
                              disabled={!isRunning}
                              onClick={() => setPendingVehicleIdx(idx)}
                              className={`p-2 rounded-xl border text-left text-xs transition-all flex items-center gap-2 ${
                                !isRunning
                                  ? 'opacity-30 cursor-not-allowed'
                                  : isSelected
                                  ? isDark
                                    ? 'border-amber-400 bg-amber-950/40 font-semibold'
                                    : 'border-amber-500 bg-amber-50 font-semibold'
                                  : isDark
                                  ? 'border-neutral-800 hover:border-neutral-600 bg-neutral-900/60'
                                  : 'border-neutral-200 hover:border-neutral-300 bg-neutral-50'
                              }`}
                            >
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colour }} />
                              <span className="truncate">{veh.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Weight Adjustment */}
                    <div className="space-y-3">
                      <label className="block text-xs font-semibold uppercase tracking-wider opacity-70">
                        Weight Change at Stop
                      </label>

                      {/* Dropoff / Pickup Buttons */}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setPendingOperationType('dropoff')}
                          className={`flex-1 py-2 rounded-xl border text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                            pendingOperationType === 'dropoff'
                              ? isDark
                                ? 'bg-red-950/60 border-red-500 text-red-300'
                                : 'bg-red-50 border-red-500 text-red-800'
                              : isDark
                              ? 'border-neutral-800 bg-neutral-900/40 opacity-60 hover:opacity-100'
                              : 'border-neutral-200 bg-neutral-50 opacity-60 hover:opacity-100'
                          }`}
                        >
                          <span>Drop-off</span>
                          <span className="font-mono text-[10px]">(-)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingOperationType('pickup')}
                          className={`flex-1 py-2 rounded-xl border text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                            pendingOperationType === 'pickup'
                              ? isDark
                                ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300'
                                : 'bg-emerald-50 border-emerald-500 text-emerald-800'
                              : isDark
                              ? 'border-neutral-800 bg-neutral-900/40 opacity-60 hover:opacity-100'
                              : 'border-neutral-200 bg-neutral-50 opacity-60 hover:opacity-100'
                          }`}
                        >
                          <span>Pickup</span>
                          <span className="font-mono text-[10px]">(+)</span>
                        </button>
                      </div>

                      {/* Weight Amount Input & Presets */}
                      <div className="flex items-center gap-3">
                        <div className="relative flex-1">
                          <input
                            type="number"
                            min="1"
                            value={pendingWeightAmount}
                            onChange={(e) => setPendingWeightAmount(e.target.value)}
                            placeholder="25"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleConfirmPendingStop();
                              if (e.key === 'Escape') handleCancelPendingStop();
                            }}
                            className={`w-full px-4 py-2.5 rounded-xl border text-lg font-mono font-bold outline-none ${
                              isDark
                                ? 'bg-neutral-900 border-neutral-700 text-white focus:border-amber-400'
                                : 'bg-neutral-50 border-neutral-300 text-black focus:border-amber-500'
                            }`}
                          />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold opacity-50">
                            kg
                          </span>
                        </div>

                        <div className="flex gap-1.5">
                          {[10, 20, 30, 50].map((amt) => (
                            <button
                              key={amt}
                              type="button"
                              onClick={() => setPendingWeightAmount(String(amt))}
                              className={`px-2.5 py-2 rounded-lg border text-xs font-mono transition-colors ${
                                pendingWeightAmount === String(amt)
                                  ? isDark
                                    ? 'border-amber-400 bg-amber-400/20 text-amber-300 font-bold'
                                    : 'border-amber-500 bg-amber-100 text-amber-900 font-bold'
                                  : isDark
                                  ? 'border-neutral-800 hover:border-neutral-600'
                                  : 'border-neutral-200 hover:border-neutral-400'
                              }`}
                            >
                              {amt}k
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Projected Load Impact Preview */}
                    {(() => {
                      const amt = parseFloat(pendingWeightAmount) || 0;
                      const delta = pendingOperationType === 'dropoff' ? -amt : amt;
                      const currentSummary = getVehicleWeightSummary(pendingVehicleIdx);
                      const targetVeh = fleet[pendingVehicleIdx];
                      const projectedReturn = currentSummary.returnWeight + delta;
                      const isOver = targetVeh?.capacity ? projectedReturn > targetVeh.capacity : false;
                      const isUnder = projectedReturn < 0;

                      return (
                        <div className={`p-3.5 rounded-xl border text-xs font-mono space-y-1.5 ${
                          isDark ? 'bg-black/40 border-neutral-800' : 'bg-neutral-50 border-neutral-200'
                        }`}>
                          <div className="flex justify-between opacity-70">
                            <span>Current return load:</span>
                            <span>{currentSummary.returnWeight} kg</span>
                          </div>
                          <div className="flex justify-between font-semibold">
                            <span>This stop adjustment:</span>
                            <span className={delta < 0 ? 'text-blue-400' : 'text-emerald-400'}>
                              {delta > 0 ? `+${delta}` : delta} kg
                            </span>
                          </div>
                          <div className="flex justify-between pt-1 border-t border-neutral-700/40 font-bold">
                            <span>Projected return load:</span>
                            <span className={isOver ? 'text-red-400' : isUnder ? 'text-orange-400' : 'text-emerald-400'}>
                              {Math.max(0, projectedReturn)} / {targetVeh?.capacity || 500} kg
                              {isOver && ' (EXCEEDS MAX)'}
                              {isUnder && ' (CLAMPED → 0)'}
                            </span>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Modal Actions */}
                    <div className="flex items-center justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={handleCancelPendingStop}
                        className={`px-4 py-2.5 rounded-xl border text-sm transition-colors ${
                          isDark ? 'border-neutral-700 hover:border-white' : 'border-neutral-300 hover:border-black'
                        }`}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmPendingStop}
                        disabled={!pendingWeightAmount || parseFloat(pendingWeightAmount) <= 0}
                        className={`px-6 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-lg ${
                          !pendingWeightAmount || parseFloat(pendingWeightAmount) <= 0
                            ? 'opacity-40 cursor-not-allowed border border-neutral-700'
                            : isDark
                            ? 'bg-amber-400 text-black hover:bg-amber-300 hover:scale-[1.02] active:scale-[0.98]'
                            : 'bg-amber-500 text-white hover:bg-amber-600 hover:scale-[1.02] active:scale-[0.98]'
                        }`}
                      >
                        Confirm & Add Stop →
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════ */}
        {/* STEP 4: OPERATIONAL FOCUS                             */}
        {/* ══════════════════════════════════════════════════════ */}
        {currentStep === 'focus' && (
          <div className="flex-1 w-full overflow-y-auto sleek-scrollbar">
            <div className="max-w-5xl w-full mx-auto px-6 md:px-12 py-10 space-y-10 text-left">
              <div className="space-y-2">
                <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight">Select Operational Focus</h1>
                <p className="text-lg opacity-75 max-w-2xl">Choose the objective trade-off priority for the route optimization algorithm.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {PREFERENCE_CARDS.map((card) => {
                  const isSelected = operationalFocus === card.id;
                  return (
                    <button key={card.id} onClick={() => setOperationalFocus(card.id)} className={`p-6 rounded-2xl border text-left transition-all flex flex-col justify-between ${isSelected ? isDark ? 'border-white bg-neutral-900 shadow-2xl scale-[1.02]' : 'border-black bg-neutral-100 shadow-2xl scale-[1.02]' : isDark ? 'border-neutral-800 bg-[#0a0a0a] hover:border-neutral-600' : 'border-neutral-200 bg-white hover:border-neutral-400'}`}>
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <span className={`text-xs px-2.5 py-0.5 rounded-full border font-mono ${isDark ? 'border-neutral-700 text-neutral-300' : 'border-neutral-300 text-neutral-700'}`}>{card.tag}</span>
                          {isSelected && <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${isDark ? 'border-white text-white' : 'border-black text-black'}`}>Selected</span>}
                        </div>
                        <h3 className="text-2xl font-semibold">{card.title}</h3>
                        <p className="text-sm font-medium opacity-80 mt-0.5">{card.subtitle}</p>
                        <p className="text-xs opacity-60 mt-3 leading-relaxed">{card.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className={`p-6 rounded-2xl border flex flex-wrap items-center justify-between gap-6 ${isDark ? 'bg-[#0a0a0a] border-neutral-800' : 'bg-white border-neutral-200'}`}>
                <div className="space-y-1">
                  <div className="text-sm opacity-70">Ready to execute optimization:</div>
                  <div className="text-xl font-semibold">{runningVehicleCount} Running Vehicle{runningVehicleCount !== 1 ? 's' : ''} · {effectiveStopsCount} Stop{effectiveStopsCount !== 1 ? 's' : ''} · {totalStopsDemand} kg Total Demand</div>
                </div>
                <div className="flex items-center gap-4">
                  <button onClick={() => setCurrentStep('stops')} className={`px-5 py-3 rounded-full border text-base transition-colors ${isDark ? 'border-neutral-700 hover:border-white' : 'border-neutral-300 hover:border-black'}`}>← Modify Stops</button>
                  <button onClick={handleRunOptimization} disabled={runningVehicleCount === 0 || effectiveStopsCount === 0} className={`px-10 py-3.5 rounded-full text-xl font-medium tracking-wide transition-all duration-300 shadow-2xl ${runningVehicleCount === 0 || effectiveStopsCount === 0 ? 'opacity-40 cursor-not-allowed border border-neutral-700' : isDark ? 'bg-white text-black hover:bg-neutral-200 hover:scale-105 active:scale-95' : 'bg-black text-white hover:bg-neutral-800 hover:scale-105 active:scale-95'}`}>Optimise Routes</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════ */}
        {/* STEP 5: DISPATCH PLAN                                 */}
        {/* ══════════════════════════════════════════════════════ */}
        {currentStep === 'plan' && (
          <div className="flex-1 w-full flex flex-col lg:flex-row h-full min-h-0 overflow-hidden">
            <div className={`${mobileView === 'panel' ? 'flex' : 'hidden'} lg:flex w-full lg:w-[460px] h-full p-6 sm:p-8 flex-col justify-between border-r text-left overflow-y-auto sleek-scrollbar shrink-0 ${borderCls} ${bgCls}`}>
              <div className="space-y-6">
                <div>
                  <h2 className="text-3xl font-semibold">Dispatch Plan</h2>
                  <p className="text-sm opacity-70">Optimized route solution · Click a route to highlight it</p>
                </div>

                <button
                  type="button"
                  onClick={() => setMobileView('map')}
                  className="lg:hidden w-full py-2.5 px-4 rounded-xl border border-dashed text-xs text-center flex items-center justify-center gap-2 text-indigo-400 border-indigo-500/40 hover:bg-indigo-500/10 transition-colors font-medium"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>
                  <span>View Route Layout on Interactive Map</span>
                </button>
                {/* Preference switcher */}
                <div className="flex flex-wrap items-center gap-2 pb-1 text-xs">
                  {PREFERENCE_CARDS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleSelectPreferenceInPlan(p.id)}
                      className={`px-3 py-1.5 rounded-full border transition-all ${
                        operationalFocus === p.id
                          ? isDark
                            ? 'bg-white text-black border-white font-semibold'
                            : 'bg-black text-white border-black font-semibold'
                          : isDark
                          ? 'border-neutral-800 text-neutral-400 hover:text-white'
                          : 'border-neutral-300 text-neutral-600 hover:text-black'
                      }`}
                    >
                      {p.title}
                    </button>
                  ))}
                </div>

                {/* Route cards */}
                <div className="space-y-3">
                  <div className="text-xs uppercase tracking-wider opacity-60">
                    Vehicle Itinerary ({displayVehicles.length} vehicles):
                  </div>
                  {displayVehicles.length === 0 ? (
                    <div className={`p-6 rounded-xl border text-center opacity-70 text-sm ${isDark ? 'border-neutral-800' : 'border-neutral-200'}`}>
                      No active routes available.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {displayVehicles.map((vItem) => {
                        const isSelected = activeVehicleId === vItem.vehicleId;
                        return (
                          <div
                            key={vItem.key}
                            onClick={() => setActiveVehicleId(isSelected ? null : vItem.vehicleId)}
                            className={`p-4 rounded-xl border cursor-pointer transition-all ${
                              isSelected
                                ? isDark
                                  ? 'border-white bg-neutral-900/90 shadow-xl'
                                  : 'border-black bg-neutral-100 shadow-xl'
                                : isDark
                                ? 'border-neutral-800 bg-[#0e0e0e] hover:border-neutral-700'
                                : 'border-neutral-200 bg-neutral-50 hover:border-neutral-300'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: vItem.colour }} />
                                <span className="font-semibold text-base">{vItem.name}</span>
                              </div>
                              <span className="text-xs font-mono opacity-80">
                                {vItem.stops.length} stop{vItem.stops.length !== 1 ? 's' : ''}
                              </span>
                            </div>
                            <div className="text-xs opacity-75 font-mono py-1.5 flex flex-wrap items-center gap-1.5">
                              <span className={`px-1.5 py-0.5 rounded border ${isDark ? 'bg-black/20 border-neutral-700' : 'bg-neutral-200 border-neutral-400'}`}>DEPOT</span>
                              {vItem.stops.map((stop, si) => (
                                <React.Fragment key={si}>
                                  <span>→</span>
                                  <span className={`px-1.5 py-0.5 rounded border ${isDark ? 'border-neutral-600' : 'border-neutral-400'}`}>{stop.name}</span>
                                </React.Fragment>
                              ))}
                              <span>→</span>
                              <span className={`px-1.5 py-0.5 rounded border ${isDark ? 'bg-black/20 border-neutral-700' : 'bg-neutral-200 border-neutral-400'}`}>DEPOT</span>
                            </div>
                            <div className={`mt-2 pt-2 border-t text-xs space-y-0.5 font-mono ${isDark ? 'border-neutral-800/40' : 'border-neutral-200'}`}>
                              <div className="flex justify-between opacity-70">
                                <span>Loaded at depot:</span>
                                <span>{vItem.startWeight} kg</span>
                              </div>
                              <div className="flex justify-between opacity-70">
                                <span>Dropped off:</span>
                                <span>-{vItem.totalDropped} kg</span>
                              </div>
                              {vItem.totalPickup > 0 && (
                                <div className="flex justify-between opacity-70">
                                  <span>Picked up:</span>
                                  <span>+{vItem.totalPickup} kg</span>
                                </div>
                              )}
                              <div className="flex justify-between font-semibold">
                                <span>Returns with:</span>
                                <span className={vItem.returnWeight > vItem.capacity ? 'text-red-400' : 'text-emerald-400'}>
                                  {vItem.returnWeight} / {vItem.capacity} kg
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Detailed Optimization Comparison Report */}
                <div className={`p-4 rounded-xl border space-y-4 text-xs ${isDark ? 'bg-[#0a0a0a] border-neutral-800' : 'bg-white border-neutral-200'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs uppercase font-bold tracking-wider text-primary-400">Optimization Report</div>
                      <div className="text-[11px] opacity-60">ET-MaO-QPSO multi-objective Pareto metrics</div>
                    </div>
                  </div>

                  {/* Strategy Tabs */}
                  <div className="flex flex-wrap gap-2">
                    {strategyComparison.map((strat: StrategyMetrics) => (
                      <button
                        key={strat.preference}
                        onClick={() => handleSelectPreferenceInPlan(strat.preference)}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors border flex-1 sm:flex-none text-center ${
                          strat.preference === operationalFocus
                            ? isDark ? 'bg-primary-600 border-primary-500 text-white' : 'bg-primary-600 border-primary-700 text-white'
                            : isDark ? 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-600' : 'bg-neutral-100 border-neutral-200 text-neutral-600 hover:text-black hover:border-neutral-400'
                        }`}
                      >
                        {strat.title}
                      </button>
                    ))}
                  </div>

                  {/* Focused Metric Cards for Active Strategy */}
                  {(() => {
                    const activeStrat = strategyComparison.find((s: StrategyMetrics) => s.preference === operationalFocus) || strategyComparison[0];
                    const baselineStrat = strategyComparison.find((s: StrategyMetrics) => s.preference === 'balanced') || activeStrat;
                    
                    const timeDiff = activeStrat.totalTimeMinutes - baselineStrat.totalTimeMinutes;
                    const distDiff = activeStrat.totalDistanceKm - baselineStrat.totalDistanceKm;
                    const congDiff = activeStrat.congestionScore - baselineStrat.congestionScore;
                    const stabDiff = activeStrat.stabilityScore - baselineStrat.stabilityScore;
                    
                    return (
                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <div className={`p-3 rounded-lg border ${isDark ? 'bg-[#111] border-neutral-800' : 'bg-neutral-50 border-neutral-200'}`}>
                          <div className="text-[10px] uppercase font-bold opacity-50 mb-1">Total Time</div>
                          <div className="text-xl font-mono font-bold">{activeStrat.totalTimeMinutes}m</div>
                          <div className={`text-[10px] font-mono mt-1 ${timeDiff < 0 ? 'text-emerald-400' : timeDiff > 0 ? 'text-rose-400' : 'text-neutral-500'}`}>
                            {timeDiff < 0 ? `Saves ${Math.abs(timeDiff)}m` : timeDiff > 0 ? `+${timeDiff}m` : 'Baseline'} vs Balanced
                          </div>
                        </div>

                        <div className={`p-3 rounded-lg border ${isDark ? 'bg-[#111] border-neutral-800' : 'bg-neutral-50 border-neutral-200'}`}>
                          <div className="text-[10px] uppercase font-bold opacity-50 mb-1">Distance</div>
                          <div className="text-xl font-mono font-bold">{activeStrat.totalDistanceKm}k</div>
                          <div className={`text-[10px] font-mono mt-1 ${distDiff < 0 ? 'text-emerald-400' : distDiff > 0 ? 'text-rose-400' : 'text-neutral-500'}`}>
                            {distDiff < 0 ? `Saves ${Math.abs(distDiff).toFixed(1)}k` : distDiff > 0 ? `+${distDiff.toFixed(1)}k` : 'Baseline'} vs Balanced
                          </div>
                        </div>

                        <div className={`p-3 rounded-lg border ${isDark ? 'bg-[#111] border-neutral-800' : 'bg-neutral-50 border-neutral-200'}`}>
                          <div className="text-[10px] uppercase font-bold opacity-50 mb-1">Congestion</div>
                          <div className="text-xl font-mono font-bold">{activeStrat.congestionScore}%</div>
                          <div className={`text-[10px] font-mono mt-1 ${congDiff < 0 ? 'text-emerald-400' : congDiff > 0 ? 'text-rose-400' : 'text-neutral-500'}`}>
                            {congDiff < 0 ? `${Math.abs(congDiff)}% less` : congDiff > 0 ? `+${congDiff}% more` : 'Baseline'} exposure
                          </div>
                        </div>

                        <div className={`p-3 rounded-lg border ${isDark ? 'bg-[#111] border-neutral-800' : 'bg-neutral-50 border-neutral-200'}`}>
                          <div className="text-[10px] uppercase font-bold opacity-50 mb-1">Stability</div>
                          <div className="text-xl font-mono font-bold">{activeStrat.stabilityScore}%</div>
                          <div className={`text-[10px] font-mono mt-1 ${stabDiff > 0 ? 'text-emerald-400' : stabDiff < 0 ? 'text-rose-400' : 'text-neutral-500'}`}>
                            {stabDiff > 0 ? `+${stabDiff}% more` : stabDiff < 0 ? `${Math.abs(stabDiff)}% less` : 'Baseline'} stable
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="text-[10px] pt-1 opacity-50 flex items-center justify-between">
                    <span>* Savings calculated relative to BALANCED strategy</span>
                    <a href="/dashboard" className="text-primary-400 hover:underline">Full Analytics →</a>
                  </div>
                </div>

                {/* Enter Simulation CTA */}
                {(routes.length > 0 || demoRoutes.length > 0) && (
                  <div className={`p-5 rounded-2xl border space-y-3 ${isDark ? 'bg-red-950/20 border-red-900/50' : 'bg-red-50 border-red-200'}`}>
                    <div>
                      <div className="text-xs uppercase tracking-wider font-bold text-red-400 mb-1">Simulation Ready</div>
                      <p className="text-sm opacity-80">Routes optimized. Enter Simulation Mode to inject real-world incidents and observe dynamic A* rerouting.</p>
                    </div>
                    <button
                      onClick={() => { handleResetSimulation(); setCurrentStep('simulate'); }}
                      className={`w-full py-3 rounded-xl font-semibold text-base transition-all shadow-md ${
                        isDark
                          ? 'bg-primary-600 hover:bg-primary-700 text-white active:bg-primary-800'
                          : 'bg-neutral-900 hover:bg-neutral-800 text-white active:bg-black'
                      }`}
                    >
                      Enter Simulation Mode →
                    </button>
                  </div>
                )}
              </div>
              <div className="pt-6 border-t border-neutral-800/40 mt-6 flex items-center justify-between">
                <button onClick={() => setCurrentStep('fleet')} className={`px-5 py-2.5 rounded-full border text-sm transition-colors ${isDark ? 'border-neutral-700 hover:border-white' : 'border-neutral-300 hover:border-black'}`}>← Edit Fleet & Stops</button>
                <button onClick={() => window.print()} className={`px-4 py-2 rounded-full border text-xs transition-colors ${isDark ? 'border-neutral-700 hover:border-white' : 'border-neutral-300 hover:border-black'}`}>Print Route Plan</button>
              </div>
            </div>
            <div className={`${mobileView === 'map' ? 'flex' : 'hidden'} lg:flex flex-1 h-full min-h-0 overflow-hidden relative`}>
              <DemoMap
                depotNodeId={effectiveDepotNodeId}
                stops={effectiveStops}
                routes={effectiveRoutes}
                activeVehicleId={activeVehicleId}
              />
              <button
                type="button"
                onClick={() => setMobileView('panel')}
                className="lg:hidden absolute bottom-3 right-3 z-30 px-3.5 py-2 rounded-full backdrop-blur-md border text-xs font-semibold shadow-xl flex items-center gap-1.5 bg-white text-black border-neutral-300 hover:bg-neutral-100 active:scale-95 transition-all"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                <span>Back to Route Plan</span>
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════ */}
        {/* STEP 6: SIMULATION                                    */}
        {/* ══════════════════════════════════════════════════════ */}
        {currentStep === 'simulate' && (
          <div className="flex-1 w-full flex flex-col lg:flex-row h-full min-h-0 overflow-hidden">

            {/* ── Left Simulation Sidebar ── */}
            <div className={`${mobileView === 'panel' ? 'flex' : 'hidden'} lg:flex w-full lg:w-[480px] h-full border-r flex-col shrink-0 overflow-y-auto sleek-scrollbar text-left ${borderCls} ${bgCls}`}>
              <div className="p-6 space-y-5 flex-1">

                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                      <span className="text-xs uppercase tracking-wider font-bold text-red-400">Live Simulation</span>
                    </div>
                    <h2 className="text-2xl font-semibold">Incident Simulation</h2>
                    <p className="text-sm opacity-70 mt-0.5">Inject disruptions to observe dynamic rerouting response.</p>
                  </div>
                  <div className={`text-right text-xs font-mono ${isDark ? 'text-neutral-400' : 'text-neutral-600'}`}>
                    <div className="font-semibold text-base">{incidentLog.length}</div>
                    <div className="opacity-60">events</div>
                    <div className="font-semibold text-base mt-1">{rerouteCount}</div>
                    <div className="opacity-60">reroutes</div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setMobileView('map')}
                  className="lg:hidden w-full py-2.5 px-4 rounded-xl border border-dashed text-xs text-center flex items-center justify-center gap-2 text-red-400 border-red-500/40 hover:bg-red-500/10 transition-colors font-medium"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>
                  <span>View Simulation on Live Map</span>
                </button>

                {/* Revert All Changes Button */}
                {(activeIncidents.length > 0 || rerouteCount > 0) && (
                  <button
                    onClick={handleRevertAllRouteChanges}
                    className={`w-full py-2.5 rounded-xl border text-xs font-semibold transition-colors flex items-center justify-center gap-2 ${
                      isDark 
                        ? 'border-red-900/50 bg-red-950/30 text-red-400 hover:bg-red-900/50' 
                        : 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100'
                    }`}
                  >
                    <span className="font-mono text-sm">↺</span>
                    <span>Revert All Route Changes on Map</span>
                  </button>
                )}

                {/* Before/After comparison banner */}
                {(previousRoutes.length > 0 || demoPreviousRoutes.length > 0) && (
                  <div className={`p-4 rounded-xl border space-y-3 ${isDark ? 'bg-emerald-950/20 border-emerald-800/50' : 'bg-emerald-50 border-emerald-200'}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Route Updated</span>
                      <button
                        onClick={() => {
                          setPreviousRoutes([]);
                          setDemoPreviousRoutes([]);
                        }}
                        className="text-xs opacity-50 hover:opacity-100 transition-opacity"
                      >
                        Clear
                      </button>
                    </div>
                    <p className="text-xs opacity-80">Before/after visualization active on the map.</p>
                    <div className="flex items-center gap-4 text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="w-5 h-[3px] shrink-0" style={{ background: 'repeating-linear-gradient(90deg,#a855f7 0,#a855f7 5px,transparent 5px,transparent 9px)' }} />
                        <span className="opacity-70">Original path</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-5 h-[3px] rounded bg-indigo-500 shrink-0" />
                        <span className="opacity-70">Rerouted path</span>
                      </div>
                    </div>
                    <div className="text-xs font-mono text-emerald-400">
                      Reroutes applied: {rerouteCount} · Time saved est. {rerouteCount * 13}m
                    </div>
                  </div>
                )}

                {/* Dynamic Detour Banner */}
                {alternativeRoutes.length > 0 && (
                  <div className={`p-4 rounded-xl border space-y-2.5 animate-slide-in ${isDark ? 'bg-emerald-950/25 border-emerald-500/50' : 'bg-emerald-50 border-emerald-300'}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                        A* Dynamic Detours ({alternativeRoutes.length} Corridors)
                      </span>
                      <span className="text-xs font-mono font-bold text-emerald-400">
                        +{alternativeRoutes.reduce((a, b) => a + b.timeSaved, 0)}m saved
                      </span>
                    </div>
                    <p className="text-xs opacity-80 leading-relaxed">
                      Bypasses disruptions across {activeIncidents.length} active corridor{activeIncidents.length > 1 ? 's' : ''} via optimal A* Meridian City bypasses (+{alternativeRoutes.reduce((a, b) => a + b.extraDistance, 0).toFixed(1)} km detour).
                    </p>
                    <button
                      onClick={handleApplyAllAlternatives}
                      className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-semibold text-xs transition-colors shadow-md shadow-emerald-950/40"
                    >
                      Apply All Detour Reroutes ({alternativeRoutes.length}) →
                    </button>
                  </div>
                )}

                {/* ── Active Disruptions Roster ── */}
                {activeIncidents.length > 0 && (
                  <div className={`p-4 rounded-xl border space-y-2.5 ${isDark ? 'bg-red-950/20 border-red-800/40' : 'bg-red-50 border-red-200'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                        <span className="text-xs uppercase font-bold tracking-wider text-red-400">
                          Active Disruptions ({activeIncidents.length})
                        </span>
                      </div>
                      <button
                        onClick={handleRevertAllRouteChanges}
                        className="text-xs text-red-400 hover:text-red-300 underline font-medium"
                      >
                        Revert & Clear All
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      {activeIncidents.map((inc) => {
                        const road = getRoadById(inc.roadId);
                        return (
                          <div
                            key={inc.id}
                            className={`flex items-center justify-between p-2 rounded-lg text-xs font-mono border ${
                              isDark ? 'bg-[#0f111a] border-neutral-800 text-neutral-200' : 'bg-white border-neutral-200 text-neutral-800'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-red-400 font-bold text-[10px] px-1 py-0.5 rounded bg-red-950/60 border border-red-800/60">ALERT</span>
                              <span>{road?.name || inc.roadId}</span>
                              <span className="text-[10px] opacity-60 uppercase">({inc.type.replace('_', ' ')})</span>
                            </div>
                            <button
                              onClick={() => handleRemoveIncident(inc.roadId)}
                              className="text-xs opacity-50 hover:opacity-100 text-neutral-400 hover:text-white px-1 font-bold"
                              title="Resolve incident"
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Incident Injection Panel */}
                <div className={`p-5 rounded-2xl border space-y-4 ${isDark ? 'bg-[#0a0a0a] border-neutral-800' : 'bg-white border-neutral-200'}`}>
                  <div className="text-sm font-semibold uppercase tracking-wider opacity-70">Inject Incident</div>

                  {/* Event Type Grid */}
                  <div className="space-y-2">
                    <label className="text-xs opacity-60 block">Event Type</label>
                    <div className="grid grid-cols-2 gap-2">
                      {INCIDENT_TYPES.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => setEventType(item.id)}
                          className={`py-2.5 px-3 rounded-xl border text-xs font-medium text-left transition-all flex items-center gap-2 ${
                            eventType === item.id
                              ? isDark
                                ? 'bg-white text-black border-white'
                                : 'bg-black text-white border-black'
                              : isDark
                              ? 'border-neutral-800 hover:border-neutral-600'
                              : 'border-neutral-200 hover:border-neutral-400'
                          }`}
                        >
                          <span className="font-mono text-[10px] opacity-70">{item.icon}</span>
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Incident Location (WHERE) Selector */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs opacity-60 block">Corridor Location (Where)</label>
                      <button
                        type="button"
                        onClick={() => setIsSelectingLocationOnMap((v) => !v)}
                        className={`text-[11px] px-2.5 py-1 rounded-lg border font-medium transition-colors flex items-center gap-1.5 ${
                          isSelectingLocationOnMap
                            ? 'bg-amber-500 text-black border-amber-500 font-semibold'
                            : isDark
                            ? 'border-neutral-700 hover:border-white text-neutral-300'
                            : 'border-neutral-300 hover:border-black text-neutral-700'
                        }`}
                      >
                        <span>{isSelectingLocationOnMap ? 'Click Road on Map...' : 'Pick on Map'}</span>
                      </button>
                    </div>

                    {/* Categorized road dropdown */}
                    <select
                      value={selectedIncidentRoadId}
                      onChange={(e) => {
                        setSelectedIncidentRoadId(e.target.value);
                        setIsSelectingLocationOnMap(false);
                      }}
                      className={ic('font-sans text-xs py-2')}
                    >
                      <optgroup label="── Downtown Core ──">
                        {DEMO_ROADS.filter((r) => ['a03', 'a04', 'a05', 'a11', 'a12', 'a13', 'a29', 'a30', 'c05', 'c06', 'c07'].includes(r.id)).map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name} ({r.type.toUpperCase()})
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="── University Quarter ──">
                        {DEMO_ROADS.filter((r) => ['a06', 'a07', 'a08', 'a39', 'a40', 'a41', 'c08', 'c09'].includes(r.id)).map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name} ({r.type.toUpperCase()})
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="── Industrial Zone ──">
                        {DEMO_ROADS.filter((r) => ['a09', 'a10', 'a16', 'c02', 'c03', 'c04', 'c14'].includes(r.id)).map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name} ({r.type.toUpperCase()})
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="── Harbour & Marina ──">
                        {DEMO_ROADS.filter((r) => ['a18', 'a19', 'a20', 'a21', 'a22', 'a23', 'a42', 'a43', 'c11', 'c12', 'c13'].includes(r.id)).map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name} ({r.type.toUpperCase()})
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="── Ring Road (Highways) ──">
                        {DEMO_ROADS.filter((r) => r.type === 'highway').map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name} [Seg {r.id}]
                          </option>
                        ))}
                      </optgroup>
                    </select>

                    {/* Quick corridor selector chips */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {[
                        { id: 'a04', name: 'King St' },
                        { id: 'a12', name: 'Central Blvd' },
                        { id: 'a30', name: 'Main St' },
                        { id: 'a17', name: 'Heritage Rd' },
                        { id: 'h01', name: 'North Bypass' },
                      ].map((chip) => (
                        <button
                          key={chip.id}
                          type="button"
                          onClick={() => {
                            setSelectedIncidentRoadId(chip.id);
                            setIsSelectingLocationOnMap(false);
                          }}
                          className={`text-[11px] px-2 py-0.5 rounded-md border transition-all ${
                            selectedIncidentRoadId === chip.id
                              ? isDark
                                ? 'bg-white text-black border-white font-semibold'
                                : 'bg-black text-white border-black font-semibold'
                              : isDark
                              ? 'border-neutral-800 text-neutral-400 hover:border-neutral-600'
                              : 'border-neutral-200 text-neutral-600 hover:border-neutral-400'
                          }`}
                        >
                          {chip.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Severity */}
                  <div className="space-y-2">
                    <label className="text-xs opacity-60 block">Severity Level</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['Low', 'Medium', 'High'] as const).map((sev) => (
                        <button
                          key={sev}
                          onClick={() => setEventSeverity(sev)}
                          className={`py-2 rounded-xl border text-xs font-medium text-center transition-all ${
                            eventSeverity === sev
                              ? sev === 'High'
                                ? 'bg-red-600 text-white border-red-600'
                                : sev === 'Medium'
                                ? 'bg-amber-500 text-white border-amber-500'
                                : 'bg-emerald-600 text-white border-emerald-600'
                              : isDark
                              ? 'border-neutral-800 hover:border-neutral-600'
                              : 'border-neutral-200 hover:border-neutral-400'
                          }`}
                        >
                          {sev}
                        </button>
                      ))}
                    </div>
                    <div className="text-[11px] opacity-50 font-mono">
                      Expected delay: +{eventSeverity === 'High' ? '22' : eventSeverity === 'Medium' ? '12' : '6'}m · Congestion: +{eventSeverity === 'High' ? '55' : eventSeverity === 'Medium' ? '30' : '15'}%
                    </div>
                  </div>

                  {/* Solid Theme-Synchronous Inject Button */}
                  <button
                    onClick={handleInjectIncident}
                    disabled={isInjectingIncident}
                    className={`w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all shadow-md ${
                      isInjectingIncident
                        ? 'opacity-40 cursor-not-allowed border border-neutral-700'
                        : eventType === 'recovery'
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white active:bg-emerald-700'
                        : isDark
                        ? 'bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white'
                        : 'bg-neutral-900 hover:bg-neutral-800 active:bg-black text-white'
                    }`}
                  >
                    {isInjectingIncident ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-3.5 h-3.5 rounded-full border-2 border-t-transparent border-white animate-spin" />
                        Analyzing Impact...
                      </span>
                    ) : (
                      `Inject ${INCIDENT_TYPES.find((t) => t.id === eventType)?.label ?? 'Incident'} on ${
                        getRoadById(selectedIncidentRoadId)?.name ?? 'Selected Road'
                      }`
                    )}
                  </button>
                </div>

                {/* Event-triggered Architecture Loop */}
                <div className={`p-4 rounded-xl border space-y-2 text-xs ${isDark ? 'bg-neutral-900/40 border-neutral-800' : 'bg-neutral-50 border-neutral-200'}`}>
                  <div className="font-semibold uppercase tracking-wider opacity-70">Event-Triggered Architecture</div>
                  <div className="space-y-1.5 opacity-80 font-mono">
                    {[
                      '1. Baseline Pareto optimal route dispatch',
                      '2. Road speed reduction / incident trigger',
                      '3. Disruption threshold test: I = α·ΔT + β·ΔC + γ·Er',
                      '4. A* bypass recalculation or route maintain',
                    ].map((line, i) => (
                      <div key={i} className={i % 2 !== 0 ? 'opacity-40 text-[10px] pl-2' : ''}>{line}</div>
                    ))}
                  </div>
                </div>

                {/* Incident Log */}
                {incidentLog.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs uppercase tracking-wider opacity-60">Incident Feed ({incidentLog.length} events)</div>
                    <div className="space-y-2 max-h-72 overflow-y-auto sleek-scrollbar pr-1">
                      {incidentLog.map((entry) => {
                        const typeLabel = INCIDENT_TYPES.find((t) => t.id === entry.type)?.label ?? entry.type;
                        return (
                          <div
                            key={entry.id}
                            className={`p-3.5 rounded-xl border space-y-2 transition-all ${
                              entry.rerouted
                                ? isDark
                                  ? 'border-emerald-800/50 bg-emerald-950/20'
                                  : 'border-emerald-300 bg-emerald-50'
                                : entry.significant
                                ? isDark
                                  ? 'border-red-800/50 bg-red-950/20'
                                  : 'border-red-200 bg-red-50'
                                : isDark
                                ? 'border-neutral-800 bg-[#0e0e0e]'
                                : 'border-neutral-200 bg-neutral-50'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-bold ${severityColor(entry.severity)}`}>{entry.severity.toUpperCase()}</span>
                                <span className="text-xs font-semibold">{typeLabel}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                {entry.rerouted && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full border border-emerald-600 bg-emerald-950/30 text-emerald-400 font-semibold">Rerouted</span>
                                )}
                                {!entry.rerouted && entry.significant && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full border border-red-600 bg-red-950/30 text-red-400 font-semibold animate-pulse">Needs Reroute</span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-4 text-[11px] font-mono opacity-80">
                              <span>+{entry.deltaTime}m delay</span>
                              <span>+{entry.deltaCongestion}% cong.</span>
                              {entry.impactScore > 0 && <span>I={entry.impactScore.toFixed(3)}</span>}
                            </div>
                            <div className="text-[10px] opacity-40">{formatTime(entry.timestamp)}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Sidebar footer */}
              <div className={`p-5 border-t flex items-center justify-between gap-3 shrink-0 ${isDark ? 'border-neutral-800' : 'border-neutral-200'}`}>
                <button onClick={() => setCurrentStep('plan')} className={`px-4 py-2.5 rounded-full border text-sm transition-colors ${isDark ? 'border-neutral-700 hover:border-white' : 'border-neutral-300 hover:border-black'}`}>← Back to Plan</button>
                <button
                  onClick={handleResetSimulation}
                  className={`px-4 py-2.5 rounded-full border text-sm transition-colors ${isDark ? 'border-neutral-700 hover:border-red-500 hover:text-red-400' : 'border-neutral-300 hover:border-red-400 hover:text-red-500'}`}
                >
                  Reset Simulation
                </button>
              </div>
            </div>

            {/* ── Right: Meridian City SVG Map ── */}
            <div className={`${mobileView === 'map' ? 'flex' : 'hidden'} lg:flex flex-1 h-full min-h-0 overflow-hidden relative`}>
              <DemoMap
                depotNodeId={effectiveDepotNodeId}
                stops={effectiveStops}
                routes={effectiveRoutes}
                previousRoutes={demoPreviousRoutes}
                activeVehicleId={activeVehicleId}
                activeIncidents={activeIncidents}
                alternativeRoutes={alternativeRoutes}
                interactionMode={isSelectingLocationOnMap ? 'select-incident-road' : 'view'}
                selectedRoadId={selectedIncidentRoadId}
                onRoadClick={(road) => {
                  setSelectedIncidentRoadId(road.id);
                  setIsSelectingLocationOnMap(false);
                }}
                onApplyAlternative={handleApplyAllAlternatives}
                onCancelMode={() => setIsSelectingLocationOnMap(false)}
              />
              <button
                type="button"
                onClick={() => setMobileView('panel')}
                className="lg:hidden absolute bottom-3 right-3 z-30 px-3.5 py-2 rounded-full backdrop-blur-md border text-xs font-semibold shadow-xl flex items-center gap-1.5 bg-white text-black border-neutral-300 hover:bg-neutral-100 active:scale-95 transition-all"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                <span>Back to Incident Controls</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Loading Overlay ── */}
      {isOptimizing && (
        <div className="fixed inset-0 z-[99999] flex flex-col items-center justify-center backdrop-blur-xl bg-black/60 gap-6 font-garamond">
          <div className={`w-16 h-16 rounded-full border-4 border-t-transparent animate-spin ${isDark ? 'border-white' : 'border-black'}`} />
          <p className={`text-2xl font-normal tracking-wide ${isDark ? 'text-white' : 'text-black'}`}>Optimising Dispatch Routes</p>
          <p className="text-sm opacity-50">Building Pareto-optimal front...</p>
        </div>
      )}

      {/* ── Preset Loading Overlay ── */}
      {isLoadingPreset && (
        <div className="fixed inset-0 z-[99999] flex flex-col items-center justify-center backdrop-blur-xl bg-black/60 gap-6 font-garamond">
          <div className="w-16 h-16 rounded-full border-4 border-t-transparent animate-spin border-red-500" />
          <p className="text-2xl font-normal tracking-wide text-white">Loading Preset Scenario</p>
          <p className="text-sm opacity-50 text-white">
            {DEMO_PRESETS.find((p) => p.id === selectedPresetId)?.title ?? ''} — optimizing routes...
          </p>
        </div>
      )}

      {/* ── Reroute Decision Dialog ── */}
      {showRerouteDialog && latestImpact && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 font-garamond">
          <div className={`max-w-lg w-full p-8 rounded-2xl border shadow-2xl space-y-6 ${isDark ? 'bg-[#0a0a0a] border-neutral-700 text-white' : 'bg-white border-neutral-300 text-black'}`}>
            <div>
              <span className="text-xs uppercase tracking-wider text-red-400 font-bold">Traffic Event Detected</span>
              <h3 className="text-2xl font-semibold mt-1">Reroute Decision Analyzer</h3>
              <p className="text-sm opacity-70 mt-1">
                A traffic incident has increased corridor delay by +{latestImpact.delta_time.toFixed(1)} mins.
              </p>
            </div>
            <div className={`p-4 rounded-xl border text-xs space-y-2 ${isDark ? 'border-neutral-800 bg-neutral-900/40' : 'border-neutral-200 bg-neutral-50'}`}>
              <div className="flex justify-between opacity-70">
                <span>Impact Score (I):</span>
                <strong className="text-amber-400">{latestImpact.impact_score.toFixed(3)} (threshold: {latestImpact.threshold})</strong>
              </div>
              <div className="flex justify-between opacity-70">
                <span>Route Exposure:</span>
                <strong>{(latestImpact.route_exposure * 100).toFixed(1)}%</strong>
              </div>
              <div className="flex justify-between opacity-70">
                <span>Affected Vehicles:</span>
                <strong>{latestImpact.affected_vehicle_ids.length}</strong>
              </div>
            </div>
            {alternativeRoutePreview && (
              <div className={`p-4 rounded-xl border text-xs space-y-2 ${isDark ? 'border-neutral-800 bg-neutral-900/40' : 'border-neutral-200 bg-neutral-50'}`}>
                <div className="font-semibold opacity-70 uppercase tracking-wider mb-1">Route Comparison</div>
                <div className="flex justify-between">
                  <span>Current Delay Path:</span>
                  <strong>{alternativeRoutePreview.currentDuration.toFixed(1)} mins</strong>
                </div>
                <div className="flex justify-between text-emerald-400">
                  <span>A* Bypass Alternative:</span>
                  <strong>{alternativeRoutePreview.newDuration.toFixed(1)} mins (−{Math.abs(alternativeRoutePreview.diffMinutes).toFixed(1)}m saved)</strong>
                </div>
                <div className="flex justify-between opacity-60">
                  <span>Extra distance:</span>
                  <span>+{alternativeRoutePreview.extraDistanceKm.toFixed(1)} km</span>
                </div>
              </div>
            )}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-800">
              <button onClick={dismissReroute} className={`px-5 py-2.5 rounded-full border text-sm ${isDark ? 'border-neutral-700 hover:border-white' : 'border-neutral-300 hover:border-black'}`}>Keep Current Route</button>
              <button
                onClick={handleConfirmReroute}
                className={`px-6 py-2.5 rounded-full text-sm font-semibold transition-all bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg`}
              >
                Apply A* Reroute →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DemoPage;
