import React from 'react';
import type { Objectives } from '../types';

interface MetricsPanelProps {
  objectives?: Objectives | null;
  archiveSummary?: {
    size: number;
    hypervolume: number;
    min: Objectives;
    max: Objectives;
  } | null;
  runtime?: number | null;
  algorithm?: string;
}

const fmt = (v?: number | null, unit = '') =>
  v == null ? '—' : `${v.toFixed(1)}${unit}`;

const METRICS = [
  { key: 'time',       label: 'Travel Time',  unit: 's',  color: 'text-primary-400' },
  { key: 'distance',   label: 'Distance',     unit: 'm',  color: 'text-cyan-400' },
  { key: 'congestion', label: 'Congestion',   unit: '',   color: 'text-amber-400' },
  { key: 'disruption', label: 'Disruption',   unit: '',   color: 'text-rose-400' },
] as const;

const MetricsPanel: React.FC<MetricsPanelProps> = ({
  objectives, archiveSummary, runtime, algorithm
}) => {
  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      {/* Algorithm badge */}
      {algorithm && (
        <div className="flex items-center gap-2">
          <span className={
            algorithm === 'qpso' ? 'chip-qpso' :
            algorithm === 'pso'  ? 'chip-pso'  :
            'chip-nsga2'
          }>
            {algorithm.toUpperCase()}
          </span>
          {runtime != null && (
            <span className="text-xs text-slate-500">
              ran in {runtime.toFixed(2)}s
            </span>
          )}
        </div>
      )}

      {/* Four objective cards */}
      <div className="grid grid-cols-2 gap-3">
        {METRICS.map(m => (
          <div key={m.key} className="stat-card">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="stat-label">{m.label}</span>
            </div>
            <div className={`stat-value ${m.color}`}>
              {fmt(objectives?.[m.key as keyof Objectives], m.unit)}
            </div>
            {archiveSummary && (
              <div className="text-xs text-slate-600 mt-1">
                min {fmt(archiveSummary.min[m.key as keyof Objectives], m.unit)}
                {' / '}
                max {fmt(archiveSummary.max[m.key as keyof Objectives], m.unit)}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Archive summary */}
      {archiveSummary && (
        <div className="card p-3 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="stat-label">Pareto Archive</span>
            <span className="stat-value text-emerald-400">{archiveSummary.size}</span>
            <span className="text-xs text-slate-600">non-dominated solutions</span>
          </div>
          <div className="flex flex-col text-right">
            <span className="stat-label">Hypervolume</span>
            <span className="stat-value text-violet-400">
              {archiveSummary.hypervolume.toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default MetricsPanel;
