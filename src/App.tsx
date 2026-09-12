/**
 * MPFM – Executive Multiphase Dashboard
 *
 * Layers:
 *   src/data    – ingestion (xlsx → canonical MpfmRecord)
 *   src/engine  – PVT & MPFM physics, dataset analytics
 *   src/ui      – presentation (this shell + tabs)
 */
import { useCallback, useMemo, useRef, useState, useEffect, startTransition } from "react";
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
  const [liveUrl, setLiveUrl] = useState("");
  const [liveUrlInput, setLiveUrlInput] = useState("");
  const [liveConnected, setLiveConnected] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [syncing, setSyncing] = useState(false);
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

  /** Fetch a remote XLSX and ingest it */
  /** Fetch a remote Google Sheet and ingest it natively */
  const ingestUrl = useCallback(async (rawUrl: string, isBackground = false) => {
    try {
      // Only show the UI loading state if this is the initial manual connection
      if (!isBackground) setSyncing(true);
      setError(null);

      let targetUrl = rawUrl;
      const match = rawUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      if (match) {
        targetUrl = `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv`;
      }

      const resp = await fetch(targetUrl);
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: Could not fetch data. Ensure the Sheet is shared as "Anyone with the link can view".`);
      }
      
      const blob = await resp.blob();
      const buf = await blob.arrayBuffer();
      
      const parsed = parseWorkbook(buf, rawUrl.split("/").pop() || "live.csv");
      if (!parsed.records.length) throw new Error("No data rows recognised in workbook.");
      
      // Use startTransition to process the heavy data update in the background without freezing the UI
      startTransition(() => {
        setDs(parsed);
        // Only force the tab jump on the very first connection, not during background polling
        if (!isBackground) {
          setTab("overview");
        }
      });
      
      setLastSync(new Date());
      if (!isBackground) setLiveConnected(true);
    } catch (e) {
      setError(e instanceof TypeError && e.message === "Failed to fetch" 
        ? "Network error: Failed to reach Google Sheets. Check your internet connection." 
        : (e instanceof Error ? e.message : String(e))
      );
      if (!isBackground) setLiveConnected(false);
    } finally {
      if (!isBackground) setSyncing(false);
    }
  }, []);

  /** Start/stop live polling every 15 seconds */
  useEffect(() => {
    if (!liveUrl) return;
    
    let active = true;
    let timerId: number;

    const runLiveFeed = async () => {
      // 1. Initial foreground fetch (shows "Syncing...", jumps to Overview tab)
      await ingestUrl(liveUrl, false);
      
      // 2. Start the silent background polling loop
      const poll = async () => {
        if (!active) return;
        await ingestUrl(liveUrl, true); // true = run silently in the background
        if (active) {
          timerId = window.setTimeout(poll, 15_000);
        }
      };
      
      if (active) {
        timerId = window.setTimeout(poll, 15_000);
      }
    };

    void runLiveFeed();

    return () => {
      active = false;
      window.clearTimeout(timerId);
    };
  }, [liveUrl, ingestUrl]);

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
              <h1 className="text-sm font-semibold tracking-wide text-slate-100 leading-tight">MPFM · Multiphase Insight Console</h1>
              <p className="text-[11px] text-slate-400 truncate max-w-[60vw]" title={ds.name}>{ds.name}</p>
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-1.5">
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

          {/* Live URL Controls */}
          <div className="flex items-center gap-2 border-t border-slate-800/60 pt-2 mt-2 lg:border-t-0 lg:pt-0 lg:mt-0 lg:border-l lg:pl-4">
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-slate-400">Live URL:</span>
              <input
                type="text"
                value={liveUrlInput}
                onChange={(e) => setLiveUrlInput(e.target.value)}
                placeholder="https://example.com/data.xlsx"
                className="w-48 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-sky-500"
                onKeyDown={(e) => e.key === "Enter" && setLiveUrl(liveUrlInput)}
              />
              <button
                onClick={() => setLiveUrl(liveUrlInput)}
                disabled={!liveUrlInput || syncing}
                className="rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-slate-950 text-xs font-semibold px-2 py-1.5 shadow disabled:cursor-not-allowed"
              >
                {syncing ? "Syncing..." : "Start Live"}
              </button>
              {liveUrl && (
                <button
                  onClick={() => { setLiveUrl(""); setLiveConnected(false); }}
                  className="rounded-md bg-rose-600 hover:bg-rose-500 text-slate-950 text-xs font-semibold px-2 py-1.5 shadow"
                >
                  Stop
                </button>
              )}
            </div>
            {liveConnected && (
              <div className="flex items-center gap-1 text-[10px] text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </div>
            )}
            {lastSync && (
              <div className="text-[10px] text-slate-500">
                Sync: {lastSync.toLocaleTimeString()}
              </div>
            )}
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
        Data → Engine → UI · Standard conditions 15.6 °C / 1.01325 bar(a) · Drag &amp; drop an MPFM export anywhere to analyse
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
