import React, { useState, useCallback, useEffect } from 'react';
import { runOptimization, selectRoute } from '../api/client';
import type { OptimizationRunOut, ParetoSolution, ScenarioOut, SelectionStrategy } from '../types';
import MetricsPanel from '../components/MetricsPanel';
import ParetoChart from '../components/ParetoChart';
import ConvergenceChart from '../components/ConvergenceChart';

const ALGO_INFO = {
  qpso:  { label: 'ET-MaO-QPSO (Proposed)', color: '#8b5cf6', chip: 'chip-qpso' },
  pso:   { label: 'Classical PSO (Baseline)', color: '#06b6d4', chip: 'chip-pso' },
  nsga2: { label: 'NSGA-II (Benchmark)', color: '#f59e0b', chip: 'chip-nsga2' },
};

const STRATEGIES: SelectionStrategy[] = [
  'balanced', 'min_time', 'min_congestion', 'min_disruption', 'lexicographic',
];

const Optimizer: React.FC = () => {
  const [scenario, setScenario] = useState<ScenarioOut | null>(null);
  const [algorithm, setAlgorithm] = useState<'qpso' | 'pso' | 'nsga2'>('qpso');
  const [nParticles, setNParticles] = useState(20);
  const [maxIter, setMaxIter]     = useState(40);
  const [betaMax, setBetaMax]     = useState(1.0);
  const [betaMin, setBetaMin]     = useState(0.5);
  const [archiveSize, setArchiveSize] = useState(100);
  const [strategy, setStrategy]   = useState<SelectionStrategy>('balanced');

  const [result, setResult] = useState<OptimizationRunOut | null>(null);
  const [selectedSol, setSelectedSol] = useState<ParetoSolution | null>(null);
  const [loading, setLoading]  = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [error, setError]      = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const raw = localStorage.getItem('router_scenario');
    if (raw) setScenario(JSON.parse(raw));
  }, []);

  const handleRun = useCallback(async () => {
    if (!scenario) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setSelectedSol(null);
    setProgress(0);

    // Fake progress (the real call is synchronous)
    const tick = setInterval(() => setProgress(p => Math.min(p + 2, 90)), 200);

    try {
      const res = await runOptimization({
        scenario_id: scenario.id,
        algorithm,
        n_particles: nParticles,
        max_iterations: maxIter,
        beta_max: betaMax,
        beta_min: betaMin,
        archive_size: archiveSize,
      });
      clearInterval(tick);
      setProgress(100);
      setResult(res.data);
    } catch (e: any) {
      clearInterval(tick);
      setError(e?.response?.data?.detail ?? e.message);
    } finally {
      setLoading(false);
    }
  }, [scenario, algorithm, nParticles, maxIter, betaMax, betaMin, archiveSize]);

  const handleDeploy = useCallback(async () => {
    if (!result) return;
    setDeploying(true);
    try {
      await selectRoute({ run_id: result.id, strategy });
      alert(`Routes deployed using "${strategy}" strategy.`);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? e.message);
    } finally {
      setDeploying(false);
    }
  }, [result, strategy]);

  const convergenceSeries = result
    ? [{ algorithm: result.algorithm, data: result.convergence_data, color: ALGO_INFO[result.algorithm as keyof typeof ALGO_INFO]?.color ?? '#6366f1' }]
    : [];

  return (
    <div className="flex h-full gap-4 p-4 animate-fade-in">
      {/* Left: Config + Metrics */}
      <div className="w-72 shrink-0 flex flex-col gap-4 overflow-y-auto">

        {/* Scenario check */}
        <div className="card p-4">
          {scenario
            ? <div className="badge-success">Scenario: {scenario.name}</div>
            : <div className="badge-warning">No scenario loaded. Go to Network first.</div>
          }
          {scenario && (
            <div className="text-xs text-slate-500 mt-2">
              {scenario.vehicles.length}v · {scenario.customers.length}c · ID {scenario.id}
            </div>
          )}
        </div>

        {/* Algorithm selector */}
        <div className="card p-4 flex flex-col gap-3">
          <div className="section-title text-base">Algorithm</div>
          <div className="flex flex-col gap-2">
            {Object.entries(ALGO_INFO).map(([key, info]) => (
              <label key={key} className={`flex items-center gap-2.5 p-2.5 rounded-xl cursor-pointer border transition-all ${
                algorithm === key
                  ? 'border-primary-500/50 bg-primary-600/10'
                  : 'border-surface-400/20 hover:border-surface-400/40'
              }`}>
                <input
                  type="radio" name="algorithm" value={key}
                  checked={algorithm === key}
                  onChange={() => setAlgorithm(key as any)}
                  className="accent-primary-500"
                />
                <span className="text-sm text-slate-200">{info.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Params */}
        <div className="card p-4 flex flex-col gap-3">
          <div className="section-title text-base">Parameters</div>
          {[
            { label: 'Population / Particles', val: nParticles, set: setNParticles, min: 5, max: 200 },
            { label: 'Max Iterations', val: maxIter, set: setMaxIter, min: 5, max: 500 },
          ].map(f => (
            <div key={f.label}>
              <label className="label">{f.label}</label>
              <input type="number" min={f.min} max={f.max} value={f.val}
                onChange={e => f.set(Number(e.target.value))} className="input" />
            </div>
          ))}

          {algorithm === 'qpso' && (
            <>
              <div>
                <label className="label">β max (contraction-expansion)</label>
                <input type="number" step={0.1} min={0.1} max={2} value={betaMax}
                  onChange={e => setBetaMax(Number(e.target.value))} className="input" />
              </div>
              <div>
                <label className="label">β min</label>
                <input type="number" step={0.1} min={0.1} max={2} value={betaMin}
                  onChange={e => setBetaMin(Number(e.target.value))} className="input" />
              </div>
              <div>
                <label className="label">Archive Size</label>
                <input type="number" min={10} max={500} value={archiveSize}
                  onChange={e => setArchiveSize(Number(e.target.value))} className="input" />
              </div>
            </>
          )}
        </div>

        {/* Run */}
        <button id="run-optimizer-btn" onClick={handleRun}
          disabled={loading || !scenario} className="btn-primary justify-center text-base">
          {loading ? <><span className="spinner !w-5 !h-5 !border-2" /> Running…</> : 'Run Optimizer'}
        </button>

        {loading && (
          <div className="progress-bar">
            <div className="progress-fill bg-primary-500" style={{ width: `${progress}%` }} />
          </div>
        )}

        {/* Metrics */}
        {result && (
          <MetricsPanel
            objectives={selectedSol?.objectives ?? result.pareto_solutions[0]?.objectives}
            archiveSummary={result.archive_summary}
            runtime={result.runtime_seconds}
            algorithm={result.algorithm}
          />
        )}

        {error && (
          <div className="card p-3 border-rose-500/30 text-rose-400 text-xs">{error}</div>
        )}
      </div>

      {/* Centre: Pareto scatter */}
      <div className="flex-1 min-w-0 card p-4 flex flex-col gap-3">
        <div className="section-title">Pareto-Optimal Front</div>
        <div className="flex-1 min-h-0">
          <ParetoChart
            solutions={result?.pareto_solutions ?? []}
            selectedId={selectedSol?.id}
            onSelect={setSelectedSol}
          />
        </div>

        {/* Deploy controls */}
        {result && (
          <div className="divider" />
        )}
        {result && (
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <label className="label">Selection Strategy</label>
              <select className="input w-44"
                value={strategy} onChange={e => setStrategy(e.target.value as SelectionStrategy)}>
                {STRATEGIES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <button id="deploy-routes-btn" onClick={handleDeploy}
              disabled={deploying || !result} className="btn-success mt-4">
              {deploying ? 'Deploying…' : 'Deploy Routes'}
            </button>
          </div>
        )}
      </div>

      {/* Right: Convergence */}
      <div className="w-72 shrink-0 card p-4 flex flex-col gap-3">
        <div className="section-title text-base">Convergence</div>
        <div className="flex-1 min-h-[200px]">
          <ConvergenceChart series={convergenceSeries} />
        </div>

        {/* Solution details */}
        {selectedSol && (
          <div className="card p-3 flex flex-col gap-2 animate-fade-in">
            <div className="text-xs font-semibold text-slate-300">Selected Solution #{selectedSol.id}</div>
            {Object.entries(selectedSol.objectives).map(([k, v]) => (
              <div key={k} className="flex justify-between text-xs">
                <span className="text-slate-500 capitalize">{k}</span>
                <span className="text-slate-200 font-mono">{(v as number).toFixed(2)}</span>
              </div>
            ))}
            <div className="divider !my-1" />
            {Object.entries(selectedSol.route_data).map(([vid, custs]) => (
              <div key={vid} className="text-xs text-slate-500">
                V{vid}: {(custs as number[]).join(' → ')}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Optimizer;
