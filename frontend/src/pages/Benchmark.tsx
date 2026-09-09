import React, { useState, useCallback, useEffect } from 'react';
import { runBenchmark } from '../api/client';
import type { BenchmarkResultOut, AlgorithmResult, ScenarioOut } from '../types';
import ConvergenceChart from '../components/ConvergenceChart';

const ALGO_META = {
  qpso:  { label: 'ET-MaO-QPSO', color: '#8b5cf6', chipClass: 'chip-qpso',  desc: 'Proposed' },
  pso:   { label: 'Classical PSO', color: '#06b6d4', chipClass: 'chip-pso',  desc: 'Baseline' },
  nsga2: { label: 'NSGA-II',      color: '#f59e0b', chipClass: 'chip-nsga2', desc: 'Benchmark' },
};

const fmt = (v?: number | null, dec = 1, unit = '') =>
  v == null ? '—' : `${v.toFixed(dec)}${unit}`;

const CompareBar: React.FC<{ values: (number | null)[]; colors: string[] }> = ({ values, colors }) => {
  const max = Math.max(...values.map(v => v ?? 0));
  return (
    <div className="flex flex-col gap-1">
      {values.map((v, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-32 progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${max > 0 && v != null ? (v / max) * 100 : 0}%`, background: colors[i] }}
            />
          </div>
          <span className="text-xs font-mono text-slate-400" style={{ color: colors[i] }}>
            {fmt(v)}
          </span>
        </div>
      ))}
    </div>
  );
};

const Benchmark: React.FC = () => {
  const [scenario, setScenario] = useState<ScenarioOut | null>(null);
  const [nParticles, setNParticles] = useState(15);
  const [maxIter, setMaxIter]     = useState(25);
  const [result, setResult]        = useState<BenchmarkResultOut | null>(null);
  const [loading, setLoading]      = useState(false);
  const [error, setError]          = useState<string | null>(null);
  const [progress, setProgress]    = useState(0);

  useEffect(() => {
    const raw = localStorage.getItem('router_scenario');
    if (raw) setScenario(JSON.parse(raw));
  }, []);

  const handleRun = useCallback(async () => {
    if (!scenario) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setProgress(0);
    const tick = setInterval(() => setProgress(p => Math.min(p + 1, 90)), 400);
    try {
      const res = await runBenchmark({
        scenario_id: scenario.id,
        n_particles: nParticles,
        max_iterations: maxIter,
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
  }, [scenario, nParticles, maxIter]);

  const byAlgo = (algo: string): AlgorithmResult | undefined =>
    result?.results.find(r => r.algorithm === algo);

  const algos = ['pso', 'nsga2', 'qpso'] as const;
  const colors = algos.map(a => ALGO_META[a].color);

  const convergenceSeries = result
    ? result.results.map(r => ({
        algorithm: r.algorithm,
        data: r.convergence_data,
        color: ALGO_META[r.algorithm as keyof typeof ALGO_META]?.color ?? '#6366f1',
      }))
    : [];

  return (
    <div className="flex h-full gap-4 p-4 animate-fade-in">
      {/* Left config */}
      <div className="w-72 shrink-0 flex flex-col gap-4 overflow-y-auto">
        <div className="card p-4">
          {scenario
            ? <div className="badge-success">Scenario: {scenario.name}</div>
            : <div className="badge-warning">No scenario loaded. Go to Network first.</div>
          }
        </div>

        <div className="card p-4 flex flex-col gap-3">
          <div className="section-title text-base">Benchmark Settings</div>
          <div>
            <label className="label">Particles / Population</label>
            <input type="number" min={5} max={100} value={nParticles}
              onChange={e => setNParticles(Number(e.target.value))} className="input" />
          </div>
          <div>
            <label className="label">Max Iterations</label>
            <input type="number" min={5} max={200} value={maxIter}
              onChange={e => setMaxIter(Number(e.target.value))} className="input" />
          </div>
          <div className="card p-3 flex flex-col gap-2">
            <div className="text-xs text-slate-500 font-medium">Algorithms compared:</div>
            {algos.map(a => (
              <div key={a} className="flex items-center gap-2">
                <span className={ALGO_META[a].chipClass}>{ALGO_META[a].label}</span>
                <span className="text-xs text-slate-600">{ALGO_META[a].desc}</span>
              </div>
            ))}
          </div>
          <button id="run-benchmark-btn" onClick={handleRun}
            disabled={loading || !scenario}
            className="btn-primary justify-center">
            {loading
              ? <><span className="spinner !w-5 !h-5 !border-2" /> Running 3 algorithms…</>
              : 'Run Full Benchmark'
            }
          </button>
          {loading && (
            <div className="progress-bar">
              <div className="progress-fill bg-primary-500" style={{ width: `${progress}%` }} />
            </div>
          )}
          {error && <div className="text-rose-400 text-xs">{error}</div>}
        </div>
      </div>

      {/* Centre: Comparison table */}
      <div className="flex-1 min-w-0 flex flex-col gap-4 overflow-y-auto">
        {/* Header cards */}
        <div className="grid grid-cols-3 gap-4">
          {algos.map(algo => {
            const r = byAlgo(algo);
            const meta = ALGO_META[algo];
            return (
              <div key={algo} className={`card p-5 flex flex-col gap-3 ${
                algo === 'qpso' ? 'border-primary-500/40' : ''
              }`} style={{ borderColor: algo === 'qpso' ? `${meta.color}40` : undefined }}>
                <div className="flex items-center gap-2">
                  <span className={meta.chipClass}>{meta.label}</span>
                  <span className="text-xs text-slate-500">{meta.desc}</span>
                </div>
                {r ? (
                  <>
                    <div className="stat-card !p-0 !bg-transparent !border-0 !shadow-none">
                      <div className="stat-value" style={{ color: meta.color }}>
                        {r.num_pareto_solutions}
                      </div>
                      <div className="stat-label">Pareto Solutions</div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <span className="text-slate-500">Hypervolume</span>
                      <span className="text-slate-200 font-mono">{fmt(r.hypervolume, 3)}</span>
                      <span className="text-slate-500">Best Time</span>
                      <span className="text-slate-200 font-mono">{fmt(r.best_time, 1, 's')}</span>
                      <span className="text-slate-500">Best Dist</span>
                      <span className="text-slate-200 font-mono">{fmt(r.best_distance, 0, 'm')}</span>
                      <span className="text-slate-500">Runtime</span>
                      <span className="text-slate-200 font-mono">{fmt(r.runtime_seconds, 2, 's')}</span>
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-slate-600">Not run yet</div>
                )}
              </div>
            );
          })}
        </div>

        {/* Comparative bars */}
        {result && (
          <div className="card p-5 flex flex-col gap-5 animate-fade-in">
            <div className="section-title">Side-by-Side Comparison</div>
            {[
              { label: 'Pareto Solutions (more = better)',  vals: algos.map(a => byAlgo(a)?.num_pareto_solutions ?? null) },
              { label: 'Hypervolume (higher = better)',     vals: algos.map(a => byAlgo(a)?.hypervolume ?? null) },
              { label: 'Best Travel Time ↓ (lower = better)', vals: algos.map(a => byAlgo(a)?.best_time ?? null) },
              { label: 'Best Distance ↓ (lower = better)',  vals: algos.map(a => byAlgo(a)?.best_distance ?? null) },
              { label: 'Runtime (s)',                        vals: algos.map(a => byAlgo(a)?.runtime_seconds ?? null) },
            ].map(row => (
              <div key={row.label} className="flex flex-col gap-2">
                <div className="text-xs text-slate-400 font-medium">{row.label}</div>
                <div className="flex gap-6">
                  {algos.map((a) => (
                    <div key={a} className="flex items-center gap-2">
                      <span className={ALGO_META[a].chipClass + ' text-[10px]'}>{ALGO_META[a].label}</span>
                    </div>
                  ))}
                </div>
                <CompareBar values={row.vals} colors={colors} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right: Convergence */}
      <div className="w-72 shrink-0 card p-4 flex flex-col gap-3">
        <div className="section-title text-base">Convergence Comparison</div>
        <div className="flex-1 min-h-[300px]">
          <ConvergenceChart
            series={convergenceSeries}
            title="Hypervolume vs Iteration"
          />
        </div>

        {result && (
          <>
            <div className="divider" />
            <div className="text-xs text-slate-500">
              <p className="font-medium text-slate-400 mb-1">Research Hypotheses</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>H1: ET-MaO-QPSO competitive with/better than PSO & NSGA-II</li>
                <li>H2: Quantum search improves exploration vs classical PSO</li>
                <li>H4: Event-triggered approach reduces unnecessary computation</li>
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Benchmark;
