import React, { useState, useEffect, useCallback } from 'react';
import { createEvent, listEvents, resolveEvent, analyzeImpact } from '../api/client';
import type { TrafficEventOut, ImpactAnalysisOut, ScenarioOut } from '../types';
import MapView from '../components/MapView';
import { getNetworkGeoJSON, getRoutes } from '../api/client';
import type { Route } from '../types';

const EVENT_TYPES = [
  { key: 'accident',        label: 'Accident',        color: 'text-rose-400',   bgColor: 'bg-rose-500/10 border-rose-500/30' },
  { key: 'road_closure',    label: 'Road Closure',    color: 'text-amber-400',  bgColor: 'bg-amber-500/10 border-amber-500/30' },
  { key: 'congestion_spike',label: 'Congestion Spike',color: 'text-orange-400', bgColor: 'bg-orange-500/10 border-orange-500/30' },
  { key: 'recovery',        label: 'Recovery',         color: 'text-emerald-400',bgColor: 'bg-emerald-500/10 border-emerald-500/30' },
];

const Traffic: React.FC = () => {
  const [scenario, setScenario] = useState<ScenarioOut | null>(null);
  const [geojson, setGeojson]   = useState<object | null>(null);
  const [routes, setRoutes]     = useState<Route[]>([]);
  const [events, setEvents]     = useState<TrafficEventOut[]>([]);
  const [impact, setImpact]     = useState<ImpactAnalysisOut | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // Event form state
  const [eventType,  setEventType]  = useState('accident');
  const [edgeU,      setEdgeU]      = useState('');
  const [edgeV,      setEdgeV]      = useState('');
  const [deltaTime,  setDeltaTime]  = useState(120);
  const [deltaCong,  setDeltaCong]  = useState(40);

  // Impact params
  const [threshold, setThreshold] = useState(50);
  const [alpha, setAlpha] = useState(0.4);
  const [beta,  setBeta]  = useState(0.3);
  const [gamma, setGamma] = useState(30);

  useEffect(() => {
    const raw = localStorage.getItem('router_scenario');
    if (!raw) return;
    const sc: ScenarioOut = JSON.parse(raw);
    setScenario(sc);
    const netId = Number(localStorage.getItem('router_network_id'));
    if (netId) {
      getNetworkGeoJSON(netId).then(r => setGeojson(r.data.geojson)).catch(() => {});
      getRoutes(sc.id).then(r => setRoutes(r.data)).catch(() => {});
      listEvents(sc.id).then(r => setEvents(r.data)).catch(() => {});
    }
  }, []);

  const handleCreateEvent = useCallback(async () => {
    if (!scenario || !edgeU || !edgeV) return;
    setLoading(true);
    setError(null);
    try {
      await createEvent({
        scenario_id: scenario.id,
        event_type: eventType,
        edge_u: Number(edgeU),
        edge_v: Number(edgeV),
        delta_time: deltaTime,
        delta_congestion: deltaCong,
      });
      const r = await listEvents(scenario.id);
      setEvents(r.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? e.message);
    } finally {
      setLoading(false);
    }
  }, [scenario, eventType, edgeU, edgeV, deltaTime, deltaCong]);

  const handleAnalyze = useCallback(async (eventId: number) => {
    if (!scenario) return;
    try {
      const r = await analyzeImpact({
        scenario_id: scenario.id,
        event_id: eventId,
        alpha, beta, gamma, threshold,
      });
      setImpact(r.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? e.message);
    }
  }, [scenario, alpha, beta, gamma, threshold]);

  const handleResolve = useCallback(async (eventId: number) => {
    await resolveEvent(eventId);
    if (scenario) {
      const r = await listEvents(scenario.id);
      setEvents(r.data);
    }
  }, [scenario]);

  const mapCenter: [number, number] | undefined =
    scenario?.depot_lat && scenario?.depot_lon
      ? [scenario.depot_lat, scenario.depot_lon]
      : undefined;

  return (
    <div className="flex h-full gap-4 p-4 animate-fade-in">
      {/* Left: Controls */}
      <div className="w-80 shrink-0 flex flex-col gap-4 overflow-y-auto">

        {!scenario && (
          <div className="card p-4 badge-warning">
            Load a network and generate a scenario first.
          </div>
        )}

        {/* Inject Event */}
        <div className="card p-5 flex flex-col gap-3">
          <div className="section-title text-base">Inject Traffic Event</div>

          <div>
            <label className="label">Event Type</label>
            <div className="flex flex-col gap-1.5">
              {EVENT_TYPES.map(et => (
                <label key={et.key} className={`flex items-center gap-2.5 p-2 rounded-xl cursor-pointer border text-sm transition-all ${
                  eventType === et.key ? et.bgColor : 'border-surface-400/20 hover:border-surface-400/40'
                }`}>
                  <input type="radio" name="eventType" value={et.key}
                    checked={eventType === et.key}
                    onChange={() => setEventType(et.key)}
                    className="accent-primary-500" />
                  <span className={eventType === et.key ? et.color : 'text-slate-400'}>{et.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Edge From (u)</label>
              <input value={edgeU} onChange={e => setEdgeU(e.target.value)}
                className="input" placeholder="node ID" />
            </div>
            <div>
              <label className="label">Edge To (v)</label>
              <input value={edgeV} onChange={e => setEdgeV(e.target.value)}
                className="input" placeholder="node ID" />
            </div>
          </div>

          {eventType !== 'road_closure' && (
            <>
              <div>
                <label className="label">ΔTime (seconds added)</label>
                <input type="number" min={0} value={deltaTime}
                  onChange={e => setDeltaTime(Number(e.target.value))} className="input" />
              </div>
              <div>
                <label className="label">ΔCongestion (0–100)</label>
                <input type="number" min={0} max={100} value={deltaCong}
                  onChange={e => setDeltaCong(Number(e.target.value))} className="input" />
              </div>
            </>
          )}

          <button id="inject-event-btn" onClick={handleCreateEvent}
            disabled={loading || !scenario || !edgeU || !edgeV}
            className="btn-danger justify-center">
            {loading ? 'Injecting…' : 'Apply Event'}
          </button>
        </div>

        {/* Impact Analyzer */}
        <div className="card p-4 flex flex-col gap-3">
          <div className="section-title text-base">Impact Analyzer</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              { label: 'α (time weight)', val: alpha, set: setAlpha, step: 0.1 },
              { label: 'β (cong weight)', val: beta, set: setBeta, step: 0.1 },
              { label: 'γ (exposure)', val: gamma, set: setGamma, step: 5 },
              { label: 'θ threshold', val: threshold, set: setThreshold, step: 10 },
            ].map(f => (
              <div key={f.label}>
                <label className="label text-[10px]">{f.label}</label>
                <input type="number" step={f.step} value={f.val}
                  onChange={e => f.set(Number(e.target.value))} className="input" />
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-600">
            Formula: I = α·ΔT + β·ΔC + γ·E_r  &gt;  θ → reoptimize
          </p>
        </div>

        {error && (
          <div className="card p-3 border-rose-500/30 text-rose-400 text-xs">{error}</div>
        )}

        {/* Impact result */}
        {impact && (
          <div className={`card p-4 flex flex-col gap-2 animate-fade-in border ${
            impact.significant ? 'border-rose-500/40' : 'border-emerald-500/40'
          }`}>
            <div className={impact.significant ? 'badge-danger' : 'badge-success'}>
              {impact.significant ? 'Reoptimization triggered' : 'No reoptimization needed'}
            </div>
            <div className="text-sm font-mono text-slate-300">
              Score: <span className="text-amber-400">{impact.impact_score.toFixed(2)}</span>
              {' / '}
              <span className="text-slate-500">θ {impact.threshold}</span>
            </div>
            <div className="text-xs text-slate-500">
              {impact.route_exposure} routes exposed · {impact.affected_vehicle_ids.length} vehicles affected
            </div>
          </div>
        )}
      </div>

      {/* Centre: Map */}
      <div className="flex-1 min-w-0 card overflow-hidden">
        <MapView geojson={geojson} scenario={scenario} routes={routes}
          center={mapCenter ?? [51.752, -1.257]} />
      </div>

      {/* Right: Event list */}
      <div className="w-72 shrink-0 card p-4 flex flex-col gap-3 overflow-y-auto">
        <div className="section-title text-base">Active Events</div>
        {events.filter(e => e.active).length === 0 && (
          <div className="text-sm text-slate-500">No active events.</div>
        )}
        {events.filter(e => e.active).map(evt => {
          const et = EVENT_TYPES.find(t => t.key === evt.event_type);
          return (
            <div key={evt.id} className={`card p-3 flex flex-col gap-2 border ${et?.bgColor ?? ''} animate-fade-in`}>
              <div className="flex items-center justify-between">
                <span className={`text-sm font-medium ${et?.color}`}>{et?.label ?? evt.event_type}</span>
                <span className="text-xs text-slate-500">#{evt.id}</span>
              </div>
              <div className="text-xs text-slate-500">
                Edge: {evt.edge_u} → {evt.edge_v}
              </div>
              {!evt.road_closed && (
                <div className="text-xs text-slate-500">
                  +{evt.delta_time}s · cong +{evt.delta_congestion}
                </div>
              )}
              {evt.impact_score != null && (
                <div className="text-xs font-mono text-amber-400">
                  Impact: {evt.impact_score.toFixed(2)}
                  {evt.triggered_reopt && <span className="ml-2 badge-danger text-[10px]">Triggered</span>}
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => handleAnalyze(evt.id)}
                  className="btn btn-secondary btn-sm flex-1">
                  Analyze
                </button>
                <button onClick={() => handleResolve(evt.id)}
                  className="btn btn-success btn-sm flex-1">
                  Resolve
                </button>
              </div>
            </div>
          );
        })}

        <div className="divider" />
        <div className="section-title text-sm text-slate-500">History</div>
        {events.filter(e => !e.active).map(evt => (
          <div key={evt.id} className="text-xs text-slate-600 flex justify-between">
            <span>#{evt.id} {evt.event_type}</span>
            <span className="badge-success text-[10px]">resolved</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Traffic;
