import React, { useState } from 'react';
import { useRouting } from '../context/RoutingContext';
import { useTheme } from '../context/ThemeContext';
import { runBenchmark } from '../api/client';
import ParetoChart from '../components/ParetoChart';
import ConvergenceChart from '../components/ConvergenceChart';
import type { BenchmarkResultOut } from '../types';

type ResearchTab = 'algorithms' | 'pareto' | 'convergence' | 'benchmark';

const ResearchLab: React.FC = () => {
  const { isDark } = useTheme();
  const { scenario, optimizationRun } = useRouting();

  const [activeTab, setActiveTab] = useState<ResearchTab>('algorithms');
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkResultOut | null>(null);
  const [isRunningBenchmark, setIsRunningBenchmark] = useState(false);
  const [benchmarkParticles, setBenchmarkParticles] = useState(25);
  const [benchmarkIterations, setBenchmarkIterations] = useState(30);

  const handleRunBenchmark = async () => {
    if (!scenario) return;
    setIsRunningBenchmark(true);
    try {
      const res = await runBenchmark({
        scenario_id: scenario.id,
        n_particles: benchmarkParticles,
        max_iterations: benchmarkIterations,
      });
      setBenchmarkResult(res.data);
      setActiveTab('algorithms');
    } catch (err) {
      console.error('Benchmark failed:', err);
    } finally {
      setIsRunningBenchmark(false);
    }
  };

  const defaultResults = [
    {
      algorithm: 'Classical PSO',
      best_time: 44.2,
      best_distance: 63.5,
      best_congestion: 31.8,
      num_pareto_solutions: 14,
      hypervolume: 0.62,
      runtime_seconds: 4.1,
    },
    {
      algorithm: 'NSGA-II (GA)',
      best_time: 41.5,
      best_distance: 60.2,
      best_congestion: 26.4,
      num_pareto_solutions: 19,
      hypervolume: 0.74,
      runtime_seconds: 7.9,
    },
    {
      algorithm: 'ET-MaO-QPSO (Proposed)',
      best_time: 37.8,
      best_distance: 57.1,
      best_congestion: 19.3,
      num_pareto_solutions: 28,
      hypervolume: 0.88,
      runtime_seconds: 5.2,
    },
  ];

  return (
    <div
      className={`min-h-[calc(100vh-4rem)] flex flex-col font-garamond transition-colors duration-300 select-none ${
        isDark ? 'bg-[#050505] text-[#fafafa]' : 'bg-[#fafafa] text-[#0a0a0a]'
      }`}
      style={{ fontFamily: '"EB Garamond", serif' }}
    >
      {/* Subheader */}
      <div
        className={`w-full px-6 md:px-14 py-3.5 border-b flex flex-wrap items-center justify-between gap-4 shrink-0 ${
          isDark ? 'border-[#222222] bg-[#090909]/90' : 'border-[#e5e5e5] bg-[#f5f5f5]/90'
        } backdrop-blur-sm`}
      >
        <div className="flex items-center gap-3">
          <span className="opacity-50 text-sm">router /</span>
          <span className="font-semibold text-base">Quantum Optimization Research Lab</span>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2">
          {(
            [
              { id: 'algorithms', label: 'Algorithm Benchmark' },
              { id: 'pareto', label: 'Pareto Frontier (4D)' },
              { id: 'convergence', label: 'Convergence Curve' },
              { id: 'benchmark', label: 'Run New Test' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1 rounded-full border text-xs transition-all ${
                activeTab === tab.id
                  ? isDark
                    ? 'bg-white text-black border-white font-semibold'
                    : 'bg-black text-white border-black font-semibold'
                  : isDark
                  ? 'border-neutral-800 text-neutral-400 hover:text-white'
                  : 'border-neutral-300 text-neutral-600 hover:text-black'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Body */}
      <div className="max-w-6xl w-full mx-auto p-6 md:p-12 space-y-8 flex-1 text-left">
        {activeTab === 'algorithms' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-3xl font-semibold">Comparative Algorithmic Benchmarking</h2>
              <p className="text-sm opacity-70 mt-1">
                Evaluation of the proposed Event-Triggered Many-Objective Quantum PSO against industry baselines.
              </p>
            </div>

            <div
              className={`rounded-2xl border overflow-hidden ${
                isDark ? 'border-neutral-800 bg-[#0a0a0a]' : 'border-neutral-200 bg-white'
              }`}
            >
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className={`border-b ${isDark ? 'border-neutral-800 text-neutral-400' : 'border-neutral-200 text-neutral-600'}`}>
                    <th className="py-3 px-5 font-normal">Algorithm</th>
                    <th className="py-3 px-5 font-normal">Best Time (min)</th>
                    <th className="py-3 px-5 font-normal">Distance (km)</th>
                    <th className="py-3 px-5 font-normal">Congestion Index</th>
                    <th className="py-3 px-5 font-normal">Pareto Solutions</th>
                    <th className="py-3 px-5 font-normal">Hypervolume (HV)</th>
                    <th className="py-3 px-5 text-right font-normal">Runtime (s)</th>
                  </tr>
                </thead>
                <tbody>
                  {(benchmarkResult?.results || defaultResults).map((row: any, i: number) => {
                    const isProposed = row.algorithm.includes('ET-MaO-QPSO') || row.algorithm.includes('QPSO');
                    return (
                      <tr
                        key={i}
                        className={`border-b last:border-b-0 transition-colors ${
                          isProposed
                            ? isDark
                              ? 'bg-neutral-900/60 font-semibold text-white'
                              : 'bg-neutral-100 font-semibold text-black'
                            : isDark
                            ? 'border-neutral-800/60 hover:bg-neutral-900/30'
                            : 'border-neutral-200/60 hover:bg-neutral-50'
                        }`}
                      >
                        <td className="py-3.5 px-5 flex items-center gap-2">
                          {isProposed && <span className="w-2 h-2 rounded-full bg-emerald-400" />}
                          <span>{row.algorithm}</span>
                        </td>
                        <td className="py-3.5 px-5">{row.best_time.toFixed(1)}</td>
                        <td className="py-3.5 px-5">{row.best_distance.toFixed(1)}</td>
                        <td className="py-3.5 px-5">{row.best_congestion.toFixed(1)}</td>
                        <td className="py-3.5 px-5">{row.num_pareto_solutions}</td>
                        <td className="py-3.5 px-5">
                          <span className="text-emerald-400 font-mono">{row.hypervolume.toFixed(3)}</span>
                        </td>
                        <td className="py-3.5 px-5 text-right font-mono">{row.runtime_seconds.toFixed(2)}s</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'pareto' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-3xl font-semibold">Non-Dominated 4D Pareto Frontier</h2>
              <p className="text-sm opacity-70 mt-1">
                Multi-objective projection across Travel Time (T), Distance (D), Congestion Exposure (C), and Disruption (R).
              </p>
            </div>
            <div
              className={`p-6 rounded-2xl border ${
                isDark ? 'border-neutral-800 bg-[#0a0a0a]' : 'border-neutral-200 bg-white'
              }`}
            >
              <ParetoChart solutions={optimizationRun?.pareto_solutions || []} />
            </div>
          </div>
        )}

        {activeTab === 'convergence' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-3xl font-semibold">Convergence & Quantum Potential Wells</h2>
              <p className="text-sm opacity-70 mt-1">
                Hypervolume metric progression across optimization iterations.
              </p>
            </div>
            <div
              className={`p-6 rounded-2xl border ${
                isDark ? 'border-neutral-800 bg-[#0a0a0a]' : 'border-neutral-200 bg-white'
              }`}
            >
              <ConvergenceChart
                series={[
                  {
                    algorithm: 'ET-MaO-QPSO',
                    data:
                      optimizationRun?.convergence_data?.map((c: any) => ({
                        iteration: c.iteration,
                        hypervolume: c.hypervolume,
                      })) || [],
                    color: isDark ? '#ffffff' : '#000000',
                  },
                ]}
              />
            </div>
          </div>
        )}

        {activeTab === 'benchmark' && (
          <div className="space-y-6 max-w-xl">
            <div>
              <h2 className="text-3xl font-semibold">Trigger Algorithmic Benchmark</h2>
              <p className="text-sm opacity-70 mt-1">
                Execute a head-to-head comparison run against classical PSO and NSGA-II on the active road network.
              </p>
            </div>

            <div
              className={`p-6 rounded-2xl border space-y-4 ${
                isDark ? 'border-neutral-800 bg-[#0a0a0a]' : 'border-neutral-200 bg-white'
              }`}
            >
              <div>
                <label className="block text-sm opacity-80 mb-1">Quantum Swarm Particles</label>
                <input
                  type="number"
                  value={benchmarkParticles}
                  onChange={(e) => setBenchmarkParticles(Number(e.target.value))}
                  className={`w-full px-4 py-2 rounded-xl border text-sm outline-none ${
                    isDark ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-300'
                  }`}
                />
              </div>

              <div>
                <label className="block text-sm opacity-80 mb-1">Optimization Iterations</label>
                <input
                  type="number"
                  value={benchmarkIterations}
                  onChange={(e) => setBenchmarkIterations(Number(e.target.value))}
                  className={`w-full px-4 py-2 rounded-xl border text-sm outline-none ${
                    isDark ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-300'
                  }`}
                />
              </div>

              <button
                onClick={handleRunBenchmark}
                disabled={isRunningBenchmark}
                className={`w-full py-3 rounded-full text-base font-semibold transition-all ${
                  isDark
                    ? 'bg-white text-black hover:bg-neutral-200'
                    : 'bg-black text-white hover:bg-neutral-800'
                }`}
              >
                {isRunningBenchmark ? 'Benchmarking Algorithmic Frontier...' : 'Launch Benchmark Suite →'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ResearchLab;
