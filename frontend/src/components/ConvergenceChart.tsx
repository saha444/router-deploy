import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts';

interface ConvergencePoint {
  iteration: number;
  hypervolume: number;
}

interface ConvergenceData {
  algorithm: string;
  data: ConvergencePoint[];
  color: string;
}

interface ConvergenceChartProps {
  series: ConvergenceData[];
  title?: string;
}

const ConvergenceChart: React.FC<ConvergenceChartProps> = ({ series, title }) => {
  if (!series.length || series.every(s => !s.data.length)) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 text-sm">
        No convergence data yet. Run an optimization to see results.
      </div>
    );
  }

  // Merge all series into one dataset keyed by iteration
  const maxIter = Math.max(...series.flatMap(s => s.data.map(d => d.iteration)));
  const merged: Record<number, any> = {};
  for (let i = 1; i <= maxIter; i++) merged[i] = { iteration: i };

  for (const s of series) {
    for (const point of s.data) {
      merged[point.iteration][s.algorithm] = point.hypervolume;
    }
  }

  const chartData = Object.values(merged).sort((a, b) => a.iteration - b.iteration);

  return (
    <div className="flex flex-col gap-2 h-full">
      {title && <div className="text-sm font-medium text-slate-400">{title}</div>}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 20, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2d2d4e" />
            <XAxis
              dataKey="iteration"
              tick={{ fill: '#64748b', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: '#3a3a60' }}
              label={{ value: 'Iteration', position: 'insideBottomRight', offset: -10, fill: '#64748b', fontSize: 11 }}
            />
            <YAxis
              tick={{ fill: '#64748b', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: '#3a3a60' }}
              label={{ value: 'Hypervolume', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 11 }}
            />
            <Tooltip
              contentStyle={{
                background: 'rgba(22,22,40,0.95)',
                border: '1px solid rgba(99,102,241,0.3)',
                borderRadius: '10px',
                color: '#e2e8f0',
                fontSize: '12px',
              }}
              formatter={(v: any, name: any) => [typeof v === 'number' ? v.toFixed(4) : String(v), String(name || '').toUpperCase()]}
            />
            <Legend
              wrapperStyle={{ fontSize: '11px', color: '#94a3b8', paddingTop: '8px' }}
              formatter={(v: string) => v.toUpperCase()}
            />
            {series.map(s => (
              <Line
                key={s.algorithm}
                type="monotone"
                dataKey={s.algorithm}
                stroke={s.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default ConvergenceChart;
