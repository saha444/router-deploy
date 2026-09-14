import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  CircleMarker,
  Popup,
  Polyline,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import type { Route, ScenarioOut, TrafficEventOut, CustomerCreate } from '../types';
import { useTheme } from '../context/ThemeContext';
import { fetchRoadRoute } from '../services/roadRouting';

// Curated 12 high-contrast, vibrant vehicle colours
export const VEHICLE_COLOURS = [
  '#2563eb', // 1. Royal Blue
  '#059669', // 2. Emerald Green
  '#d97706', // 3. Amber Gold
  '#7c3aed', // 4. Vivid Purple
  '#db2777', // 5. Deep Rose
  '#0891b2', // 6. Cyan
  '#dc2626', // 7. Crimson Red
  '#ea580c', // 8. Bright Orange
  '#4f46e5', // 9. Indigo
  '#16a34a', // 10. Forest Green
  '#ca8a04', // 11. Golden Yellow
  '#9333ea', // 12. Electric Violet
];

interface MapViewProps {
  geojson?: object | null;
  scenario?: ScenarioOut | null;
  routes?: Route[];
  previousRoutes?: Route[]; // For before/after simulation visualization
  center?: [number, number];
  zoom?: number;
  depot?: { lat: number; lon: number; node_id?: number } | null;
  stops?: CustomerCreate[];
  activeVehicleId?: number | null;
  activeEvents?: TrafficEventOut[];
  mapClickMode?: 'none' | 'place_depot' | 'place_stop' | 'select_road';
  onMapClick?: (lat: number, lon: number) => void;
  showLegend?: boolean;
}

function MapEvents({ onMapClick }: { onMapClick?: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e) {
      if (onMapClick) onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function InvalidateMapSize() {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    const t1 = setTimeout(() => map.invalidateSize(), 150);
    const t2 = setTimeout(() => map.invalidateSize(), 500);
    const t3 = setTimeout(() => map.invalidateSize(), 1000);

    const handleResize = () => map.invalidateSize();
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    const container = map.getContainer();
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && container) {
      ro = new ResizeObserver(() => {
        map.invalidateSize();
      });
      ro.observe(container);
    }

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      if (ro) ro.disconnect();
    };
  }, [map]);
  return null;
}

function MapController({
  flyToLocation,
  initialFitPoints,
}: {
  flyToLocation: [number, number] | null;
  initialFitPoints: [number, number][] | null;
}) {
  const map = useMap();
  const hasInitialFitRef = useRef(false);

  useEffect(() => {
    if (flyToLocation) {
      map.flyTo(flyToLocation, 14, { duration: 1.2 });
    }
  }, [flyToLocation, map]);

  useEffect(() => {
    // Only fit on initial load of points once, never interrupt free user panning
    if (!hasInitialFitRef.current && initialFitPoints && initialFitPoints.length >= 2) {
      try {
        const bounds = L.latLngBounds(initialFitPoints.map(([lat, lon]) => [lat, lon]));
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
        hasInitialFitRef.current = true;
      } catch (err) {
        console.warn('fitBounds error:', err);
      }
    }
  }, [initialFitPoints, map]);

  return null;
}

const MapView: React.FC<MapViewProps> = ({
  geojson,
  scenario,
  routes = [],
  previousRoutes = [],
  center = [22.5937, 78.9629],
  zoom = 5,
  depot,
  stops = [],
  activeVehicleId = null,
  activeEvents = [],
  mapClickMode = 'none',
  onMapClick,
  showLegend = true,
}) => {
  const { isDark } = useTheme();
  const [nodeMap, setNodeMap] = useState<Map<number, [number, number]>>(new Map());
  const [roadGeometries, setRoadGeometries] = useState<Record<string, [number, number][]>>({});
  const [prevRoadGeometries, setPrevRoadGeometries] = useState<Record<string, [number, number][]>>({});
  const [flyLocation, setFlyLocation] = useState<[number, number] | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Effective depot coords
  const effectiveDepotLat = depot?.lat ?? scenario?.depot_lat;
  const effectiveDepotLon = depot?.lon ?? scenario?.depot_lon;
  const effectiveDepotNode = depot?.node_id ?? scenario?.depot_node;

  // Effective stops list (merging scenario customers with stops)
  const displayStops = useMemo(() => {
    if (scenario?.customers && scenario.customers.length > 0) {
      return scenario.customers.map((c, i) => ({
        id: c.id,
        name: c.name || (stops[i] ? stops[i].name : `Stop #${i + 1}`),
        node_id: c.node_id,
        lat: typeof c.lat === 'number' && c.lat !== 0 ? c.lat : (stops[i]?.lat ?? 0),
        lon: typeof c.lon === 'number' && c.lon !== 0 ? c.lon : (stops[i]?.lon ?? 0),
        demand: c.demand ?? c.dropoff_weight ?? c.pickup_weight ?? 0,
        vehicleIdx: stops[i]?.vehicleIdx,
      }));
    }
    return (stops || []).map((s, i) => ({
      id: (s as any).id ?? i,
      name: s.name || `Stop #${i + 1}`,
      node_id: s.node_id,
      lat: s.lat,
      lon: s.lon,
      demand: s.demand ?? s.dropoff_weight ?? s.pickup_weight ?? 0,
      vehicleIdx: s.vehicleIdx,
    }));
  }, [stops, scenario]);

  // Points for initial viewport framing
  const initialPoints = useMemo(() => {
    const pts: [number, number][] = [];
    if (typeof effectiveDepotLat === 'number' && typeof effectiveDepotLon === 'number') {
      pts.push([effectiveDepotLat, effectiveDepotLon]);
    }
    for (const s of displayStops) {
      if (typeof s.lat === 'number' && typeof s.lon === 'number' && s.lat !== 0) {
        pts.push([s.lat, s.lon]);
      }
    }
    return pts.length >= 2 ? pts : null;
  }, [effectiveDepotLat, effectiveDepotLon, displayStops]);

  // Build node -> [lat, lon] map from geojson
  useEffect(() => {
    if (!geojson) return;
    const g = geojson as any;
    const m = new Map<number, [number, number]>();
    for (const feat of g.features || []) {
      if (feat.geometry?.type === 'Point') {
        const [lon, lat] = feat.geometry.coordinates;
        m.set(feat.properties.id, [lat, lon]);
      }
    }
    setNodeMap(m);
  }, [geojson]);

  // Extract waypoints for a specific route: Depot -> Stop 1 -> Stop 2 -> ... -> Depot
  const getRouteWaypoints = (route: Route, routeIdx: number): [number, number][] => {
    if (typeof effectiveDepotLat !== 'number' || typeof effectiveDepotLon !== 'number') {
      return [];
    }

    let matchedStops: { lat: number; lon: number }[] = [];

    // 1. If route has an explicit customer_sequence from optimization:
    if (route.customer_sequence && route.customer_sequence.length > 0) {
      for (const cid of route.customer_sequence) {
        // Find by database customer ID or node_id
        let found = displayStops.find((s) => s.id === cid || s.node_id === cid);
        // Fallback to scenario customer matching
        if (!found && scenario?.customers) {
          const sc = scenario.customers.find((c) => c.id === cid);
          if (sc) found = { id: sc.id, name: sc.name || '', node_id: sc.node_id, lat: sc.lat, lon: sc.lon, demand: sc.demand ?? sc.dropoff_weight ?? sc.pickup_weight ?? 0, vehicleIdx: routeIdx };
        }
        // Fallback by index
        if (!found && cid >= 0 && cid < displayStops.length) {
          found = displayStops[cid];
        }
        if (found && typeof found.lat === 'number' && typeof found.lon === 'number' && found.lat !== 0) {
          matchedStops.push({ lat: found.lat, lon: found.lon });
        }
      }
    } else if (route.customer_sequence && route.customer_sequence.length === 0) {
      // Vehicle was explicitly assigned 0 stops (idle / dormant)
      return [];
    } else {
      // 2. Pre-optimization fallback: Match stops by vehicleIdx
      const vStops = displayStops.filter(
        (s) => s.vehicleIdx === routeIdx && typeof s.lat === 'number' && typeof s.lon === 'number' && s.lat !== 0
      );
      for (const s of vStops) {
        matchedStops.push({ lat: s.lat, lon: s.lon });
      }
    }

    // If this vehicle has no assigned stops, do not draw an unnecessary loop
    if (matchedStops.length === 0) {
      return [];
    }

    // Complete round-trip: Depot -> Stop 1 -> Stop 2 -> ... -> Depot
    return [
      [effectiveDepotLat, effectiveDepotLon],
      ...matchedStops.map((s) => [s.lat, s.lon] as [number, number]),
      [effectiveDepotLat, effectiveDepotLon],
    ];
  };

  // Resolve Real Road Geometries for Active Routes (Depot -> Stops -> Depot)
  useEffect(() => {
    if (routes.length === 0) {
      setRoadGeometries({});
      return;
    }

    let isMounted = true;

    const resolveRoutes = async () => {
      const newGeoms: Record<string, [number, number][]> = {};

      for (let idx = 0; idx < routes.length; idx++) {
        const route = routes[idx];
        const routeKey = `${route.route_id ?? idx}`;

        if (route.geometry && route.geometry.length >= 2) {
          newGeoms[routeKey] = route.geometry;
          continue;
        }

        const waypoints = getRouteWaypoints(route, idx);
        if (waypoints.length < 2) {
          continue;
        }

        try {
          const roadCoords = await fetchRoadRoute(waypoints);
          if (isMounted && roadCoords && roadCoords.length >= 2) {
            newGeoms[routeKey] = roadCoords;
          }
        } catch (err) {
          console.warn(`Could not resolve road geometry for route ${routeKey}:`, err);
        }
      }

      if (isMounted) {
        setRoadGeometries((prev) => ({ ...prev, ...newGeoms }));
      }
    };

    resolveRoutes();

    return () => {
      isMounted = false;
    };
  }, [routes, displayStops, effectiveDepotLat, effectiveDepotLon]);

  // Resolve Real Road Geometries for Previous Routes (Simulation Pre-reroute)
  useEffect(() => {
    if (previousRoutes.length === 0) {
      setPrevRoadGeometries({});
      return;
    }

    let isMounted = true;

    const resolvePrevRoutes = async () => {
      const newPrevGeoms: Record<string, [number, number][]> = {};

      for (let idx = 0; idx < previousRoutes.length; idx++) {
        const route = previousRoutes[idx];
        const routeKey = `prev-${route.route_id ?? idx}`;

        if (route.geometry && route.geometry.length >= 2) {
          newPrevGeoms[routeKey] = route.geometry;
          continue;
        }

        const waypoints = getRouteWaypoints(route, idx);
        if (waypoints.length < 2) continue;

        try {
          const roadCoords = await fetchRoadRoute(waypoints);
          if (isMounted && roadCoords && roadCoords.length >= 2) {
            newPrevGeoms[routeKey] = roadCoords;
          }
        } catch (err) {
          console.warn('Could not resolve prev route road geometry:', err);
        }
      }

      if (isMounted) {
        setPrevRoadGeometries((prev) => ({ ...prev, ...newPrevGeoms }));
      }
    };

    resolvePrevRoutes();

    return () => {
      isMounted = false;
    };
  }, [previousRoutes, displayStops, effectiveDepotLat, effectiveDepotLon]);

  // Location search helper to jump to any city in the world
  const handleLocationSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          searchQuery.trim()
        )}&limit=1`
      );
      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) {
          const lat = parseFloat(data[0].lat);
          const lon = parseFloat(data[0].lon);
          setFlyLocation([lat, lon]);
        }
      }
    } catch (err) {
      console.warn('Location search error:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleRecenter = () => {
    if (effectiveDepotLat && effectiveDepotLon) {
      setFlyLocation([effectiveDepotLat, effectiveDepotLon]);
    } else if (displayStops.length > 0) {
      setFlyLocation([displayStops[0].lat, displayStops[0].lon]);
    } else {
      setFlyLocation([center[0], center[1]]);
    }
  };

  return (
    <div
      className={`relative w-full h-full overflow-hidden border font-garamond ${
        isDark ? 'border-[#222222] bg-[#090a10]' : 'border-[#e0e0e0] bg-[#f5f5f5]'
      }`}
      style={{ height: '100%', width: '100%' }}
    >
      {/* Click Mode Banner Overlay - Clean text with NO emojis */}
      {mapClickMode !== 'none' && (
        <div
          className={`absolute top-14 sm:top-4 left-1/2 -translate-x-1/2 z-[1000] px-3.5 sm:px-5 py-1.5 sm:py-2 backdrop-blur-md text-xs sm:text-sm rounded-full shadow-2xl flex items-center gap-2 border transition-all whitespace-nowrap max-w-[90vw] truncate ${
            isDark
              ? 'bg-white text-black border-neutral-300'
              : 'bg-black text-white border-neutral-700'
          }`}
        >
          <span className={`w-2 h-2 rounded-full animate-ping shrink-0 ${isDark ? 'bg-black' : 'bg-white'}`} />
          <span className="truncate">
            {mapClickMode === 'place_depot' && 'Click road on map to place Depot terminal [D]'}
            {mapClickMode === 'place_stop' && 'Click road on map to add delivery destination'}
            {mapClickMode === 'select_road' && 'Click road on map to simulate traffic event'}
          </span>
        </div>
      )}

      {/* Map Search & Recenter Bar */}
      <div className="absolute top-3 sm:top-4 right-3 sm:right-4 z-[999] flex items-center gap-1.5 sm:gap-2 pointer-events-auto">
        <form onSubmit={handleLocationSearch} className="flex items-center">
          <input
            type="text"
            placeholder="Search city..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`px-2.5 sm:px-3 py-1.5 text-xs rounded-l-lg border outline-none backdrop-blur-md w-28 sm:w-44 md:w-56 font-sans transition-all ${
              isDark
                ? 'bg-black/75 border-neutral-700 text-white placeholder-neutral-500 focus:border-white'
                : 'bg-white/85 border-neutral-300 text-black placeholder-neutral-400 focus:border-black'
            }`}
          />
          <button
            type="submit"
            disabled={isSearching}
            className={`px-2.5 sm:px-3 py-1.5 text-xs rounded-r-lg border-y border-r font-medium transition-all ${
              isDark
                ? 'bg-neutral-800 border-neutral-700 text-white hover:bg-neutral-700'
                : 'bg-neutral-200 border-neutral-300 text-black hover:bg-neutral-300'
            }`}
          >
            {isSearching ? '...' : 'Go'}
          </button>
        </form>

        <button
          onClick={handleRecenter}
          title="Recenter Map on Fleet/Depot"
          className={`px-2.5 sm:px-3 py-1.5 text-xs rounded-lg border backdrop-blur-md font-sans font-medium transition-all shrink-0 ${
            isDark
              ? 'bg-black/75 border-neutral-700 text-white hover:border-white hover:bg-neutral-900'
              : 'bg-white/85 border-neutral-300 text-black hover:border-black hover:bg-white'
          }`}
        >
          Recenter
        </button>
      </div>

      <MapContainer
        center={center}
        zoom={zoom}
        minZoom={2}
        maxZoom={19}
        className="w-full h-full"
        style={{
          width: '100%',
          height: '100%',
          background: isDark ? '#090a10' : '#f5f5f5',
          cursor: mapClickMode !== 'none' ? 'crosshair' : 'grab',
        }}
      >
        <InvalidateMapSize />
        <MapEvents onMapClick={onMapClick} />
        <MapController flyToLocation={flyLocation} initialFitPoints={initialPoints} />

        {/* CARTO Basemaps with official authorized API key */}
        {isDark ? (
          <TileLayer
            key="carto-dark-auth"
            url="https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png?key=cb1_30x0_1_c3cc5a65cef705d3832f07be"
            maxZoom={19}
            attribution='&copy; OpenStreetMap, &copy; CARTO'
          />
        ) : (
          <TileLayer
            key="carto-voyager-auth"
            url="https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=cb1_30x0_1_c3cc5a65cef705d3832f07be"
            maxZoom={19}
            attribution='&copy; OpenStreetMap, &copy; CARTO'
          />
        )}

        {/* Road network overlay (if loaded) */}
        {geojson && (
          <GeoJSON
            key={`${isDark ? 'dark' : 'light'}-${JSON.stringify((geojson as any)?.features?.length)}`}
            data={geojson as any}
            filter={(feat: any) => feat.geometry?.type === 'LineString'}
            style={(feat: any) => {
              const cong = feat?.properties?.congestion ?? 0;
              const alpha = isDark ? 0.15 + (cong / 100) * 0.35 : 0.25 + (cong / 100) * 0.35;
              const color =
                cong > 60
                  ? '#ef4444'
                  : cong > 30
                  ? '#f59e0b'
                  : isDark
                  ? '#333344'
                  : '#b0b0b8';
              return { color, weight: 1.5, opacity: alpha };
            }}
          />
        )}

        {/* Previous routes (before reroute) — rendered as dashed, translucent 'ghost' lines on real roads */}
        {previousRoutes.map((route, idx) => {
          const routeKey = `prev-${route.route_id ?? idx}`;
          const positions = prevRoadGeometries[routeKey] || getRouteWaypoints(route, idx);
          if (positions.length < 2) return null;

          const colour = VEHICLE_COLOURS[idx % VEHICLE_COLOURS.length];
          return (
            <Polyline
              key={routeKey}
              positions={positions}
              pathOptions={{
                color: colour,
                weight: 3.5,
                opacity: 0.35,
                dashArray: '8 6',
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          );
        })}

        {/* Vehicle routes as real road polylines: Depot -> Stops -> Depot (Google Maps style) */}
        {routes.map((route, idx) => {
          const routeKey = `${route.route_id ?? idx}`;
          const positions = roadGeometries[routeKey] || getRouteWaypoints(route, idx);
          if (positions.length < 2) return null;

          const isActive = activeVehicleId !== null && route.vehicle_id === activeVehicleId;
          const isDimmed = activeVehicleId !== null && route.vehicle_id !== activeVehicleId;
          const colour = VEHICLE_COLOURS[idx % VEHICLE_COLOURS.length];

          return (
            <React.Fragment key={routeKey}>
              {/* Glow halo for active / hovered route */}
              {isActive && (
                <Polyline
                  positions={positions}
                  pathOptions={{
                    color: colour,
                    weight: 14,
                    opacity: 0.28,
                    lineCap: 'round',
                    lineJoin: 'round',
                  }}
                />
              )}
              {/* High-contrast outer casing */}
              <Polyline
                positions={positions}
                pathOptions={{
                  color: isDark ? '#000000' : '#ffffff',
                  weight: isActive ? 7 : 5,
                  opacity: isDimmed ? 0.2 : 0.75,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              />
              {/* Core road polyline in unique vehicle colour */}
              <Polyline
                positions={positions}
                pathOptions={{
                  color: colour,
                  weight: isActive ? 5 : 3.5,
                  opacity: isDimmed ? 0.25 : 0.95,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              />
            </React.Fragment>
          );
        })}

        {/* Active Traffic Events Overlay */}
        {activeEvents.map((ev, evIdx) => {
          let uCoord = nodeMap.get(ev.edge_u);
          let vCoord = nodeMap.get(ev.edge_v);
          if (!uCoord || !vCoord) {
            // Fallback: place incident on the active road polyline
            const firstRouteGeom = Object.values(roadGeometries)[0];
            if (firstRouteGeom && firstRouteGeom.length >= 4) {
              const midIdx = Math.floor(firstRouteGeom.length / 2);
              uCoord = firstRouteGeom[midIdx];
              vCoord = firstRouteGeom[Math.min(midIdx + 3, firstRouteGeom.length - 1)];
            } else if (displayStops.length > 0 && typeof effectiveDepotLat === 'number' && typeof effectiveDepotLon === 'number') {
              const s = displayStops[0];
              uCoord = [effectiveDepotLat * 0.55 + s.lat * 0.45, effectiveDepotLon * 0.55 + s.lon * 0.45];
              vCoord = [effectiveDepotLat * 0.45 + s.lat * 0.55, effectiveDepotLon * 0.45 + s.lon * 0.55];
            }
          }
          if (!uCoord || !vCoord) return null;
          return (
            <Polyline
              key={`event-${ev.id ?? evIdx}`}
              positions={[uCoord, vCoord]}
              pathOptions={{
                color: '#ef4444',
                weight: 8,
                opacity: 0.95,
              }}
            >
              <Popup>
                <div className="p-1 font-garamond">
                  <div className="text-red-500 font-bold text-sm uppercase tracking-wider">
                    Incident: {ev.event_type.replace('_', ' ')}
                  </div>
                  <div className="text-sm mt-1">
                    Delay: +{ev.delta_time}m | Congestion: +{ev.delta_congestion}%
                  </div>
                </div>
              </Popup>
            </Polyline>
          );
        })}

        {/* Depot Marker [D] */}
        {effectiveDepotLat && effectiveDepotLon && (
          <CircleMarker
            center={[effectiveDepotLat, effectiveDepotLon]}
            radius={13}
            pathOptions={{
              color: isDark ? '#ffffff' : '#000000',
              fillColor: isDark ? '#ffffff' : '#000000',
              fillOpacity: 1,
              weight: 3,
            }}
          >
            <Popup>
              <div className="font-garamond text-base">
                <div className="font-bold">Central Depot Terminal [D]</div>
                <div className="text-xs opacity-70 mt-1">Road Node #{effectiveDepotNode}</div>
                <div className="text-xs opacity-70">Fleet origin & return base</div>
              </div>
            </Popup>
          </CircleMarker>
        )}

        {/* Destination Stops Markers */}
        {displayStops.map((stop, i) => {
          if (!stop.lat || !stop.lon || isNaN(stop.lat) || isNaN(stop.lon)) return null;

          // Find which route contains this customer ID
          let assignedVehicleIdx = (stop as any).vehicleIdx;
          if (assignedVehicleIdx === undefined && routes.length > 0) {
            const rIdx = routes.findIndex(
              (r) => r.customer_sequence && (r.customer_sequence.includes(stop.id) || r.customer_sequence.includes(i))
            );
            if (rIdx !== -1) assignedVehicleIdx = rIdx;
          }
          const vIdx = assignedVehicleIdx !== undefined && assignedVehicleIdx >= 0 ? assignedVehicleIdx : (i % VEHICLE_COLOURS.length);
          const stopColor = VEHICLE_COLOURS[vIdx % VEHICLE_COLOURS.length];

          return (
            <CircleMarker
              key={`stop-${stop.id ?? i}-${i}`}
              center={[stop.lat, stop.lon]}
              radius={8}
              pathOptions={{
                color: '#ffffff',
                fillColor: stopColor,
                fillOpacity: 1,
                weight: 2,
              }}
            >
              <Popup>
                <div className="font-garamond text-base">
                  <div className="font-semibold">{stop.name ?? `Stop #${i + 1}`}</div>
                  <div className="text-xs opacity-80 mt-0.5">Drop-off Cargo: {stop.demand} kg</div>
                  <div className="text-xs font-semibold mt-1" style={{ color: stopColor }}>
                    Assigned Vehicle: #{vIdx + 1}
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {/* Floating Map Legend */}
      {showLegend && (
        <div
          className={`absolute bottom-4 left-4 z-[999] backdrop-blur-md border p-3 rounded-xl shadow-xl text-xs space-y-1.5 max-w-[220px] pointer-events-auto font-garamond ${
            isDark ? 'bg-black/85 border-[#262626] text-white' : 'bg-white/90 border-[#e0e0e0] text-black'
          }`}
        >
          <div className="font-semibold tracking-wider uppercase text-xs pb-1 border-b opacity-70">
            Map Legend
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full border shrink-0 ${isDark ? 'bg-white border-black' : 'bg-black border-white'}`} />
            <span className="text-sm">Central Depot [D]</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full border shrink-0 bg-blue-500 border-white" />
            <span className="text-sm">Assigned Delivery Stop</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-1 rounded bg-blue-500 shrink-0" />
            <span className="text-sm">Vehicle Round-Trip (Depot → Stops → Depot)</span>
          </div>
          {previousRoutes.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="w-4 h-[3px] rounded shrink-0" style={{ background: 'repeating-linear-gradient(90deg,#a855f7 0,#a855f7 5px,transparent 5px,transparent 9px)' }} />
              <span className="text-sm">Pre-Reroute Path</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="w-4 h-1 rounded bg-red-500 shrink-0" />
            <span className="text-sm">Traffic Incident</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default MapView;

