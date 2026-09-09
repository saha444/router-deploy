import React, { useState, useRef, useMemo, useCallback } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { VEHICLE_COLOURS } from '../../components/MapView';
import {
  DEMO_NODES,
  DEMO_ROADS,
  DEMO_DISTRICTS,
  DEMO_PARKS,
  RIVER_PATH,
  ROAD_STYLES,
  getRoadById,
  getRoadMidpoint,
  type DemoNode,
  type DemoRoad,
  type ActiveIncident,
} from './demoMapData';

export interface DemoMapProps {
  /** Selected depot node ID */
  depotNodeId?: number | null;
  /** Active stops placed on map */
  stops?: Array<{
    nodeId: number;
    stopNumber?: number;
    vehicleIdx?: number;
    name?: string;
    demand?: number;
  }>;
  /** Active vehicle routes */
  routes?: Array<{
    vehicleIdx: number;
    vehicleName: string;
    path: number[];
    stops?: number[];
  }>;
  /** Optional previous routes for before/after comparison */
  previousRoutes?: Array<{
    vehicleIdx: number;
    vehicleName: string;
    path: number[];
  }>;
  /** Currently highlighted vehicle index */
  activeVehicleId?: number | null;
  /** Single active incident info (legacy/backward compatibility) */
  activeIncident?: ActiveIncident | null;
  /** Multiple active incidents */
  activeIncidents?: ActiveIncident[];
  /** Single alternative route suggestion */
  alternativeRoute?: {
    vehicleIdx: number;
    blockedRoadIds: string[];
    originalPath: number[];
    reroutedPath: number[];
    timeSaved: number;
    extraDistance: number;
  } | null;
  /** Multiple alternative route suggestions */
  alternativeRoutes?: Array<{
    vehicleIdx: number;
    vehicleName: string;
    blockedRoadIds: string[];
    originalPath: number[];
    reroutedPath: number[];
    timeSaved: number;
    extraDistance: number;
  }>;
  /** Interaction mode */
  interactionMode?: 'view' | 'place-depot' | 'place-stop' | 'select-incident-road';
  /** Currently selected road (e.g., target for incident) */
  selectedRoadId?: string | null;
  /** Callback when user clicks a node */
  onNodeClick?: (node: DemoNode) => void;
  /** Callback when user clicks a road segment */
  onRoadClick?: (road: DemoRoad) => void;
  /** Callback to accept alternative route */
  onApplyAlternative?: () => void;
  /** Callback to clear or cancel current selection mode */
  onCancelMode?: () => void;
  /** Extra container styles */
  className?: string;
  /** Currently highlighted node awaiting confirmation */
  pendingStopNodeId?: number | null;
}

export const DemoMap: React.FC<DemoMapProps> = ({
  depotNodeId,
  stops = [],
  routes = [],
  previousRoutes = [],
  activeVehicleId = null,
  activeIncident = null,
  activeIncidents = [],
  alternativeRoute = null,
  alternativeRoutes = [],
  interactionMode = 'view',
  selectedRoadId = null,
  onNodeClick,
  onRoadClick,
  onApplyAlternative,
  onCancelMode,
  className = '',
  pendingStopNodeId = null,
}) => {
  const { isDark } = useTheme();

  // Pan and zoom state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });

  // Layer toggles
  const [showDistricts, setShowDistricts] = useState(true);
  const [showRoadLabels, setShowRoadLabels] = useState(true);
  const [showLegend, setShowLegend] = useState(true);

  // Hover state
  const [hoveredRoad, setHoveredRoad] = useState<DemoRoad | null>(null);
  const [hoveredNode, setHoveredNode] = useState<DemoNode | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Pan & drag tracking
  const isDraggingRef = useRef(false);
  const dragStartPosRef = useRef({ x: 0, y: 0 });

  // Zoom helpers
  const handleZoomIn = () => setZoom((z) => Math.min(2.4, +(z + 0.25).toFixed(2)));
  const handleZoomOut = () => setZoom((z) => Math.max(0.65, +(z - 0.25).toFixed(2)));
  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = false;
    dragStartPosRef.current = { x: e.clientX, y: e.clientY };
    // Pan on background drag
    if ((e.target as HTMLElement).tagName === 'svg' || (e.target as HTMLElement).id === 'map-background') {
      setIsPanning(true);
      setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (Math.hypot(e.clientX - dragStartPosRef.current.x, e.clientY - dragStartPosRef.current.y) > 6) {
      isDraggingRef.current = true;
    }
    if (isPanning) {
      setPan({
        x: e.clientX - startPan.x,
        y: e.clientY - startPan.y,
      });
    }
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
  };

  const handleMouseUp = () => setIsPanning(false);

  // Node coordinate lookup map
  const nodeMap = useMemo(() => {
    const map = new Map<number, DemoNode>();
    for (const n of DEMO_NODES) map.set(n.id, n);
    return map;
  }, []);

  // Compute SVG polyline points string from array of node IDs
  const getPathPointsString = useCallback(
    (nodeIds: number[]): string => {
      return nodeIds
        .map((id) => {
          const n = nodeMap.get(id);
          return n ? `${n.x},${n.y}` : '';
        })
        .filter(Boolean)
        .join(' ');
    },
    [nodeMap]
  );

  // Stop map by node ID
  const stopsByNodeId = useMemo(() => {
    const map = new Map<number, typeof stops[0]>();
    for (const s of stops) {
      map.set(s.nodeId, s);
    }
    return map;
  }, [stops]);

  // SVG coordinate transformation helper
  const getSvgCoordinates = useCallback((e: React.MouseEvent): { x: number; y: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (ctm) {
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const transformed = pt.matrixTransform(ctm.inverse());
      return { x: transformed.x, y: transformed.y };
    }
    const rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / (rect.width || 1)) * 1400,
      y: ((e.clientY - rect.top) / (rect.height || 1)) * 900,
    };
  }, []);

  // Find closest intersection node from coordinates
  const findClosestNode = useCallback((x: number, y: number): DemoNode => {
    let closest = DEMO_NODES[0];
    let minD = Infinity;
    for (const node of DEMO_NODES) {
      const d = (node.x - x) ** 2 + (node.y - y) ** 2;
      if (d < minD) {
        minD = d;
        closest = node;
      }
    }
    return closest;
  }, []);

  // Map canvas background click (handles place-stop & place-depot anywhere on map)
  const handleMapCanvasClick = (e: React.MouseEvent) => {
    if (isDraggingRef.current) return;
    if (interactionMode === 'place-stop' || interactionMode === 'place-depot') {
      const coords = getSvgCoordinates(e);
      if (coords) {
        const closest = findClosestNode(coords.x, coords.y);
        onNodeClick?.(closest);
      }
    }
  };

  // Road segment click (snaps to nearest road endpoint node in place-stop & place-depot modes)
  const handleRoadClickInternal = (road: DemoRoad, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDraggingRef.current) return;
    if (interactionMode === 'place-stop' || interactionMode === 'place-depot') {
      const coords = getSvgCoordinates(e);
      const n1 = nodeMap.get(road.from);
      const n2 = nodeMap.get(road.to);
      if (coords && n1 && n2) {
        const d1 = (n1.x - coords.x) ** 2 + (n1.y - coords.y) ** 2;
        const d2 = (n2.x - coords.x) ** 2 + (n2.y - coords.y) ** 2;
        onNodeClick?.(d1 <= d2 ? n1 : n2);
      } else if (n1) {
        onNodeClick?.(n1);
      }
      return;
    }
    onRoadClick?.(road);
  };

  // Combine single and multiple incidents
  const incidentList = useMemo<ActiveIncident[]>(() => {
    if (activeIncidents && activeIncidents.length > 0) return activeIncidents;
    if (activeIncident) return [activeIncident];
    return [];
  }, [activeIncidents, activeIncident]);

  const blockedRoadIdSet = useMemo<Set<string>>(() => {
    return new Set(incidentList.map((inc) => inc.roadId));
  }, [incidentList]);

  // Combine single and multiple alternative routes
  const altRoutesList = useMemo(() => {
    if (alternativeRoutes && alternativeRoutes.length > 0) return alternativeRoutes;
    if (alternativeRoute) return [alternativeRoute];
    return [];
  }, [alternativeRoutes, alternativeRoute]);

  // Midpoint of selected road
  const selectedRoad = selectedRoadId ? getRoadById(selectedRoadId) : null;
  const selectedRoadMidpoint = selectedRoad ? getRoadMidpoint(selectedRoad) : null;

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full select-none overflow-hidden ${
        isDark ? 'bg-[#07080f] text-neutral-100' : 'bg-[#f4f5f8] text-neutral-900'
      } ${className}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{ cursor: isPanning ? 'grabbing' : interactionMode === 'select-incident-road' ? 'crosshair' : 'default' }}
    >
      {/* ── CSS Keyframe animations for live route dashes and hazard pulse ── */}
      <style>{`
        @keyframes dash-travel {
          to { stroke-dashoffset: -40; }
        }
        @keyframes hazard-pulse {
          0%, 100% { opacity: 0.9; stroke-width: 7; }
          50% { opacity: 0.5; stroke-width: 10; }
        }
        @keyframes beacon-ripple {
          0% { r: 12; opacity: 0.8; }
          100% { r: 36; opacity: 0; }
        }
        .anim-route-dash {
          animation: dash-travel 1.4s linear infinite;
        }
        .anim-hazard {
          animation: hazard-pulse 1.2s ease-in-out infinite;
        }
        .anim-beacon {
          animation: beacon-ripple 2s cubic-bezier(0, 0.2, 0.8, 1) infinite;
        }
      `}</style>

      {/* ── Top Status & Mode Banner ── */}
      <div className="absolute top-4 left-4 z-20 flex flex-col gap-2 pointer-events-none">
        <div
          className={`flex items-center gap-3 px-3.5 py-2 rounded-xl backdrop-blur-md border text-xs font-mono shadow-lg pointer-events-auto ${
            isDark
              ? 'bg-[#0d0f1a]/85 border-neutral-800/80 text-neutral-200'
              : 'bg-white/90 border-neutral-300/80 text-neutral-800'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-semibold tracking-wide uppercase">Meridian City Dispatch Map</span>
          </div>
          <span className="opacity-40">|</span>
          <span className="opacity-70">38 Hubs · 58 Corridors</span>
          {routes.length > 0 && (
            <>
              <span className="opacity-40">|</span>
              <span className="text-indigo-400 font-semibold">{routes.length} Active Routes</span>
            </>
          )}
        </div>

        {/* Interaction mode notification */}
        {interactionMode === 'select-incident-road' && (
          <div
            className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border text-xs font-sans shadow-xl pointer-events-auto animate-fade-in ${
              isDark
                ? 'bg-amber-950/90 border-amber-600/60 text-amber-200'
                : 'bg-amber-50/95 border-amber-400 text-amber-900'
            }`}
          >
            <div>
              <span className="font-semibold">Select Incident Location: </span>
              <span className="opacity-90">Click any road corridor on the map to target it.</span>
            </div>
            {selectedRoad && (
              <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40">
                {selectedRoad.name}
              </span>
            )}
            {onCancelMode && (
              <button
                onClick={onCancelMode}
                className="ml-2 px-2.5 py-1 rounded text-[11px] font-semibold border border-amber-500/50 hover:bg-amber-500/20 transition-colors"
              >
                Done
              </button>
            )}
          </div>
        )}

        {interactionMode === 'place-depot' && (
          <div
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-sans shadow-lg pointer-events-auto ${
              isDark ? 'bg-amber-950/90 border-amber-600 text-amber-200' : 'bg-amber-50 border-amber-300 text-amber-900'
            }`}
          >
            <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-500">DEPOT</span>
            <span>Click anywhere on the map or an intersection to place the Central Depot.</span>
          </div>
        )}

        {interactionMode === 'place-stop' && (
          <div
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-sans shadow-lg pointer-events-auto ${
              isDark ? 'bg-emerald-950/90 border-emerald-600 text-emerald-200' : 'bg-emerald-50 border-emerald-300 text-emerald-900'
            }`}
          >
            <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-500">STOP</span>
            <span>Click anywhere on the map or an intersection to drop a stop for the active vehicle.</span>
          </div>
        )}
      </div>

      {/* ── Top-Right Map Controls ── */}
      <div className="absolute top-4 right-4 z-20 flex flex-col gap-2 items-end">
        {/* Zoom & Fit Bar */}
        <div
          className={`flex items-center gap-1 p-1 rounded-xl backdrop-blur-md border shadow-lg ${
            isDark ? 'bg-[#0d0f1a]/85 border-neutral-800' : 'bg-white/90 border-neutral-300'
          }`}
        >
          <button
            onClick={handleZoomIn}
            title="Zoom In (+)"
            className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono font-bold text-sm transition-colors ${
              isDark ? 'hover:bg-neutral-800 text-neutral-200' : 'hover:bg-neutral-100 text-neutral-700'
            }`}
          >
            +
          </button>
          <span className="text-[11px] font-mono px-1.5 opacity-60">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={handleZoomOut}
            title="Zoom Out (-)"
            className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono font-bold text-sm transition-colors ${
              isDark ? 'hover:bg-neutral-800 text-neutral-200' : 'hover:bg-neutral-100 text-neutral-700'
            }`}
          >
            −
          </button>
          <button
            onClick={handleResetView}
            title="Reset View"
            className={`px-2 h-7 rounded-lg flex items-center justify-center font-mono text-[11px] transition-colors ${
              isDark ? 'hover:bg-neutral-800 text-neutral-300' : 'hover:bg-neutral-100 text-neutral-700'
            }`}
          >
            Reset
          </button>
        </div>

        {/* Layer Toggles */}
        <div
          className={`flex items-center gap-1.5 p-1 rounded-xl backdrop-blur-md border text-[11px] font-medium shadow-lg ${
            isDark ? 'bg-[#0d0f1a]/85 border-neutral-800' : 'bg-white/90 border-neutral-300'
          }`}
        >
          <button
            onClick={() => setShowDistricts((v) => !v)}
            className={`px-2.5 py-1 rounded-lg transition-colors ${
              showDistricts
                ? isDark
                  ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40'
                  : 'bg-indigo-100 text-indigo-800 border border-indigo-300'
                : 'opacity-50 hover:opacity-100'
            }`}
          >
            Districts
          </button>
          <button
            onClick={() => setShowRoadLabels((v) => !v)}
            className={`px-2.5 py-1 rounded-lg transition-colors ${
              showRoadLabels
                ? isDark
                  ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40'
                  : 'bg-indigo-100 text-indigo-800 border border-indigo-300'
                : 'opacity-50 hover:opacity-100'
            }`}
          >
            Labels
          </button>
          <button
            onClick={() => setShowLegend((v) => !v)}
            className={`px-2.5 py-1 rounded-lg transition-colors ${
              showLegend
                ? isDark
                  ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40'
                  : 'bg-indigo-100 text-indigo-800 border border-indigo-300'
                : 'opacity-50 hover:opacity-100'
            }`}
          >
            Legend
          </button>
        </div>
      </div>

      {/* ── Alternative Detour On-Map Callout Banner ── */}
      {altRoutesList.length > 0 && (
        <div
          className={`absolute top-20 left-1/2 -translate-x-1/2 z-30 max-w-lg w-[90%] p-4 rounded-2xl border shadow-2xl backdrop-blur-xl animate-slide-in ${
            isDark
              ? 'bg-[#090b14]/95 border-emerald-500/50 text-neutral-100 shadow-emerald-950/40'
              : 'bg-white/95 border-emerald-400 text-neutral-900 shadow-emerald-200/50'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping shrink-0" />
              <div>
                <div className="text-xs uppercase tracking-wider font-bold text-emerald-400 flex items-center gap-2">
                  <span>Dynamic Reroute Available</span>
                  <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 border border-emerald-500/40">
                    {altRoutesList.length > 1 ? `${altRoutesList.length} Corridors Active` : 'A* Corridor Bypass'}
                  </span>
                </div>
                <div className="text-sm font-semibold mt-0.5">
                  Avoids {incidentList.length > 1 ? `${incidentList.length} incidents` : 'incident'} on{' '}
                  <span className="text-red-400 underline decoration-dashed">
                    {Array.from(blockedRoadIdSet)
                      .map((id) => getRoadById(id)?.name || id)
                      .join(', ')}
                  </span>
                </div>
              </div>
            </div>
            <div className="text-right font-mono text-xs shrink-0">
              <div className="text-emerald-400 font-bold">
                +{altRoutesList.reduce((acc, r) => acc + r.timeSaved, 0)}m saved
              </div>
              <div className="opacity-50 text-[10px]">
                +{altRoutesList.reduce((acc, r) => acc + r.extraDistance, 0).toFixed(1)} km detour
              </div>
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-neutral-700/40 flex items-center justify-between text-xs">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-0.5 border-b border-dashed border-red-400" />
                <span className="opacity-70 text-[11px]">Blocked path</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-1 bg-emerald-500 rounded" />
                <span className="opacity-70 text-[11px]">Detour bypass</span>
              </div>
            </div>
            {onApplyAlternative && (
              <button
                onClick={onApplyAlternative}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors shadow-md shadow-emerald-900/30"
              >
                Apply Detour Reroute{altRoutesList.length > 1 ? 's' : ''} →
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Interactive SVG Map Canvas ── */}
      <svg
        ref={svgRef}
        className="w-full h-full select-none"
        viewBox="0 0 1400 900"
        preserveAspectRatio="xMidYMid meet"
        onClick={handleMapCanvasClick}
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: 'center center',
          transition: isPanning ? 'none' : 'transform 0.12s ease-out',
          cursor:
            interactionMode === 'place-stop' || interactionMode === 'place-depot'
              ? 'crosshair'
              : isPanning
              ? 'grabbing'
              : 'default',
        }}
      >
        <defs>
          {/* Neon Glow Filter */}
          <filter id="glow-route" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Intense Hazard Glow */}
          <filter id="glow-hazard" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="6" result="blur1" />
            <feGaussianBlur stdDeviation="2" result="blur2" />
            <feMerge>
              <feMergeNode in="blur1" />
              <feMergeNode in="blur2" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Diagonal Hazard Stripe Pattern */}
          <pattern
            id="hazard-pattern"
            width="14"
            height="14"
            patternTransform="rotate(45 0 0)"
            patternUnits="userSpaceOnUse"
          >
            <rect width="7" height="14" fill="#ef4444" opacity="0.9" />
            <rect x="7" width="7" height="14" fill="#18181b" opacity="0.9" />
          </pattern>

          {/* Subtle Map Grid Pattern */}
          <pattern id="grid-pattern" width="80" height="80" patternUnits="userSpaceOnUse">
            <path
              d="M 80 0 L 0 0 0 80"
              fill="none"
              stroke={isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)'}
              strokeWidth="1"
            />
          </pattern>
        </defs>

        {/* ── 1. Map Canvas Background & Grid ── */}
        <rect id="map-background" width="1400" height="900" fill="url(#grid-pattern)" />

        {/* ── 2. River / Waterway ── */}
        <g id="waterways">
          {/* Outer glow/shore */}
          <path
            d={RIVER_PATH}
            fill="none"
            stroke={isDark ? 'rgba(56, 189, 248, 0.08)' : 'rgba(14, 165, 233, 0.12)'}
            strokeWidth="56"
            strokeLinecap="round"
          />
          {/* Main River Stream */}
          <path
            d={RIVER_PATH}
            fill="none"
            stroke={isDark ? '#0e2238' : '#cce7f8'}
            strokeWidth="38"
            strokeLinecap="round"
          />
          {/* Water Centerflow current */}
          <path
            d={RIVER_PATH}
            fill="none"
            stroke={isDark ? '#193554' : '#b8ddf5'}
            strokeWidth="18"
            strokeLinecap="round"
            strokeDasharray="60 30"
          />
          <text
            x="760"
            y="450"
            fill={isDark ? 'rgba(56, 189, 248, 0.35)' : 'rgba(14, 165, 233, 0.5)'}
            fontSize="11"
            fontFamily="JetBrains Mono, monospace"
            letterSpacing="3"
            transform="rotate(12 760 450)"
          >
            RIVER MERIDIAN
          </text>
        </g>

        {/* ── 3. Parks & Green Areas ── */}
        <g id="parks">
          {DEMO_PARKS.map((park, i) => (
            <g key={`park-${i}`}>
              <rect
                x={park.x}
                y={park.y}
                width={park.w}
                height={park.h}
                rx="14"
                fill={isDark ? 'rgba(16, 185, 129, 0.07)' : 'rgba(16, 185, 129, 0.12)'}
                stroke={isDark ? 'rgba(16, 185, 129, 0.25)' : 'rgba(16, 185, 129, 0.35)'}
                strokeWidth="1.5"
                strokeDasharray="4 3"
              />
              <text
                x={park.x + park.w / 2}
                y={park.y + park.h / 2 + 3}
                fill={isDark ? 'rgba(52, 211, 153, 0.6)' : 'rgba(5, 150, 105, 0.8)'}
                fontSize="10"
                fontFamily="Inter, sans-serif"
                fontWeight="500"
                textAnchor="middle"
                letterSpacing="0.5"
              >
                {park.name}
              </text>
            </g>
          ))}
        </g>

        {/* ── 4. Named Districts ── */}
        {showDistricts && (
          <g id="districts" opacity="0.9">
            {DEMO_DISTRICTS.map((d) => (
              <g key={d.name}>
                <rect
                  x={d.bounds.x}
                  y={d.bounds.y}
                  width={d.bounds.w}
                  height={d.bounds.h}
                  rx="18"
                  fill={isDark ? d.darkFill : d.lightFill}
                  stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}
                  strokeWidth="1"
                  strokeDasharray="6 4"
                />
                <text
                  x={d.labelX}
                  y={d.labelY}
                  fill={isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.25)'}
                  fontSize="12"
                  fontFamily="'EB Garamond', serif"
                  fontWeight="600"
                  letterSpacing="2"
                  textAnchor="middle"
                  className="uppercase select-none pointer-events-none"
                >
                  {d.name}
                </text>
              </g>
            ))}
          </g>
        )}

        {/* ── 5. Base Road Network (Casings + Surfaces) ── */}
        <g id="roads">
          {/* Pass 1: Road Casings / Borders */}
          {DEMO_ROADS.map((road) => {
            const n1 = nodeMap.get(road.from);
            const n2 = nodeMap.get(road.to);
            if (!n1 || !n2) return null;
            const style = ROAD_STYLES[road.type];
            const casingWidth = style.width + (road.type === 'highway' ? 4 : 3);

            return (
              <line
                key={`casing-${road.id}`}
                x1={n1.x}
                y1={n1.y}
                x2={n2.x}
                y2={n2.y}
                stroke={isDark ? '#0c0e18' : '#e2e5ea'}
                strokeWidth={casingWidth}
                strokeLinecap="round"
              />
            );
          })}

          {/* Pass 2: Road Surface */}
          {DEMO_ROADS.map((road) => {
            const n1 = nodeMap.get(road.from);
            const n2 = nodeMap.get(road.to);
            if (!n1 || !n2) return null;

            const isBlocked = blockedRoadIdSet.has(road.id);
            const isSelected = selectedRoadId === road.id;
            const isHovered = hoveredRoad?.id === road.id;
            const style = ROAD_STYLES[road.type];

            // Color scheme based on road hierarchy
            let strokeColor = isDark ? style.darkColor : style.lightColor;
            let strokeWidth = style.width;

            if (road.type === 'highway') {
              strokeColor = isDark ? '#334155' : '#94a3b8';
            }

            return (
              <g key={`surface-${road.id}`}>
                {/* Visual road line */}
                <line
                  x1={n1.x}
                  y1={n1.y}
                  x2={n2.x}
                  y2={n2.y}
                  stroke={isBlocked ? '#ef4444' : strokeColor}
                  strokeWidth={isBlocked ? 6 : strokeWidth}
                  strokeLinecap="round"
                />

                {/* Highway Center Divider */}
                {road.type === 'highway' && !isBlocked && (
                  <line
                    x1={n1.x}
                    y1={n1.y}
                    x2={n2.x}
                    y2={n2.y}
                    stroke={isDark ? '#475569' : '#cbd5e1'}
                    strokeWidth="1"
                    strokeDasharray="6 4"
                  />
                )}

                {/* Selected Road Target Halo */}
                {isSelected && (
                  <line
                    x1={n1.x}
                    y1={n1.y}
                    x2={n2.x}
                    y2={n2.y}
                    stroke="#f59e0b"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray="8 6"
                    opacity="0.85"
                  />
                )}

                {/* Hover Highlight */}
                {isHovered && !isBlocked && (
                  <line
                    x1={n1.x}
                    y1={n1.y}
                    x2={n2.x}
                    y2={n2.y}
                    stroke={interactionMode === 'select-incident-road' ? '#f59e0b' : '#38bdf8'}
                    strokeWidth={strokeWidth + 4}
                    strokeLinecap="round"
                    opacity="0.6"
                  />
                )}

                {/* Active Incident Blocked Animation */}
                {isBlocked && (
                  <>
                    <line
                      x1={n1.x}
                      y1={n1.y}
                      x2={n2.x}
                      y2={n2.y}
                      stroke="url(#hazard-pattern)"
                      strokeWidth="9"
                      strokeLinecap="round"
                      className="anim-hazard"
                    />
                    <line
                      x1={n1.x}
                      y1={n1.y}
                      x2={n2.x}
                      y2={n2.y}
                      stroke="#ef4444"
                      strokeWidth="14"
                      strokeLinecap="round"
                      opacity="0.3"
                      filter="url(#glow-hazard)"
                    />
                  </>
                )}

                {/* Invisible wide hit area for effortless clicking and hovering */}
                <line
                  x1={n1.x}
                  y1={n1.y}
                  x2={n2.x}
                  y2={n2.y}
                  stroke="transparent"
                  strokeWidth="24"
                  strokeLinecap="round"
                  style={{
                    cursor:
                      interactionMode === 'select-incident-road'
                        ? 'crosshair'
                        : interactionMode === 'place-stop' || interactionMode === 'place-depot'
                        ? 'crosshair'
                        : 'pointer',
                  }}
                  onMouseEnter={() => setHoveredRoad(road)}
                  onMouseLeave={() => setHoveredRoad((cur) => (cur?.id === road.id ? null : cur))}
                  onClick={(e) => handleRoadClickInternal(road, e)}
                />
              </g>
            );
          })}

          {/* Road Names Labels */}
          {showRoadLabels &&
            DEMO_ROADS.filter((r) => r.type === 'highway' || r.type === 'arterial').map((r) => {
              const mid = getRoadMidpoint(r);
              const n1 = nodeMap.get(r.from);
              const n2 = nodeMap.get(r.to);
              if (!n1 || !n2) return null;
              const angle = (Math.atan2(n2.y - n1.y, n2.x - n1.x) * 180) / Math.PI;
              const normAngle = angle > 90 ? angle - 180 : angle < -90 ? angle + 180 : angle;

              return (
                <text
                  key={`label-${r.id}`}
                  x={mid.x}
                  y={mid.y - 4}
                  fill={isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.45)'}
                  fontSize="9"
                  fontFamily="Inter, sans-serif"
                  fontWeight="500"
                  textAnchor="middle"
                  transform={`rotate(${normAngle} ${mid.x} ${mid.y - 4})`}
                  className="select-none pointer-events-none"
                >
                  {r.name}
                </text>
              );
            })}
        </g>

        {/* ── 6. Previous Routes (Before Reroute Comparison) ── */}
        {previousRoutes.length > 0 && (
          <g id="previous-routes" opacity="0.6">
            {previousRoutes.map((route, i) => {
              const pts = getPathPointsString(route.path);
              if (!pts) return null;
              return (
                <polyline
                  key={`prev-${i}`}
                  points={pts}
                  fill="none"
                  stroke="#a855f7"
                  strokeWidth="3.5"
                  strokeDasharray="8 6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              );
            })}
          </g>
        )}

        {/* ── 7. Active Vehicle Routes ── */}
        <g id="routes">
          {routes.map((route) => {
            const pts = getPathPointsString(route.path);
            if (!pts) return null;

            const color = VEHICLE_COLOURS[route.vehicleIdx % VEHICLE_COLOURS.length];
            const isHighlight = activeVehicleId === null || activeVehicleId === route.vehicleIdx;
            const opacity = isHighlight ? 1 : 0.2;

            return (
              <g key={`route-${route.vehicleIdx}`} opacity={opacity} className="transition-opacity duration-300">
                {/* Route Glow Halo */}
                <polyline
                  points={pts}
                  fill="none"
                  stroke={color}
                  strokeWidth="10"
                  strokeOpacity="0.18"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  filter="url(#glow-route)"
                />

                {/* Main Route Line */}
                <polyline
                  points={pts}
                  fill="none"
                  stroke={color}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Animated Directional Travel Dash */}
                <polyline
                  points={pts}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="2.5"
                  strokeDasharray="8 14"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="anim-route-dash"
                  opacity="0.8"
                />
              </g>
            );
          })}
        </g>

        {/* ── 8. Alternative Route Overlay (Detour Paths) ── */}
        {altRoutesList.length > 0 && (
          <g id="alternative-path">
            {altRoutesList.map((alt, idx) => (
              <g key={`alt-route-${idx}`}>
                {/* Blocked Original Section (Muted dashed red/purple) */}
                <polyline
                  points={getPathPointsString(alt.originalPath)}
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="4"
                  strokeDasharray="6 6"
                  strokeLinecap="round"
                  opacity="0.7"
                />

                {/* Glowing Rerouted Alternative Bypass (Vivid Emerald) */}
                <polyline
                  points={getPathPointsString(alt.reroutedPath)}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="12"
                  strokeOpacity="0.25"
                  filter="url(#glow-route)"
                />
                <polyline
                  points={getPathPointsString(alt.reroutedPath)}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <polyline
                  points={getPathPointsString(alt.reroutedPath)}
                  fill="none"
                  stroke="#ecfdf5"
                  strokeWidth="3"
                  strokeDasharray="10 12"
                  strokeLinecap="round"
                  className="anim-route-dash"
                />
              </g>
            ))}
          </g>
        )}

        {/* ── 9. Nodes / Intersections / Stops / Depot ── */}
        <g id="nodes">
          {DEMO_NODES.map((node) => {
            const isDepot = depotNodeId === node.id;
            const stop = stopsByNodeId.get(node.id);
            const isHovered = hoveredNode?.id === node.id;
            const isPending = pendingStopNodeId === node.id;

            return (
              <g
                key={`node-${node.id}`}
                transform={`translate(${node.x}, ${node.y})`}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHoveredNode(node)}
                onMouseLeave={() => setHoveredNode((cur) => (cur?.id === node.id ? null : cur))}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isDraggingRef.current) return;
                  onNodeClick?.(node);
                }}
              >
                {/* Invisible hit circle */}
                <circle r="18" fill="transparent" />

                {/* Pending Stop Target Highlight Beacon */}
                {isPending && (
                  <g>
                    <circle
                      r="28"
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="2.5"
                      strokeDasharray="6 4"
                      className="animate-spin"
                    />
                    <circle
                      r="20"
                      fill="#f59e0b"
                      fillOpacity="0.25"
                      stroke="#f59e0b"
                      strokeWidth="2"
                    />
                    <circle
                      r="11"
                      fill="#f59e0b"
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                    <text
                      y="3.5"
                      fill="#000000"
                      fontSize="11"
                      fontWeight="bold"
                      textAnchor="middle"
                    >
                      +
                    </text>
                    <g transform="translate(0, -32)">
                      <rect
                        x="-46"
                        y="-12"
                        width="92"
                        height="22"
                        rx="11"
                        fill="#f59e0b"
                        stroke="#ffffff"
                        strokeWidth="1.5"
                        className="shadow-lg"
                      />
                      <text
                        y="3"
                        fill="#000000"
                        fontSize="9.5"
                        fontFamily="Inter, sans-serif"
                        fontWeight="800"
                        letterSpacing="0.5"
                        textAnchor="middle"
                      >
                        TARGET STOP
                      </text>
                    </g>
                  </g>
                )}

                {/* Default Intersection Node */}
                {!isDepot && !stop && !isPending && (
                  <>
                    <circle
                      r={isHovered ? 6 : 3.5}
                      fill={isDark ? (isHovered ? '#38bdf8' : '#334155') : isHovered ? '#0284c7' : '#cbd5e1'}
                      stroke={isDark ? '#07080f' : '#ffffff'}
                      strokeWidth="1.5"
                      className="transition-all duration-150"
                    />
                    {isHovered && (
                      <circle
                        r="12"
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth="1"
                        strokeDasharray="2 2"
                        className="animate-spin"
                      />
                    )}
                  </>
                )}

                {/* Delivery Stop Pin */}
                {stop && !isDepot && (
                  <g>
                    {/* Pulsing ring on active */}
                    <circle
                      r="14"
                      fill={VEHICLE_COLOURS[(stop.vehicleIdx ?? 0) % VEHICLE_COLOURS.length]}
                      opacity="0.2"
                    />
                    {/* Badge circle */}
                    <circle
                      r="9.5"
                      fill={VEHICLE_COLOURS[(stop.vehicleIdx ?? 0) % VEHICLE_COLOURS.length]}
                      stroke="#ffffff"
                      strokeWidth="2"
                      className="shadow-md"
                    />
                    {/* Stop Number or Icon */}
                    <text
                      y="3.5"
                      fill="#ffffff"
                      fontSize="9"
                      fontFamily="JetBrains Mono, monospace"
                      fontWeight="bold"
                      textAnchor="middle"
                      className="select-none pointer-events-none"
                    >
                      {stop.stopNumber ?? '•'}
                    </text>
                  </g>
                )}

                {/* Central Depot Pin */}
                {isDepot && (
                  <g>
                    {/* Beacon ripple */}
                    <circle
                      r="12"
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="2"
                      className="anim-beacon"
                    />
                    {/* Outer glow circle */}
                    <circle r="15" fill="#f59e0b" opacity="0.25" />
                    {/* Solid Gold Depot Badge */}
                    <rect
                      x="-11"
                      y="-11"
                      width="22"
                      height="22"
                      rx="6"
                      fill="#f59e0b"
                      stroke="#ffffff"
                      strokeWidth="2.5"
                      transform="rotate(45)"
                      className="shadow-xl"
                    />
                    <text
                      y="4"
                      fill="#000000"
                      fontSize="10"
                      fontFamily="Inter, sans-serif"
                      fontWeight="900"
                      textAnchor="middle"
                      className="select-none pointer-events-none"
                    >
                      D
                    </text>
                    {/* Depot Tag Banner */}
                    <g transform="translate(0, -22)">
                      <rect
                        x="-24"
                        y="-10"
                        width="48"
                        height="14"
                        rx="4"
                        fill="#0f172a"
                        stroke="#f59e0b"
                        strokeWidth="1"
                      />
                      <text
                        y="0.5"
                        fill="#fef08a"
                        fontSize="8"
                        fontFamily="JetBrains Mono, monospace"
                        fontWeight="bold"
                        textAnchor="middle"
                        letterSpacing="1"
                      >
                        DEPOT
                      </text>
                    </g>
                  </g>
                )}
              </g>
            );
          })}
        </g>

        {/* ── 10. Active Incident Hazard Markers at Road Midpoints ── */}
        {incidentList.map((inc) => {
          const r = getRoadById(inc.roadId);
          if (!r) return null;
          const mid = getRoadMidpoint(r);
          return (
            <g key={`incident-marker-${inc.id}`} transform={`translate(${mid.x}, ${mid.y})`} className="z-40">
              {/* Pulsing Beacon */}
              <circle r="18" fill="none" stroke="#ef4444" strokeWidth="3" className="anim-beacon" />
              <circle r="14" fill="#dc2626" stroke="#ffffff" strokeWidth="2.5" className="shadow-2xl" />
              <text
                y="4.5"
                fill="#ffffff"
                fontSize="12"
                fontWeight="bold"
                textAnchor="middle"
                className="select-none pointer-events-none"
              >
                {inc.type === 'accident'
                  ? '!'
                  : inc.type === 'road_closure'
                  ? 'X'
                  : inc.type === 'congestion_spike'
                  ? '~'
                  : '+'}
              </text>

              {/* Floating incident pill */}
              <g transform="translate(0, -24)">
                <rect
                  x="-42"
                  y="-11"
                  width="84"
                  height="17"
                  rx="6"
                  fill="#7f1d1d"
                  stroke="#fca5a5"
                  strokeWidth="1"
                />
                <text
                  y="1.5"
                  fill="#fee2e2"
                  fontSize="8"
                  fontFamily="Inter, sans-serif"
                  fontWeight="700"
                  textAnchor="middle"
                  letterSpacing="0.5"
                >
                  {inc.type.replace('_', ' ').toUpperCase()}
                </text>
              </g>
            </g>
          );
        })}

        {/* ── 11. Selected Road Marker (Target Reticle) ── */}
        {selectedRoad && selectedRoadMidpoint && !blockedRoadIdSet.has(selectedRoad.id) && (
          <g transform={`translate(${selectedRoadMidpoint.x}, ${selectedRoadMidpoint.y})`}>
            <circle r="16" fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="4 3" className="animate-spin" />
            <circle r="5" fill="#f59e0b" />
            <g transform="translate(0, -22)">
              <rect
                x="-36"
                y="-10"
                width="72"
                height="15"
                rx="4"
                fill="#1e293b"
                stroke="#f59e0b"
                strokeWidth="1"
              />
              <text
                y="1"
                fill="#fde68a"
                fontSize="8"
                fontFamily="JetBrains Mono, monospace"
                fontWeight="bold"
                textAnchor="middle"
              >
                TARGET ROAD
              </text>
            </g>
          </g>
        )}
      </svg>

      {/* ── Hover Tooltip Card ── */}
      {hoveredRoad && (
        <div
          className={`absolute pointer-events-none z-40 px-3 py-2 rounded-xl backdrop-blur-md border text-xs shadow-xl transition-all duration-75 ${
            isDark ? 'bg-neutral-950/90 border-neutral-700 text-white' : 'bg-white/95 border-neutral-300 text-neutral-900'
          }`}
          style={{
            left: Math.min(window.innerWidth - 200, mousePos.x + 16),
            top: Math.max(10, mousePos.y - 45),
          }}
        >
          <div className="font-semibold flex items-center gap-2">
            <span>{hoveredRoad.name}</span>
            <span
              className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-mono ${
                hoveredRoad.type === 'highway'
                  ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                  : 'bg-neutral-500/20 text-neutral-400'
              }`}
            >
              {hoveredRoad.type}
            </span>
          </div>
          <div className="text-[11px] opacity-70 mt-0.5">
            Connects: {nodeMap.get(hoveredRoad.from)?.name} ↔ {nodeMap.get(hoveredRoad.to)?.name}
          </div>
          {interactionMode === 'select-incident-road' && (
            <div className="text-[10px] text-amber-400 font-medium mt-1">
              Click to target this road for incident
            </div>
          )}
        </div>
      )}

      {hoveredNode && !hoveredRoad && (
        <div
          className={`absolute pointer-events-none z-40 px-3 py-2 rounded-xl backdrop-blur-md border text-xs shadow-xl transition-all duration-75 ${
            isDark ? 'bg-neutral-950/90 border-neutral-700 text-white' : 'bg-white/95 border-neutral-300 text-neutral-900'
          }`}
          style={{
            left: Math.min(window.innerWidth - 200, mousePos.x + 16),
            top: Math.max(10, mousePos.y - 45),
          }}
        >
          <div className="font-semibold flex items-center gap-1.5">
            <span>{hoveredNode.name}</span>
            {depotNodeId === hoveredNode.id && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-mono">
                DEPOT
              </span>
            )}
            {stopsByNodeId.has(hoveredNode.id) && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono">
                STOP #{stopsByNodeId.get(hoveredNode.id)?.stopNumber}
              </span>
            )}
          </div>
          <div className="text-[11px] opacity-70 mt-0.5">{hoveredNode.district}</div>
          {interactionMode === 'place-depot' && (
            <div className="text-[10px] text-indigo-400 font-medium mt-1">Click to set as Depot</div>
          )}
          {interactionMode === 'place-stop' && (
            <div className="text-[10px] text-emerald-400 font-medium mt-1">Click to add delivery stop</div>
          )}
        </div>
      )}

      {/* ── Bottom-Left Legend Panel ── */}
      {showLegend && (
        <div
          className={`absolute bottom-4 left-4 z-20 p-3.5 rounded-2xl backdrop-blur-md border text-xs shadow-xl flex flex-col gap-2 ${
            isDark ? 'bg-[#0d0f1a]/90 border-neutral-800/90 text-neutral-300' : 'bg-white/95 border-neutral-300/90 text-neutral-700'
          }`}
        >
          <div className="font-semibold uppercase tracking-wider text-[10px] opacity-60">Map Legend</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-amber-500/30" />
              <span>Central Depot</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
              <span>Delivery Stop</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-5 h-[4px] rounded bg-slate-500" />
              <span>Highway (Bypass)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-5 h-[2.5px] rounded bg-slate-400" />
              <span>Arterial Road</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-5 h-[3px] rounded bg-emerald-500" />
              <span>Dynamic Detour</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-5 h-[3px] rounded bg-red-500" />
              <span>Blocked Incident</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DemoMap;
