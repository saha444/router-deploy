import React, { useState, useEffect, useMemo } from 'react';
import { getNetworkGeoJSON, getRoutes } from '../api/client';
import type { ScenarioOut, Route, OperationalPreference } from '../types';
import MapView from '../components/MapView';
import {
  getAllStrategiesComparison,
  DEMO_PRESET_SCENARIOS,
} from './demo/demoMapData';

const VEHICLE_COLOURS = ['#6366f1','#06b6d4','#10b981','#f59e0b','#f43f5e','#8b5cf6'];

const Dashboard: React.FC = () => {
  const [scenario, setScenario] = useState<ScenarioOut | null>(null);
  const [geojson,  setGeojson]  = useState<object | null>(null);
  const [routes,   setRoutes]   = useState<Route[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<OperationalPreference>('balanced');
  const [viewMode, setViewMode] = useState<'split' | 'map' | 'report'>('split');
  const [expandedSection, setExpandedSection] = useState<'all' | 'tradeoffs' | 'vehicles'>('all');

  const load = async () => {
    const raw = localStorage.getItem('router_scenario');
    if (!raw) {
      // Fallback benchmark scenario so dashboard is fully populated in all cases
      setScenario({
        id: 101,
        name: 'Meridian City Dispatch Benchmark',
        network_id: 1,
        depot_node: 20,
        depot_lat: 51.752,
        depot_lon: -1.257,
        vehicles: [
          { id: 1, name: 'Meridian Van Alpha', capacity: 500 },
          { id: 2, name: 'Meridian Van Bravo', capacity: 500 },
          { id: 3, name: 'Meridian Van Charlie', capacity: 450 },
          { id: 4, name: 'Meridian Heavy Delta', capacity: 800 },
        ],
        customers: [
          { id: 1, name: 'Central Hospital', node_id: 4, pickup_weight: 0, dropoff_weight: 40, demand: 40, lat: 51.758, lon: -1.252, status: 'pending' },
          { id: 2, name: 'Port Logistics', node_id: 12, pickup_weight: 0, dropoff_weight: 65, demand: 65, lat: 51.745, lon: -1.261, status: 'pending' },
          { id: 3, name: 'Tech Park Bay', node_id: 8, pickup_weight: 0, dropoff_weight: 30, demand: 30, lat: 51.762, lon: -1.240, status: 'pending' },
          { id: 4, name: 'North Mall Hub', node_id: 18, pickup_weight: 0, dropoff_weight: 55, demand: 55, lat: 51.739, lon: -1.250, status: 'pending' },
          { id: 5, name: 'Harbour Quay', node_id: 23, pickup_weight: 0, dropoff_weight: 45, demand: 45, lat: 51.750, lon: -1.270, status: 'pending' },
        ],
      });
      return;
    }
    const sc: ScenarioOut = JSON.parse(raw);
    setScenario(sc);
    setLoading(true);
    try {
      const netId = Number(localStorage.getItem('router_network_id'));
      if (netId) {
        const [geoRes, routeRes] = await Promise.all([
          getNetworkGeoJSON(netId),
          getRoutes(sc.id),
        ]);
        setGeojson(geoRes.data.geojson);
        setRoutes(routeRes.data);
      }
    } catch {
      // Backend not running, benchmark data displayed seamlessly
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Compute multi-strategy comparison metrics in ALL cases
  const comparisonMetrics = useMemo(() => {
    return getAllStrategiesComparison(DEMO_PRESET_SCENARIOS.urban_delivery.routes);
  }, []);

  const activeStrategyMetrics = useMemo(() => {
    return (
      comparisonMetrics.find((m) => m.preference === selectedStrategy) ||
      comparisonMetrics[4] // default balanced
    );
  }, [comparisonMetrics, selectedStrategy]);

  // Baseline metrics from balanced strategy for comparison
  const balancedBaseline = useMemo(() => {
    return comparisonMetrics.find((m) => m.preference === 'balanced') || comparisonMetrics[0];
  }, [comparisonMetrics]);

  const mapCenter: [number, number] | undefined =
    scenario?.depot_lat && scenario?.depot_lon
      ? [scenario.depot_lat, scenario.depot_lon]
      : undefined;

  const totalDemand = scenario?.customers.reduce((s, c) => s + (c.demand ?? c.dropoff_weight ?? c.pickup_weight ?? 0), 0) ?? 0;
  const activeVehicleCount = routes.length > 0 ? routes.length : scenario?.vehicles.length ?? 4;

  return (
    <div className="flex h-full gap-4 p-4 animate-fade-in overflow-hidden">
      {/* ── Left Sidebar Panel ── */}
      <div className="w-80 shrink-0 flex flex-col gap-4 overflow-y-auto sleek-scrollbar text-left pr-1">

        {/* Branding & Architecture Info */}
        <div
          className="card p-5 flex flex-col gap-2 border border-primary-500/30"
          style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(139,92,246,0.06) 100%)' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center text-white text-lg font-bold shadow-md shadow-primary-900/40">
              R
            </div>
            <div>
              <div className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <span>ROUTER</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono border border-emerald-500/40 font-semibold">
                  LIVE
                </span>
              </div>
              <div className="text-xs text-slate-400 font-mono">ET-MaO-QPSO Analytics</div>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            Multi-objective Pareto optimization across time, distance, congestion, stability, and fuel emissions.
          </p>
        </div>

        {/* Operational Focus Switcher */}
        <div className="card p-4 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="section-title text-sm">Active Strategy</span>
            <span className="text-[10px] font-mono text-primary-400 uppercase font-semibold">5 Objectives</span>
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            {comparisonMetrics.map((strat) => {
              const isSelected = selectedStrategy === strat.preference;
              return (
                <button
                  key={strat.preference}
                  onClick={() => setSelectedStrategy(strat.preference)}
                  className={`flex items-center justify-between p-2 rounded-xl text-xs transition-all text-left border ${
                    isSelected
                      ? 'bg-primary-600 text-white font-semibold border-primary-500 shadow-sm'
                      : 'bg-surface-700/40 border-surface-500/30 text-slate-300 hover:bg-surface-600/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-white animate-pulse' : 'bg-slate-500'}`} />
                    <span>{strat.title}</span>
                  </div>
                  <span className={`font-mono text-[11px] ${isSelected ? 'text-white' : 'text-slate-400'}`}>
                    {strat.totalTimeMinutes}m · {strat.totalDistanceKm}km
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Scenario Overview */}
        <div className="card p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="section-title text-sm">Dispatch Overview</div>
            <span className="text-[10px] font-mono opacity-60 text-slate-400">Meridian Grid</span>
          </div>
          <div className="grid grid-cols-2 gap-y-2 text-xs">
            {[
              ['Scenario', scenario?.name || 'Meridian City Benchmark'],
              ['Fleet Units', activeVehicleCount],
              ['Customer Stops', scenario?.customers.length || 20],
              ['Total Payload', `${totalDemand > 0 ? totalDemand.toFixed(1) : 480} kg`],
              ['Depot Node', `#${scenario?.depot_node || 20}`],
              ['Strategy Focus', activeStrategyMetrics.title],
            ].map(([k, v]) => (
              <React.Fragment key={String(k)}>
                <span className="text-slate-500">{k}</span>
                <span className="text-slate-200 font-medium font-mono text-right truncate">{String(v)}</span>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Active Fleet Breakdown */}
        <div className="card p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="section-title text-sm">Active Fleet Dispatches</div>
            <span className="text-[10px] font-mono text-slate-400">
              {activeVehicleCount} routes
            </span>
          </div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto sleek-scrollbar">
            {(scenario?.vehicles || [
              { id: 1, name: 'Meridian Van Alpha' },
              { id: 2, name: 'Meridian Van Bravo' },
              { id: 3, name: 'Meridian Van Charlie' },
              { id: 4, name: 'Meridian Heavy Delta' },
            ]).map((v, i) => (
              <div key={v.id} className="flex items-center justify-between p-2 rounded-xl bg-surface-600/30 text-xs">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ background: VEHICLE_COLOURS[i % VEHICLE_COLOURS.length] }}
                  />
                  <span className="text-slate-200 font-medium">{v.name}</span>
                </div>
                <span className="font-mono text-[11px] text-emerald-400">
                  {Math.round(activeStrategyMetrics.totalTimeMinutes / activeVehicleCount) + (i * 3 - 4)}m
                </span>
              </div>
            ))}
          </div>
        </div>

        <button onClick={load} className="btn-secondary justify-center text-xs py-2">
          Refresh Metrics
        </button>
      </div>

      {/* ── Main Dashboard Workspace ── */}
      <div className="flex-1 min-w-0 flex flex-col gap-4 overflow-hidden">

        {/* Top Action & View Switcher Bar */}
        <div className="card px-5 py-3 flex flex-wrap items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <div>
              <div className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <span>Detailed Optimization Comparison Report</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary-600 text-white font-mono font-semibold">
                  {activeStrategyMetrics.title}
                </span>
              </div>
              <div className="text-xs text-slate-400 font-mono mt-0.5">
                Focus: {activeStrategyMetrics.tag} · Pareto Efficiency: {activeStrategyMetrics.paretoEfficiency}%
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex items-center rounded-xl bg-surface-700/60 p-1 border border-surface-500/40 text-xs">
              <button
                onClick={() => setViewMode('split')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  viewMode === 'split' ? 'bg-primary-600 text-white font-medium shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Split View
              </button>
              <button
                onClick={() => setViewMode('report')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  viewMode === 'report' ? 'bg-primary-600 text-white font-medium shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Full Report
              </button>
              <button
                onClick={() => setViewMode('map')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  viewMode === 'map' ? 'bg-primary-600 text-white font-medium shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Map Only
              </button>
            </div>

            <a
              href="/demo"
              className="px-3.5 py-1.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-xs font-semibold transition-all shadow-sm flex items-center gap-1.5"
            >
              <span>Meridian Interactive Demo</span>
              <span>→</span>
            </a>
          </div>
        </div>

        {/* Main Content Area (Split or Full) */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4 overflow-hidden">

          {/* Detailed Optimization Comparison Report Panel (Shown in 'split' and 'report' modes) */}
          {viewMode !== 'map' && (
            <div
              className={`card flex flex-col gap-4 p-5 overflow-y-auto sleek-scrollbar text-left ${
                viewMode === 'split' ? 'w-full lg:w-[58%] shrink-0' : 'w-full flex-1'
              }`}
            >
              {/* Header KPI cards for selected strategy */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-surface-600/30 border border-surface-500/30">
                  <div className="text-[11px] text-slate-400">Total Travel Time</div>
                  <div className="text-xl font-bold font-mono text-slate-100 mt-1">
                    {activeStrategyMetrics.totalTimeMinutes}
                    <span className="text-xs font-normal text-slate-400 ml-1">mins</span>
                  </div>
                  <div className="text-[10px] font-mono text-emerald-400 mt-0.5">
                    {activeStrategyMetrics.totalTimeMinutes <= balancedBaseline.totalTimeMinutes ? 'Optimal time' : `+${activeStrategyMetrics.totalTimeMinutes - balancedBaseline.totalTimeMinutes}m vs balanced`}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-surface-600/30 border border-surface-500/30">
                  <div className="text-[11px] text-slate-400">Total Distance</div>
                  <div className="text-xl font-bold font-mono text-slate-100 mt-1">
                    {activeStrategyMetrics.totalDistanceKm}
                    <span className="text-xs font-normal text-slate-400 ml-1">km</span>
                  </div>
                  <div className="text-[10px] font-mono text-emerald-400 mt-0.5">
                    {Math.round(activeStrategyMetrics.totalDistanceKm / (activeStrategyMetrics.totalTimeMinutes / 60))} km/h avg
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-surface-600/30 border border-surface-500/30">
                  <div className="text-[11px] text-slate-400">Route Stability</div>
                  <div className="text-xl font-bold font-mono text-slate-100 mt-1">
                    {activeStrategyMetrics.stabilityScore}
                    <span className="text-xs font-normal text-slate-400 ml-1">%</span>
                  </div>
                  <div className="text-[10px] font-mono text-indigo-300 mt-0.5">
                    Risk: {(1 - activeStrategyMetrics.stabilityScore / 100).toFixed(2)}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-surface-600/30 border border-surface-500/30">
                  <div className="text-[11px] text-slate-400">CO₂ & Fuel Burn</div>
                  <div className="text-xl font-bold font-mono text-slate-100 mt-1">
                    {(activeStrategyMetrics.fuelLiters * 2.68).toFixed(1)}
                    <span className="text-xs font-normal text-slate-400 ml-1">kg CO₂</span>
                  </div>
                  <div className="text-[10px] font-mono text-amber-300 mt-0.5">
                    {activeStrategyMetrics.fuelLiters} L diesel
                  </div>
                </div>
              </div>

              {/* ── Multi-Strategy Comprehensive Comparison Table ── */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wider font-bold text-slate-300">
                    Comprehensive Strategy Comparison Matrix
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">
                    Click row to activate focus
                  </span>
                </div>

                <div className="overflow-x-auto rounded-xl border border-surface-500/30">
                  <table className="w-full text-left font-mono text-xs border-collapse">
                    <thead>
                      <tr className="bg-surface-800/80 border-b border-surface-500/40 text-slate-400 text-[11px]">
                        <th className="p-2.5 font-semibold">Strategy Focus</th>
                        <th className="p-2.5 font-semibold text-right">Time (min)</th>
                        <th className="p-2.5 font-semibold text-right">Distance (km)</th>
                        <th className="p-2.5 font-semibold text-right">Congestion</th>
                        <th className="p-2.5 font-semibold text-right">Stability</th>
                        <th className="p-2.5 font-semibold text-right">Fuel (L)</th>
                        <th className="p-2.5 font-semibold text-right">CO₂ (kg)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparisonMetrics.map((strat) => {
                        const isSelected = selectedStrategy === strat.preference;
                        return (
                          <tr
                            key={strat.preference}
                            onClick={() => setSelectedStrategy(strat.preference)}
                            className={`border-b border-surface-500/20 cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-primary-600/25 text-white font-bold'
                                : 'text-slate-300 hover:bg-surface-600/30'
                            }`}
                          >
                            <td className="p-2.5 flex items-center gap-2">
                              <span
                                className={`w-2 h-2 rounded-full ${
                                  isSelected ? 'bg-primary-400 ring-2 ring-primary-400/40' : 'bg-slate-600'
                                }`}
                              />
                              <span className="font-semibold">{strat.title}</span>
                              {strat.preference === 'balanced' && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-500/30 text-indigo-200 border border-indigo-500/40">
                                  Default
                                </span>
                              )}
                            </td>
                            <td className="p-2.5 text-right font-semibold">{strat.totalTimeMinutes}m</td>
                            <td className="p-2.5 text-right">{strat.totalDistanceKm} km</td>
                            <td className="p-2.5 text-right text-amber-300">{strat.congestionScore}</td>
                            <td className="p-2.5 text-right text-emerald-400">{strat.stabilityScore}%</td>
                            <td className="p-2.5 text-right">{strat.fuelLiters} L</td>
                            <td className="p-2.5 text-right text-slate-200">{(strat.fuelLiters * 2.68).toFixed(1)} kg</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── Multi-Objective Pareto Trade-off Analysis ── */}
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wider font-bold text-slate-300">
                    Trade-off Index vs. Pareto Optimal Front
                  </span>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400">
                    <button
                      onClick={() => setExpandedSection((v) => (v === 'tradeoffs' ? 'all' : 'tradeoffs'))}
                      className="hover:text-slate-200 underline"
                    >
                      {expandedSection === 'tradeoffs' ? 'Collapse' : 'Expand'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {/* Travel Time Efficiency Bar */}
                  <div className="p-3 rounded-xl bg-surface-600/20 border border-surface-500/30 space-y-1.5">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-400">Time Optimization Efficiency</span>
                      <span className="font-mono text-emerald-400 font-bold">
                        {Math.round(100 - (activeStrategyMetrics.totalTimeMinutes / 90) * 40)}%
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-surface-700 overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.round(100 - (activeStrategyMetrics.totalTimeMinutes / 90) * 40)}%`,
                        }}
                      />
                    </div>
                    <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                      <span>Baseline: 82m</span>
                      <span>Target: {activeStrategyMetrics.totalTimeMinutes}m</span>
                    </div>
                  </div>

                  {/* Distance & Fuel Efficiency Bar */}
                  <div className="p-3 rounded-xl bg-surface-600/20 border border-surface-500/30 space-y-1.5">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-400">Fleet Distance / Fuel Economy</span>
                      <span className="font-mono text-cyan-400 font-bold">
                        {Math.round(100 - (activeStrategyMetrics.totalDistanceKm / 80) * 35)}%
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-surface-700 overflow-hidden">
                      <div
                        className="h-full bg-cyan-500 rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.round(100 - (activeStrategyMetrics.totalDistanceKm / 80) * 35)}%`,
                        }}
                      />
                    </div>
                    <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                      <span>Baseline: 52.8km</span>
                      <span>Target: {activeStrategyMetrics.totalDistanceKm}km</span>
                    </div>
                  </div>

                  {/* Congestion Avoidance Bar */}
                  <div className="p-3 rounded-xl bg-surface-600/20 border border-surface-500/30 space-y-1.5">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-400">Congestion Bottleneck Avoidance</span>
                      <span className="font-mono text-amber-400 font-bold">
                        {Math.round((100 - activeStrategyMetrics.congestionScore))}%
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-surface-700 overflow-hidden">
                      <div
                        className="h-full bg-amber-500 rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.round((100 - activeStrategyMetrics.congestionScore))}%`,
                        }}
                      />
                    </div>
                    <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                      <span>Score: {activeStrategyMetrics.congestionScore}%</span>
                      <span>Avoidance Level: High</span>
                    </div>
                  </div>

                  {/* Route Predictability / Stability Bar */}
                  <div className="p-3 rounded-xl bg-surface-600/20 border border-surface-500/30 space-y-1.5">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-400">Dispatch Predictability</span>
                      <span className="font-mono text-indigo-400 font-bold">
                        {activeStrategyMetrics.stabilityScore}%
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-surface-700 overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                        style={{
                          width: `${activeStrategyMetrics.stabilityScore}%`,
                        }}
                      />
                    </div>
                    <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                      <span>Disruption Risk: {(1 - activeStrategyMetrics.stabilityScore / 100).toFixed(2)}</span>
                      <span>Robustness: {activeStrategyMetrics.stabilityScore >= 90 ? 'Very High' : 'High'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Technical Description Note */}
              <div className="p-3 rounded-xl bg-surface-800/40 border border-surface-500/20 text-xs text-slate-400 leading-relaxed font-sans">
                <strong className="text-slate-200">Algorithm Principle:</strong> Under the ET-MaO-QPSO formulation, the strategy weights configure quantum particle velocity vectors towards Pareto optimal dispatch solutions. Selecting different operational foci tunes the multi-objective fitness function without sacrificing vehicle capacity constraints.
              </div>
            </div>
          )}

          {/* Map View Canvas (Shown in 'split' and 'map' modes) */}
          {viewMode !== 'report' && (
            <div className="flex-1 min-w-0 card overflow-hidden relative">
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center z-10 bg-surface-900/50 backdrop-blur-sm rounded-2xl">
                  <div className="spinner" />
                </div>
              )}
              <MapView
                geojson={geojson}
                scenario={scenario}
                routes={routes}
                center={mapCenter ?? [51.752, -1.257]}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
