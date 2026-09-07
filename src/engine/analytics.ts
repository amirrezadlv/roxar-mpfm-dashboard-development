/**
 * Engine – dataset-level analytics built on top of per-record physics.
 */

import type { Dataset, MpfmRecord } from "../data/types";
import { analyzeRecord, type ContinuousPhase, type FluidProps, type MpfmDerived } from "./mpfm";
import type { PvtCoefficients } from "./pvt";
import { m3hToBpd, m3hToCfd, baraToPsig, cToF, sm3Sm3ToScfStb } from "./units";

export type FlagSeverity = "info" | "warn" | "alarm";

export interface Flag {
  code: string;
  severity: FlagSeverity;
  message: string;
}

export interface EnrichedRow extends MpfmRecord, MpfmDerived {
  t: number; // minutes from start
  continuousPhase: ContinuousPhase; // with hysteresis
  flags: Flag[];
  // convenience field-unit views for charts
  pPsig: number;
  tF: number;
  oilStdBpd: number;
  waterStdBpd: number;
  gasStdCfd: number;
  oilActBpd: number;
  gasActCfd: number;
  gorScf: number;
  cumOilStdBbl: number;
  cumWaterStdBbl: number;
  cumGasStdCf: number;
}

export interface Stat {
  mean: number;
  min: number;
  max: number;
  std: number;
  cv: number; // %
  p10: number;
  p90: number;
}

export interface InversionEvent {
  index: number;
  time: string;
  from: ContinuousPhase;
  to: ContinuousPhase;
  wlr: number;
}

export interface PressureBin {
  label: string;
  pMin: number;
  pMax: number;
  count: number;
  oilStd: number;
  gasStd: number;
  waterStd: number;
  gvf: number;
  waterCut: number;
  gor: number;
  density: number;
  boImplied: number;
}

export interface Analysis {
  rows: EnrichedRow[];
  stats: Record<string, Stat>;
  inversions: InversionEvent[];
  phaseShare: { oil: number; water: number }; // % of time
  pressureBins: PressureBin[];
  correlation: { keys: string[]; labels: string[]; matrix: number[][] };
  oscillation: { periodMin: number | undefined; strength: number; cvOil: number };
  flagSummary: { code: string; severity: FlagSeverity; count: number; message: string }[];
  totals: { durationMin: number; oilStdBbl: number; waterStdBbl: number; gasStdCf: number; gasStdMscf: number };
  choke: {
    p1?: number;
    p2?: number;
    dp?: number;
    ratio?: number;
    critical?: boolean;
    meterPAvgPsig: number;
    chokeIn?: number;
  };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

export function stat(values: number[]): Stat {
  const v = values.filter((x) => Number.isFinite(x));
  if (!v.length) return { mean: NaN, min: NaN, max: NaN, std: NaN, cv: NaN, p10: NaN, p90: NaN };
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const std = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length);
  const s = [...v].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { mean, min: s[0], max: s[s.length - 1], std, cv: mean !== 0 ? (100 * std) / Math.abs(mean) : NaN, p10: q(0.1), p90: q(0.9) };
}

function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return NaN;
  const ma = a.reduce((x, y) => x + y, 0) / n;
  const mb = b.reduce((x, y) => x + y, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : NaN;
}

/** Dominant oscillation period from the autocorrelation of a detrended signal */
function dominantPeriod(values: number[], intervalMin: number): { periodMin: number | undefined; strength: number } {
  const n = values.length;
  if (n < 12) return { periodMin: undefined, strength: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const x = values.map((v) => v - mean);
  const var0 = x.reduce((a, b) => a + b * b, 0);
  if (var0 === 0) return { periodMin: undefined, strength: 0 };
  const maxLag = Math.floor(n / 2);
  const ac: number[] = [];
  for (let lag = 0; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += x[i] * x[i + lag];
    ac.push(s / var0);
  }
  // first local maximum after the first zero-crossing / trough
  let i = 1;
  while (i < maxLag && ac[i] > ac[i - 1]) i++;
  while (i < maxLag && ac[i] < ac[i - 1]) i++;
  let best = i, bestVal = ac[i] ?? -1;
  for (let j = i; j < maxLag; j++) if (ac[j] > bestVal) { bestVal = ac[j]; best = j; }
  if (bestVal <= 0.1) return { periodMin: undefined, strength: bestVal };
  return { periodMin: best * intervalMin, strength: bestVal };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

export function analyzeDataset(ds: Dataset, fp: FluidProps, pvtC: PvtCoefficients): Analysis {
  const recs = ds.records;
  const t0 = recs.length ? recs[0].timestamp.getTime() : 0;

  // --- per record physics ------------------------------------------------------
  const derived = recs.map((r) => analyzeRecord(r, fp, pvtC));

  // --- continuous phase with hysteresis ---------------------------------------
  const hi = fp.inversionWlrPct + fp.inversionHysteresisPct / 2;
  const lo = fp.inversionWlrPct - fp.inversionHysteresisPct / 2;
  let phase: ContinuousPhase = derived.length ? derived[0].continuousPhaseRaw : "oil";
  let prevPhase: ContinuousPhase = phase;
  const inversions: InversionEvent[] = [];
  const phases: ContinuousPhase[] = derived.map((d, i) => {
    // if the meter exports conductivity in water-continuous mode, trust it
    const r = recs[i];
    if (r.conductivity !== undefined && r.conductivity > 0 && (r.permittivity === undefined || r.permittivity === 0)) phase = "water";
    else if (r.permittivity !== undefined && r.permittivity > 0 && (r.conductivity === undefined || r.conductivity === 0)) phase = "oil";
    else if (phase === "oil" && d.wlrAct >= hi) phase = "water";
    else if (phase === "water" && d.wlrAct <= lo) phase = "oil";
    if (i > 0 && prevPhase !== phase) inversions.push({ index: i, time: r.timeLabel, from: prevPhase, to: phase, wlr: d.wlrAct });
    prevPhase = phase;
    return phase;
  });

  // --- enrich rows ------------------------------------------------------------
  const wcStat = stat(recs.map((r) => r.waterCut));
  let cumOil = 0, cumWater = 0, cumGas = 0;
  const rows: EnrichedRow[] = recs.map((r, i) => {
    const d = derived[i];
    const dtH = i === 0 ? ds.intervalMin / 60 : (r.timestamp.getTime() - recs[i - 1].timestamp.getTime()) / 3.6e6;
    cumOil += r.oilStd * dtH;
    cumWater += r.waterStd * dtH;
    cumGas += r.gasStd * dtH;

    const flags: Flag[] = [];
    if (r.processAlarms) flags.push({ code: "PROC", severity: "alarm", message: `Process alarm: ${r.processAlarms}` });
    if (r.technicalAlarms) flags.push({ code: "TECH", severity: "alarm", message: `Technical alarm: ${r.technicalAlarms}` });
    if (r.accReset) flags.push({ code: "ACC", severity: "info", message: "Accumulator reset" });
    if (r.gvf > fp.gvfAccuracyLimitPct)
      flags.push({ code: "GVF", severity: "warn", message: `GVF ${r.gvf.toFixed(1)}% above ${fp.gvfAccuracyLimitPct}% wet-gas boundary – liquid rate uncertainty increases` });
    if (d.gvfResidualPct !== undefined && Math.abs(d.gvfResidualPct) > 5)
      flags.push({ code: "RHO", severity: "warn", message: `Gamma-density GVF ${d.gvfFromDensity!.toFixed(1)}% vs reported ${r.gvf.toFixed(1)}% (Δ ${d.gvfResidualPct.toFixed(1)} pt) – transient/slug or density-model drift` });
    if (Math.abs(d.inversionMarginPct) <= 10)
      flags.push({ code: "INV", severity: "warn", message: `WLR ${d.wlrAct.toFixed(1)}% within 10 pt of inversion threshold (${fp.inversionWlrPct}%)` });
    if (i > 0 && phases[i] !== phases[i - 1])
      flags.push({ code: "PHASE", severity: "alarm", message: `Phase inversion: ${phases[i - 1]}-continuous → ${phases[i]}-continuous` });
    if (Number.isFinite(wcStat.std) && r.waterCut > wcStat.mean + 2.5 * wcStat.std)
      flags.push({ code: "WC", severity: "info", message: `Water-cut spike ${r.waterCut.toFixed(1)}% (> mean + 2.5σ) – water slug` });
    if (Math.abs(d.pvt.boResidualPct) > 2)
      flags.push({ code: "BO", severity: "info", message: `Implied Bo ${d.pvt.boImplied.toFixed(3)} deviates ${d.pvt.boResidualPct.toFixed(1)}% from model` });
    if (Math.abs(d.fractionClosureRaw - 1) > 0.005)
      flags.push({ code: "SUM", severity: "warn", message: `Phase fractions sum ${d.fractionClosureRaw.toFixed(3)} ≠ 1` });
    if (d.venturiClosurePct !== undefined && Math.abs(d.venturiClosurePct) > 10)
      flags.push({ code: "VENT", severity: "warn", message: `Venturi mass rate differs ${d.venturiClosurePct.toFixed(1)}% from reported mass rate` });

    return {
      ...r,
      ...d,
      t: (r.timestamp.getTime() - t0) / 60000,
      continuousPhase: phases[i],
      flags,
      pPsig: baraToPsig(r.pressureBara),
      tF: cToF(r.temperatureC),
      oilStdBpd: m3hToBpd(r.oilStd),
      waterStdBpd: m3hToBpd(r.waterStd),
      gasStdCfd: m3hToCfd(r.gasStd),
      oilActBpd: m3hToBpd(r.oilAct),
      gasActCfd: m3hToCfd(r.gasAct),
      gorScf: sm3Sm3ToScfStb(d.gorStd),
      cumOilStdBbl: m3hToBpd(cumOil) / 24,
      cumWaterStdBbl: m3hToBpd(cumWater) / 24,
      cumGasStdCf: m3hToCfd(cumGas) / 24,
    };
  });

  // --- statistics --------------------------------------------------------------
  const pick = (f: (r: EnrichedRow) => number) => rows.map(f);
  const stats: Record<string, Stat> = {
    oilStdBpd: stat(pick((r) => r.oilStdBpd)),
    gasStdCfd: stat(pick((r) => r.gasStdCfd)),
    waterStdBpd: stat(pick((r) => r.waterStdBpd)),
    waterCut: stat(pick((r) => r.waterCut)),
    gvf: stat(pick((r) => r.gvf)),
    wlr: stat(pick((r) => r.wlrAct)),
    gorScf: stat(pick((r) => r.gorScf)),
    pPsig: stat(pick((r) => r.pPsig)),
    pBara: stat(pick((r) => r.pressureBara)),
    tC: stat(pick((r) => r.temperatureC)),
    tF: stat(pick((r) => r.tF)),
    density: stat(pick((r) => r.rhoMixMeasured ?? r.rhoMixModel)),
    boImplied: stat(pick((r) => r.pvt.boImplied)),
    boModel: stat(pick((r) => r.pvt.boModel)),
    zModel: stat(pick((r) => r.pvt.zModel)),
    zImplied: stat(pick((r) => r.pvt.zImplied)),
    rsModel: stat(pick((r) => r.pvt.rsModel)),
    gvfResidual: stat(pick((r) => r.gvfResidualPct ?? NaN)),
    rhoResidual: stat(pick((r) => r.rhoMixResidualPct ?? NaN)),
    venturiDp: stat(pick((r) => r.venturiDpMeasured ?? r.venturiDpModel)),
    vMixThroat: stat(pick((r) => r.mixtureVelocityThroat)),
    massRate: stat(pick((r) => r.massRateTotal)),
    permittivity: stat(pick((r) => r.permittivity ?? r.permittivityModel)),
    liquidStdBpd: stat(pick((r) => m3hToBpd(r.liquidStd))),
  };

  // --- pressure bins (choke pressure differential sensitivity) -----------------
  const pSorted = [...rows.map((r) => r.pPsig)].sort((a, b) => a - b);
  const qv = (p: number) => pSorted[Math.min(pSorted.length - 1, Math.floor(p * pSorted.length))];
  const edges = pSorted.length ? [pSorted[0], qv(0.25), qv(0.5), qv(0.75), pSorted[pSorted.length - 1] + 1e-6] : [];
  const pressureBins: PressureBin[] = [];
  for (let b = 0; b < 4 && edges.length; b++) {
    const inBin = rows.filter((r) => r.pPsig >= edges[b] && (b === 3 ? r.pPsig <= edges[b + 1] : r.pPsig < edges[b + 1]));
    if (!inBin.length) continue;
    const avg = (f: (r: EnrichedRow) => number) => inBin.reduce((a, r) => a + f(r), 0) / inBin.length;
    pressureBins.push({
      label: `${edges[b].toFixed(0)}–${edges[b + 1].toFixed(0)} psig`,
      pMin: edges[b], pMax: edges[b + 1], count: inBin.length,
      oilStd: avg((r) => r.oilStdBpd), gasStd: avg((r) => r.gasStdCfd), waterStd: avg((r) => r.waterStdBpd),
      gvf: avg((r) => r.gvf), waterCut: avg((r) => r.waterCut), gor: avg((r) => r.gorScf),
      density: avg((r) => r.rhoMixMeasured ?? r.rhoMixModel), boImplied: avg((r) => r.pvt.boImplied),
    });
  }

  // --- correlation matrix -------------------------------------------------------
  const corrKeys: { key: string; label: string; f: (r: EnrichedRow) => number }[] = [
    { key: "p", label: "P", f: (r) => r.pPsig },
    { key: "t", label: "T", f: (r) => r.temperatureC },
    { key: "oil", label: "Q oil", f: (r) => r.oilStdBpd },
    { key: "gas", label: "Q gas", f: (r) => r.gasStdCfd },
    { key: "water", label: "Q wat", f: (r) => r.waterStdBpd },
    { key: "wc", label: "WC", f: (r) => r.waterCut },
    { key: "gvf", label: "GVF", f: (r) => r.gvf },
    { key: "rho", label: "ρ mix", f: (r) => r.rhoMixMeasured ?? r.rhoMixModel },
    { key: "gor", label: "GOR", f: (r) => r.gorScf },
  ];
  const series = corrKeys.map((k) => rows.map(k.f));
  const matrix = series.map((a) => series.map((b) => pearson(a, b)));

  // --- oscillation / slugging ----------------------------------------------------
  const osc = dominantPeriod(rows.map((r) => r.oilStdBpd), ds.intervalMin);

  // --- flag summary --------------------------------------------------------------
  const fs = new Map<string, { code: string; severity: FlagSeverity; count: number; message: string }>();
  for (const r of rows)
    for (const f of r.flags) {
      const e = fs.get(f.code);
      if (e) e.count++;
      else fs.set(f.code, { code: f.code, severity: f.severity, count: 1, message: f.message });
    }
  const sevRank = { alarm: 0, warn: 1, info: 2 };
  const flagSummary = [...fs.values()].sort((a, b) => sevRank[a.severity] - sevRank[b.severity] || b.count - a.count);

  // --- totals ----------------------------------------------------------------------
  const durationMin = rows.length > 1 ? rows[rows.length - 1].t + ds.intervalMin : rows.length * ds.intervalMin;
  const last = rows[rows.length - 1];
  const totals = {
    durationMin,
    oilStdBbl: last?.cumOilStdBbl ?? 0,
    waterStdBbl: last?.cumWaterStdBbl ?? 0,
    gasStdCf: last?.cumGasStdCf ?? 0,
    gasStdMscf: (last?.cumGasStdCf ?? 0) / 1000,
  };

  // --- choke context ---------------------------------------------------------------
  const { p1Psi: p1, p2Psi: p2, chokeNumerator, chokeDenominator } = ds.context;
  const choke = {
    p1, p2,
    dp: p1 !== undefined && p2 !== undefined ? p1 - p2 : undefined,
    ratio: p1 !== undefined && p2 !== undefined ? (p2 + 14.696) / (p1 + 14.696) : undefined,
    critical: p1 !== undefined && p2 !== undefined ? (p2 + 14.696) / (p1 + 14.696) < 0.55 : undefined,
    meterPAvgPsig: stats.pPsig.mean,
    chokeIn: chokeNumerator && chokeDenominator ? chokeNumerator / chokeDenominator : undefined,
  };

  const oilShare = rows.length ? (100 * rows.filter((r) => r.continuousPhase === "oil").length) / rows.length : 100;

  return {
    rows, stats, inversions,
    phaseShare: { oil: oilShare, water: 100 - oilShare },
    pressureBins,
    correlation: { keys: corrKeys.map((k) => k.key), labels: corrKeys.map((k) => k.label), matrix },
    oscillation: { ...osc, cvOil: stats.oilStdBpd.cv },
    flagSummary, totals, choke,
  };
}

