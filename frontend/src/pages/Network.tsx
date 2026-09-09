import React, { useState, useCallback } from 'react';
import { loadNetwork, generateScenario, getNetworkGeoJSON } from '../api/client';
import type { NetworkResponse, ScenarioOut, Route } from '../types';
import MapView from '../components/MapView';

const Network: React.FC = () => {
  const [city, setCity] = useState('Oxford, England');
  const [useSynthetic, setUseSynthetic] = useState(false);
  const [syntheticNodes, setSyntheticNodes] = useState(60);
  const [network, setNetwork] = useState<NetworkResponse | null>(null);
  const [geojson, setGeojson] = useState<object | null>(null);
  const [scenario, setScenario] = useState<ScenarioOut | null>(null);
  const [routes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Scenario params
  const [nVehicles, setNVehicles]   = useState(3);
  const [nCustomers, setNCustomers] = useState(15);
  const [capacity, setCapacity]     = useState(50);

  const handleLoadNetwork = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await loadNetwork(city, useSynthetic, syntheticNodes);
      setNetwork(res.data);
      const geoRes = await getNetworkGeoJSON(res.data.network_id);
      setGeojson(geoRes.data.geojson);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? e.message);
    } finally {
      setLoading(false);
    }
  }, [city, useSynthetic, syntheticNodes]);

  const handleGenerateScenario = useCallback(async () => {
    if (!network) return;
    setLoading(true);
    setError(null);
    try {
      const res = await generateScenario({
        network_id: network.network_id,
        n_vehicles: nVehicles,
        n_customers: nCustomers,
        vehicle_capacity: capacity,
      });
      setScenario(res.data);
      // Store to localStorage so other pages can pick it up
      localStorage.setItem('router_scenario', JSON.stringify(res.data));
      localStorage.setItem('router_network_id', String(network.network_id));
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? e.message);
    } finally {
      setLoading(false);
    }
  }, [network, nVehicles, nCustomers, capacity]);

  const mapCenter: [number, number] | undefined =
    network?.bbox
      ? [(network.bbox.north + network.bbox.south) / 2,
         (network.bbox.east  + network.bbox.west)  / 2]
      : undefined;

  return (
    <div className="flex h-full gap-4 p-4 animate-fade-in">
      {/* Left panel */}
      <div className="w-80 shrink-0 flex flex-col gap-4 overflow-y-auto">
        {/* Load Network */}
        <div className="card p-5 flex flex-col gap-4">
          <div className="section-title">Load Road Network</div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={useSynthetic}
              onChange={e => setUseSynthetic(e.target.checked)}
              className="accent-primary-500 w-4 h-4"
            />
            <span className="text-sm text-slate-300">Use synthetic graph (offline)</span>
          </label>

          {useSynthetic ? (
            <div>
              <label className="label">Number of Nodes</label>
              <input
                type="number" min={20} max={200} value={syntheticNodes}
                onChange={e => setSyntheticNodes(Number(e.target.value))}
                className="input"
              />
            </div>
          ) : (
            <div>
              <label className="label">City / Place Name</label>
              <input
                value={city}
                onChange={e => setCity(e.target.value)}
                className="input"
                placeholder="Oxford, England"
              />
              <p className="text-xs text-slate-600 mt-1">
                Uses OpenStreetMap via osmnx. First load may take 30–60s.
              </p>
            </div>
          )}

          <button
            id="load-network-btn"
            onClick={handleLoadNetwork}
            disabled={loading}
            className="btn-primary"
          >
            {loading ? <><span className="spinner !w-4 !h-4 !border-2" /> Loading…</> : 'Load Network'}
          </button>
        </div>

        {/* Network stats */}
        {network && (
          <div className="card p-4 flex flex-col gap-3 animate-fade-in">
            <div className="section-title text-base">Network Stats</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {[
                ['City', network.city],
                ['Nodes', network.node_count.toLocaleString()],
                ['Edges', network.edge_count.toLocaleString()],
                ['Connected', network.is_connected ? 'Yes' : 'No'],
              ].map(([k, v]) => (
                <React.Fragment key={k as string}>
                  <span className="text-slate-500">{k}</span>
                  <span className="text-slate-200 font-medium">{v}</span>
                </React.Fragment>
              ))}
            </div>
          </div>
        )}

        {/* Generate Scenario */}
        {network && (
          <div className="card p-5 flex flex-col gap-4 animate-fade-in">
            <div className="section-title text-base">VRP Scenario</div>
            <div>
              <label className="label">Vehicles</label>
              <input type="number" min={1} max={20} value={nVehicles}
                onChange={e => setNVehicles(Number(e.target.value))} className="input" />
            </div>
            <div>
              <label className="label">Customers</label>
              <input type="number" min={3} max={100} value={nCustomers}
                onChange={e => setNCustomers(Number(e.target.value))} className="input" />
            </div>
            <div>
              <label className="label">Vehicle Capacity</label>
              <input type="number" min={1} value={capacity}
                onChange={e => setCapacity(Number(e.target.value))} className="input" />
            </div>
            <button
              id="generate-scenario-btn"
              onClick={handleGenerateScenario}
              disabled={loading}
              className="btn-primary"
            >
              {loading ? 'Generating…' : 'Generate Scenario'}
            </button>
          </div>
        )}

        {/* Scenario summary */}
        {scenario && (
          <div className="card p-4 flex flex-col gap-2 animate-fade-in">
            <div className="badge-success mb-1">Scenario ready</div>
            <div className="text-sm text-slate-300">
              <span className="font-medium">{scenario.name}</span>
            </div>
            <div className="text-xs text-slate-500">
              {scenario.vehicles.length} vehicles · {scenario.customers.length} customers
            </div>
            <div className="text-xs text-slate-600">
              Depot node: {scenario.depot_node}
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Head to the <span className="text-primary-400">Optimizer</span> tab to run ET-MaO-QPSO.
            </p>
          </div>
        )}

        {error && (
          <div className="card p-4 border-rose-500/30 text-rose-400 text-sm animate-fade-in">
            {error}
          </div>
        )}
      </div>

      {/* Map */}
      <div className="flex-1 min-w-0 card overflow-hidden">
        <MapView
          geojson={geojson}
          scenario={scenario}
          routes={routes}
          center={mapCenter ?? [51.752, -1.257]}
        />
      </div>
    </div>
  );
};

export default Network;
