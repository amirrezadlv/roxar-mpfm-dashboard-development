/**
 * UI – shared presentational primitives.
 */
import type { ReactNode } from "react";
import { cn } from "../utils/cn";
import { fmt } from "../engine/units";

export function Card({ title, subtitle, right, children, className }: {
  title?: string; subtitle?: string; right?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={cn("card p-4 flex flex-col gap-3", className)}>
      {(title || right) && (
        <header className="flex items-start justify-between gap-3">
          <div>
            {title && <h3 className="text-sm font-semibold tracking-wide text-slate-200">{title}</h3>}
            {subtitle && <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{subtitle}</p>}
          </div>
          {right && <div className="shrink-0">{right}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, unit, sub, color = "text-slate-100", digits = 1, trend }: {
  label: string; value: number | string | undefined; unit?: string; sub?: string; color?: string; digits?: number;
  trend?: ReactNode;
}) {
  return (
    <div className="card px-4 py-3 flex flex-col gap-1 min-w-0">
      <div className="text-[11px] uppercase tracking-wider text-slate-400 font-medium truncate">{label}</div>
      <div className="flex items-baseline gap-1.5 min-w-0">
        <span className={cn("text-2xl font-semibold num tracking-tight truncate", color)}>
          {typeof value === "number" ? fmt(value, digits) : value ?? "—"}
        </span>
        {unit && <span className="text-xs text-slate-400 shrink-0">{unit}</span>}
      </div>
      {(sub || trend) && (
        <div className="text-[11px] text-slate-500 num flex items-center gap-2 truncate">{trend}{sub}</div>
      )}
    </div>
  );
}

export function Badge({ children, tone = "slate", className }: {
  children: ReactNode; tone?: "slate" | "oil" | "water" | "gas" | "green" | "red" | "amber" | "sky"; className?: string;
}) {
  const tones: Record<string, string> = {
    slate: "bg-slate-800 text-slate-300 border-slate-700",
    oil: "bg-oil/15 text-oil border-oil/30",
    water: "bg-water/15 text-water border-water/30",
    gas: "bg-gas/15 text-gas border-gas/30",
    green: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    red: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    amber: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    sky: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap", tones[tone], className)}>
      {children}
    </span>
  );
}

export function Stat({ label, value, unit, mono = true }: { label: string; value: string | number; unit?: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-800/70 py-1.5 last:border-0">
      <span className="text-xs text-slate-400">{label}</span>
      <span className={cn("text-sm text-slate-100", mono && "num")}>
        {typeof value === "number" ? fmt(value, 2) : value}
        {unit && <span className="text-slate-500 text-xs ml-1">{unit}</span>}
      </span>
    </div>
  );
}

export function Formula({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <code className={cn("block rounded-md bg-slate-950/70 border border-slate-800 px-3 py-2 text-[12px] font-mono text-sky-200/90 overflow-x-auto", className)}>
      {children}
    </code>
  );
}

export function NumberField({ label, value, onChange, step = 1, unit, min, max }: {
  label: string; value: number; onChange: (v: number) => void; step?: number; unit?: string; min?: number; max?: number;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs">
      <span className="text-slate-400 truncate">{label}</span>
      <span className="flex items-center gap-1">
        <input
          type="number"
          className="w-24 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-right text-slate-100 num focus:outline-none focus:border-sky-500"
          value={value}
          step={step}
          min={min}
          max={max}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        />
        {unit && <span className="w-12 text-slate-500 text-[10px]">{unit}</span>}
      </span>
    </label>
  );
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded" style={{ background: it.color, borderTop: it.dashed ? `2px dashed ${it.color}` : undefined, height: it.dashed ? 0 : undefined }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}
