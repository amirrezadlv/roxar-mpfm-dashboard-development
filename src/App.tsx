/**
 * Roxar MPFM 2600 – Executive Multiphase Dashboard
 *
 * Layers:
 *   src/data    – ingestion (xlsx → canonical MpfmRecord)
 *   src/engine  – PVT & MPFM physics, dataset analytics
 *   src/ui      – presentation (this shell + tabs)
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { parseWorkbook } from "./data/parser";
import { loadSampleDataset } from "./data/sampleDataset";
import type { Dataset } from "./data/types";
import { analyzeDataset } from "./engine/analytics";
import { DEFAULT_FLUIDS, type FluidProps } from "./engine/mpfm";
import { DEFAULT_PVT, type PvtCoefficients } from "./engine/pvt";
import { fmt } from "./engine/units";
import { Badge } from "./ui/primitives";
import { SettingsPanel } from "./ui/SettingsPanel";
import { OverviewTab } from "./ui/tabs/OverviewTab";
import { PhaseTab } from "./ui/tabs/PhaseTab";
import { PvtTab } from "./ui/tabs/PvtTab";
import { VenturiTab } from "./ui/tabs/VenturiTab";
import { ChokeTab } from "./ui/tabs/ChokeTab";
import { DataTab } from "./ui/tabs/DataTab";
import { cn } from "./utils/cn";

type TabKey = "overview" | "phase" | "pvt" | "venturi" | "choke" | "data";

const TABS: { key: TabKey; label: string; hint: string }[] = [
  { key: "overview", label: "Overview", hint: "KPIs · production · context" },
  { key: "phase", label: "Phase & Inversion", hint: "α+β+γ · ε/σ · γ-density" },
  { key: "pvt", label: "PVT Audit", hint: "Bo · Rs · Z" },
  { key: "venturi", label: "Venturi & Momentum", hint: "Δp · velocities · ṁ" },
  { key: "choke", label: "Choke & Pressure", hint: "ΔP sensitivity · slugging" },
  { key: "data", label: "Data & Diagnostics", hint: "flags · provenance · export" },
];

export default function App() {
  const [ds, setDs] = useState<Dataset>(() => loadSampleDataset());
  const [fp, setFp] = useState<FluidProps>(DEFAULT_FLUIDS);
  const [pvt, setPvt] = useState<PvtCoefficients>(DEFAULT_PVT);
  const [tab, setTab] = useState<TabKey>("overview");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const analysis = useMemo(() => analyzeDataset(ds, fp, pvt), [ds, fp, pvt]);

  const ingest = useCallback(async (file: File) => {
    try {
      setError(null);
      const buf = await file.arrayBuffer();
      const parsed = parseWorkbook(buf, file.name);
      if (!parsed.records.length) throw new Error("No data rows recognised in workbook.");
      setDs(parsed);
      setTab("overview");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void ingest(f);
  };

  const s = analysis.stats;
  const alarmCount = analysis.flagSummary.filter((f) => f.severity === "alarm").reduce((x, f) => x + f.count, 0);

  return (
    <div
      className="min-h-screen flex flex-col"
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-[#070b16]/85 backdrop-blur">
        <div className="mx-auto max-w-[1600px] px-4 py-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 mr-auto min-w-0">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-oil via-pressure to-water grid place-items-center shadow-lg shadow-sky-900/30">
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-slate-950" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
                <path d="M3 17c3-6 5-6 8 0s5 6 8 0" /><path d="M3 9c3-4 5-4 8 0s5 4 8 0" />
              </svg>
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold tracking-wide text-slate-100 leading-tight">Roxar MPFM 2600 · Multiphase Insight Console</h1>
              <p className="text-[11px] text-slate-400 truncate max-w-[60vw]" title={ds.name}>{ds.name}</p>
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-1.5">
            {ds.context.well && <Badge tone="oil">{ds.context.well}</Badge>}
            {ds.context.pad && <Badge tone="sky">{ds.context.pad}</Badge>}
            {analysis.choke.chokeIn !== undefined && <Badge tone="slate">choke {ds.context.chokeNumerator}/{ds.context.chokeDenominator}"</Badge>}
            <Badge tone={analysis.phaseShare.oil >= 50 ? "oil" : "water"}>
              <span className={cn("h-1.5 w-1.5 rounded-full pulse-dot", analysis.phaseShare.oil >= 50 ? "bg-oil" : "bg-water")} />
              {analysis.phaseShare.oil >= 50 ? "oil-continuous" : "water-continuous"}
            </Badge>
            <Badge tone={alarmCount ? "red" : "green"}>{alarmCount ? `${alarmCount} alarms` : "no alarms"}</Badge>
          </div>

          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void ingest(f); e.target.value = ""; }} />
            <button onClick={() => fileRef.current?.click()} className="rounded-md bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-semibold px-3 py-1.5 shadow">
              Import .xlsx
            </button>
            <button onClick={() => { setDs(loadSampleDataset()); setError(null); }} className="rounded-md border border-slate-700 hover:bg-slate-800 text-xs px-3 py-1.5 text-slate-200">
              Sample
            </button>
            <button onClick={() => setSettingsOpen((o) => !o)} className={cn("rounded-md border text-xs px-3 py-1.5", settingsOpen ? "border-sky-500 text-sky-300" : "border-slate-700 text-slate-200 hover:bg-slate-800")}>
              Fluids ⚙
            </button>
          </div>
        </div>

        {/* Tabs */}
        <nav className="mx-auto max-w-[1600px] px-4 flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "relative px-3 py-2 text-xs whitespace-nowrap transition-colors border-b-2",
                tab === t.key ? "text-sky-300 border-sky-400" : "text-slate-400 border-transparent hover:text-slate-200",
              )}
            >
              <span className="font-medium">{t.label}</span>
              <span className="hidden md:inline text-[10px] text-slate-500 ml-1.5">{t.hint}</span>
            </button>
          ))}
        </nav>
      </header>

      {/* Ticker */}
      <div className="border-b border-slate-800/60 bg-slate-900/40">
        <div className="mx-auto max-w-[1600px] px-4 py-1.5 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-400 num">
          <span>Oil <b className="text-oil">{fmt(s.oilStdBpd.mean, 0)}</b> STB/d</span>
          <span>Gas <b className="text-gas">{fmt(s.gasStdCfd.mean / 1000, 1)}</b> Mscf/d</span>
          <span>Water <b className="text-water">{fmt(s.waterStdBpd.mean, 1)}</b> bbl/d</span>
          <span>WC <b className="text-slate-200">{fmt(s.waterCut.mean, 2)}</b>%</span>
          <span>GVF <b className="text-slate-200">{fmt(s.gvf.mean, 1)}</b>%</span>
          <span>GOR <b className="text-slate-200">{fmt(s.gorScf.mean, 0)}</b> scf/STB</span>
          <span>P <b className="text-pressure">{fmt(s.pBara.mean, 2)}</b> bar(a)</span>
          <span>T <b className="text-temp">{fmt(s.tC.mean, 1)}</b> °C</span>
          <span>Bo <b className="text-slate-200">{fmt(s.boImplied.mean, 3)}</b></span>
          <span>ρ<sub>mix</sub> <b className="text-slate-200">{fmt(s.density.mean, 0)}</b> kg/m³</span>
          <span className="ml-auto text-slate-500">{analysis.rows.length} samples · {analysis.rows[0]?.timeLabel}–{analysis.rows[analysis.rows.length - 1]?.timeLabel}</span>
        </div>
      </div>

      {error && (
        <div className="mx-auto max-w-[1600px] w-full px-4 mt-3">
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200 flex justify-between">
            <span>Import failed: {error}</span>
            <button onClick={() => setError(null)} className="text-rose-300">dismiss</button>
          </div>
        </div>
      )}

      {/* Body */}
      <main className="mx-auto max-w-[1600px] w-full px-4 py-4 flex-1">
        {tab === "overview" && <OverviewTab a={analysis} ds={ds} />}
        {tab === "phase" && <PhaseTab a={analysis} fp={fp} />}
        {tab === "pvt" && <PvtTab a={analysis} pvt={pvt} onPvt={setPvt} />}
        {tab === "venturi" && <VenturiTab a={analysis} ds={ds} fp={fp} />}
        {tab === "choke" && <ChokeTab a={analysis} />}
        {tab === "data" && <DataTab a={analysis} ds={ds} />}
      </main>

      <footer className="border-t border-slate-800/60 py-3 text-center text-[11px] text-slate-500">
        Data → Engine → UI · Standard conditions 15.6 °C / 1.01325 bar(a) · Drag &amp; drop a Roxar MPFM 2600 export anywhere to analyse
      </footer>

      {dragging && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-sky-500/10 backdrop-blur-sm border-4 border-dashed border-sky-400/60 pointer-events-none">
          <div className="rounded-xl bg-slate-950/90 px-6 py-4 text-sky-200 text-sm font-medium">Drop MPFM workbook to import</div>
        </div>
      )}

      {settingsOpen && <SettingsPanel fp={fp} onChange={setFp} onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
