import React, { useState } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from 'recharts';
import type { ParetoSolution } from '../types';

interface ParetoChartProps {
  solutions: ParetoSolution[];
  selectedId?: number | null;
  onSelect?: (sol: ParetoSolution) => void;
}

const AXES = [
  { key: 'time',       label: 'Time (s)' },
  { key: 'distance',   label: 'Distance (m)' },
  { key: 'congestion', label: 'Congestion' },
  { key: 'disruption', label: 'Disruption' },
] as const;

const CustomDot = ({ cx, cy, payload, selectedId, onClick }: any) => {
  const isSelected = payload.id === selectedId;
  return (
    <circle
      cx={cx} cy={cy}
      r={isSelected ? 8 : 5}
      fill={isSelected ? '#f59e0b' : '#6366f1'}
      fillOpacity={isSelected ? 1 : 0.75}
      stroke={isSelected ? '#fbbf24' : '#818cf8'}
      strokeWidth={isSelected ? 2 : 1}
      style={{ cursor: 'pointer' }}
      onClick={() => onClick?.(payload)}
    />
  );
};

const ParetoChart: React.FC<ParetoChartProps> = ({ solutions, selectedId, onSelect }) => {
  const [xAxis, setXAxis] = useState<'time' | 'distance' | 'congestion' | 'disruption'>('time');
  const [yAxis, setYAxis] = useState<'time' | 'distance' | 'congestion' | 'disruption'>('distance');

  const data = solutions.map(s => ({
    id: s.id,
    x: s.objectives[xAxis],
    y: s.objectives[yAxis],
    ...s.objectives,
    is_selected: s.is_selected,
  }));

  const xLabel = AXES.find(a => a.key === xAxis)?.label ?? xAxis;
  const yLabel = AXES.find(a => a.key === yAxis)?.label ?? yAxis;

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Axis selectors */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex flex-col gap-1">
          <label className="label">X Axis</label>
          <select
            className="input w-36"
            value={xAxis}
            onChange={e => setXAxis(e.target.value as any)}
          >
            {AXES.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="label">Y Axis</label>
          <select
            className="input w-36"
            value={yAxis}
            onChange={e => setYAxis(e.target.value as any)}
          >
            {AXES.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
          </select>
        </div>
        <div className="flex items-end">
          <span className="badge-primary text-xs">{solutions.length} non-dominated solutions</span>
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2d2d4e" />
            <XAxis
              type="number"
              dataKey="x"
              name={xLabel}
              label={{ value: xLabel, position: 'insideBottomRight', offset: -10, fill: '#64748b', fontSize: 11 }}
              tick={{ fill: '#64748b', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: '#3a3a60' }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name={yLabel}
              label={{ value: yLabel, angle: -90, position: 'insideLeft', offset: 10, fill: '#64748b', fontSize: 11 }}
              tick={{ fill: '#64748b', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: '#3a3a60' }}
            />
            <Tooltip
              cursor={{ strokeDasharray: '3 3', stroke: '#3a3a60' }}
              contentStyle={{
                background: 'rgba(22,22,40,0.95)',
                border: '1px solid rgba(99,102,241,0.3)',
                borderRadius: '10px',
                color: '#e2e8f0',
                fontSize: '12px',
              }}
              formatter={(value: any, name: any) => [typeof value === 'number' ? value.toFixed(2) : String(value), String(name || '')]}
            />
            <Scatter
              data={data}
              shape={(props: any) => (
                <CustomDot {...props} selectedId={selectedId} onClick={onSelect} />
              )}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-primary-500 inline-block" />
          Non-dominated solution
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-amber-400 inline-block" />
          Selected for deployment
        </span>
      </div>
    </div>
  );
};

export default ParetoChart;
