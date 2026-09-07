/**
 * UI – Data & diagnostics: flags, ingestion provenance, enriched table, export.
 */
import { useMemo, useState } from "react";
import type { Analysis, EnrichedRow, FlagSeverity } from "../../engine/analytics";
import type { Dataset } from "../../data/types";
import { bindHeaders } from "../../data/columnMap";
import { fmt } from "../../engine/units";
import { Badge, Card, Kpi } from "../primitives";
import { cn } from "../../utils/cn";

const sevTone: Record<FlagSeverity, "red" | "amber" | "sky"> = { alarm: "red", warn: "amber", info: "sky" };

interface Col { key: string; label: string; f: (r: EnrichedRow) => number | string; d?: number; cls?: string }

const COLS: Col[] = [
  { key: "time", label: "Time", f: (r) => r.timeLabel },
  { key: "p", label: "P psig", f: (r) => r.pPsig, d: 1, cls: "text-pressure" },
  { key: "t", label: "T °C", f: (r) => r.temperatureC, d: 1, cls: "text-temp" },
  { key: "oil", label: "Oil std", f: (r) => r.oilStdBpd, d: 0, cls: "text-oil" },
  { key: "oilA", label: "Oil act", f: (r) => r.oilActBpd, d: 0 },
  { key: "gas", label: "Gas std", f: (r) => r.gasStdCfd, d: 0, cls: "text-gas" },
  { key: "gasA", label: "Gas act", f: (r) => r.gasActCfd, d: 0 },
  { key: "wat", label: "Water", f: (r) => r.waterStdBpd, d: 1, cls: "text-water" },
  { key: "wc", label: "WC %", f: (r) => r.waterCut, d: 2 },
  { key: "wlr", label: "WLR %", f: (r) => r.wlrAct, d: 2 },
  { key: "gvf", label: "GVF %", f: (r) => r.gvf, d: 1 },
  { key: "gvfd", label: "GVFρ %", f: (r) => r.gvfFromDensity ?? NaN, d: 1 },
  { key: "rho", label: "ρ kg/m³", f: (r) => r.rhoMixMeasured ?? r.rhoMixModel, d: 0 },
  { key: "gor", label: "GOR", f: (r) => r.gorScf, d: 0 },
  { key: "bo", label: "Bo impl.", f: (r) => r.pvt.boImplied, d: 4 },
  { key: "bom", label: "Bo mod.", f: (r) => r.pvt.boModel, d: 4 },
  { key: "z", label: "Z impl.", f: (r) => r.pvt.zImplied, d: 3 },
  { key: "eps", label: "ε mix", f: (r) => r.permittivity ?? r.permittivityModel, d: 2 },
  { key: "dp", label: "ΔP mbar", f: (r) => r.venturiDpMeasured ?? r.venturiDpModel, d: 0 },
  { key: "m", label: "ṁ kg/h", f: (r) => r.massRateTotal, d: 0 },
  { key: "ph", label: "Phase", f: (r) => r.continuousPhase },
];

function toCsv(rows: EnrichedRow[]): string {
  const head = COLS.map((c) => c.label).concat("flags").join(",");
  const body = rows.map((r) =>
    COLS.map((c) => { const v = c.f(r); return typeof v === "number" ? (Number.isFinite(v) ? v.toFixed(c.d ?? 3) : "") : v; })
      .concat(`"${r.flags.map((f) => f.code).join("|")}"`).join(","),
  );
  return [head, ...body].join("\n");
}

export function DataTab({ a, ds }: { a: Analysis; ds: Dataset }) {
  const [page, setPage] = useState(0);
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [filter, setFilter] = useState<string>("");
  const pageSize = 30;

  const rows = useMemo(() => {
    let r = a.rows;
    if (onlyFlagged) r = r.filter((x) => x.flags.length);
    if (filter) r = r.filter((x) => x.flags.some((f) => f.code === filter));
    return r;
  }, [a.rows, onlyFlagged, filter]);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const view = rows.slice(page * pageSize, (page + 1) * pageSize);

  const bindings = bindHeaders(ds.sourceHeaders);
  const mapped = bindings.filter((b) => b.field !== "ignore");

  const download = () => {
    const blob = new Blob([toCsv(a.rows)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = url;
    el.download = ds.name.replace(/\.[^.]+$/, "") + "_enriched.csv";
    el.click();
    URL.revokeObjectURL(url);
  };

  const counts = { alarm: 0, warn: 0, info: 0 };
  a.flagSummary.forEach((f) => (counts[f.severity] += f.count));
  const provTone = (p: string) => (p === "measured" ? "green" : p === "derived" ? "sky" : p === "modeled" ? "amber" : "red");

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Samples" value={a.rows.length} digits={0} sub={`${ds.intervalMin} min interval · ${fmt(a.totals.durationMin, 0)} min`} />
        <Kpi label="Alarms" value={counts.alarm} digits={0} color={counts.alarm ? "text-rose-300" : "text-emerald-300"} sub="process / technical / inversion" />
        <Kpi label="Warnings" value={counts.warn} digits={0} color={counts.warn ? "text-amber-300" : "text-emerald-300"} sub="GVF envelope · density closure · Σ fractions" />
        <Kpi label="Info" value={counts.info} digits={0} color="text-sky-300" sub="water slugs · Bo deviations · resets" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card title="Diagnostic Summary" subtitle={ds.provenance.alarms === "measured" ? "Meter Process/Technical alarms plus derived checks" : "Meter alarm columns not present – flags below are derived from physics checks"}>
          {a.flagSummary.length === 0 && <p className="text-xs text-slate-400">No diagnostics raised.</p>}
          <ul className="flex flex-col gap-1.5">
            {a.flagSummary.map((f) => (
              <li key={f.code} className="flex items-start gap-2 text-xs">
                <button onClick={() => { setFilter(filter === f.code ? "" : f.code); setPage(0); }} className="shrink-0">
                  <Badge tone={sevTone[f.severity]} className={cn(filter === f.code && "ring-1 ring-white/50")}>{f.code} · {f.count}</Badge>
                </button>
                <span className="text-slate-300 leading-relaxed">{f.message}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Ingestion Map & Provenance" subtitle={`${ds.sourceHeaders.length} source columns → ${mapped.length} canonical fields with unit conversion`}>
          <div className="flex flex-wrap gap-1.5 mb-1">
            {Object.entries(ds.provenance).map(([k, p]) => (
              <Badge key={k} tone={provTone(p)}>{k}: {p}</Badge>
            ))}
          </div>
          <div className="max-h-56 overflow-auto rounded-md border border-slate-800">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-slate-900">
                <tr className="text-slate-400 text-left"><th className="px-2 py-1 font-medium">Source header</th><th className="px-2 py-1 font-medium">Field</th><th className="px-2 py-1 font-medium">Unit</th></tr>
              </thead>
              <tbody>
                {bindings.map((b, i) => (
                  <tr key={i} className={cn("border-t border-slate-800/60", b.field === "ignore" && "opacity-40")}>
                    <td className="px-2 py-1 text-slate-300 font-mono">{b.header || "(blank)"}</td>
                    <td className="px-2 py-1 text-sky-300">{b.field}</td>
                    <td className="px-2 py-1 text-slate-400">{b.unitLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card
        title="Enriched Data Table"
        subtitle="Measured values (unit-normalised) alongside engine-derived quantities"
        right={
          <div className="flex items-center gap-2 text-xs">
            <label className="inline-flex items-center gap-1.5 text-slate-300 cursor-pointer">
              <input type="checkbox" checked={onlyFlagged} onChange={(e) => { setOnlyFlagged(e.target.checked); setPage(0); }} className="accent-sky-500" /> flagged only
            </label>
            {filter && <button onClick={() => setFilter("")} className="text-sky-300 hover:underline">clear {filter}</button>}
            <button onClick={download} className="rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-slate-100 hover:bg-slate-700">Export CSV</button>
          </div>
        }
      >
        <div className="overflow-x-auto rounded-md border border-slate-800">
          <table className="w-full text-[11px] num whitespace-nowrap">
            <thead className="bg-slate-900/90">
              <tr className="text-slate-400 text-right">
                {COLS.map((c) => <th key={c.key} className={cn("px-2 py-1.5 font-medium", c.key === "time" || c.key === "ph" ? "text-left" : "")}>{c.label}</th>)}
                <th className="px-2 py-1.5 font-medium text-left">Flags</th>
              </tr>
            </thead>
            <tbody>
              {view.map((r) => (
                <tr key={r.index} className={cn("border-t border-slate-800/60 hover:bg-slate-800/40", r.flags.some((f) => f.severity === "alarm") && "bg-rose-500/5")}>
                  {COLS.map((c) => {
                    const v = c.f(r);
                    return (
                      <td key={c.key} className={cn("px-2 py-1 text-right", c.cls, (c.key === "time" || c.key === "ph") && "text-left text-slate-300")}>
                        {typeof v === "number" ? fmt(v, c.d ?? 2) : v === "oil" ? <Badge tone="oil">oil</Badge> : v === "water" ? <Badge tone="water">water</Badge> : v}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1 text-left">
                    <span className="inline-flex gap-1">
                      {r.flags.map((f, i) => <span key={i} title={f.message}><Badge tone={sevTone[f.severity]}>{f.code}</Badge></span>)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>{rows.length} rows · page {page + 1}/{pages}</span>
          <div className="flex gap-1">
            <button disabled={page === 0} onClick={() => setPage(page - 1)} className="rounded border border-slate-700 px-2 py-0.5 disabled:opacity-40 hover:bg-slate-800">‹ prev</button>
            <button disabled={page >= pages - 1} onClick={() => setPage(page + 1)} className="rounded border border-slate-700 px-2 py-0.5 disabled:opacity-40 hover:bg-slate-800">next ›</button>
          </div>
        </div>
      </Card>
    </div>
  );
}
