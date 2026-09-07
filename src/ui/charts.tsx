/**
 * UI – chart helpers shared across tabs (Recharts).
 */
import { fmt } from "../engine/units";

interface TipPayload {
  dataKey?: string | number;
  name?: string;
  value?: number | string;
  color?: string;
  stroke?: string;
}
interface TipProps {
  active?: boolean;
  payload?: TipPayload[];
  label?: string | number;
}

export const C = {
  oil: "#f5a524",
  water: "#38bdf8",
  gas: "#a78bfa",
  liquid: "#34d399",
  pressure: "#fb7185",
  temp: "#fb923c",
  density: "#e2e8f0",
  model: "#94a3b8",
  grid: "#1e293b",
  axis: "#64748b",
  good: "#34d399",
  warn: "#fbbf24",
  bad: "#f43f5e",
};

export const axisProps = {
  tick: { fill: C.axis, fontSize: 10 },
  axisLine: { stroke: C.grid },
  tickLine: { stroke: C.grid },
};

export const gridProps = { stroke: C.grid, strokeDasharray: "3 3", vertical: false };

export const tooltipStyle = { cursor: { stroke: "#334155", strokeWidth: 1 } };

type Fmt = (v: number) => string;
export function ChartTip({ active, payload, label, units = {}, digits = {}, labelPrefix = "" }: TipProps & {
  units?: Record<string, string>; digits?: Record<string, number>; labelPrefix?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950/95 px-3 py-2 shadow-xl text-xs min-w-[150px]">
      <div className="text-slate-400 mb-1 font-medium">{labelPrefix}{label}</div>
      {payload.map((p) => {
        const key = String(p.dataKey ?? p.name);
        const val = typeof p.value === "number" ? p.value : NaN;
        return (
          <div key={key} className="flex items-center justify-between gap-4 py-0.5">
            <span className="inline-flex items-center gap-1.5 text-slate-300">
              <span className="h-2 w-2 rounded-full" style={{ background: p.color ?? p.stroke ?? "#fff" }} />
              {p.name}
            </span>
            <span className="num text-slate-100">
              {fmt(val, digits[key] ?? 1)}
              {units[key] && <span className="text-slate-500 ml-1">{units[key]}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export const tickEvery = (n: number, target = 8) => Math.max(1, Math.floor(n / target));
export const yFmt = (digits = 0): Fmt => (v) => fmt(v, digits);
