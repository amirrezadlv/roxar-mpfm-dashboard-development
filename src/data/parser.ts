/**
 * Data layer – workbook ingestion.
 *
 * parseWorkbook(): ArrayBuffer (.xlsx/.xls/.csv) → Dataset
 * buildDataset():  generic row objects → Dataset (shared with the embedded sample)
 */

import * as XLSX from "xlsx";
import { bindHeaders, type CanonicalField, type ColumnBinding } from "./columnMap";
import type { Dataset, MpfmRecord, Provenance, TestContext } from "./types";

// ---------------------------------------------------------------------------
// Timestamp helpers
// ---------------------------------------------------------------------------

function excelSerialToDate(serial: number): Date {
  // Excel epoch 1899-12-30
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  return new Date(ms);
}

function parseDatePart(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (typeof v === "number") return excelSerialToDate(v);
  if (typeof v === "string") {
    const s = v.trim();
    // m/d/yyyy or d.m.yyyy or yyyy-mm-dd
    const m1 = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
    if (m1) {
      const a = +m1[1], b = +m1[2];
      let y = +m1[3];
      if (y < 100) y += 2000;
      // Assume US m/d/y unless first > 12
      const month = a > 12 ? b : a;
      const day = a > 12 ? a : b;
      return new Date(y, month - 1, day);
    }
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

/** Returns milliseconds since midnight */
function parseClockPart(v: unknown): number | null {
  if (v instanceof Date) return v.getHours() * 3.6e6 + v.getMinutes() * 6e4 + v.getSeconds() * 1e3;
  if (typeof v === "number") {
    const frac = v - Math.floor(v);
    return Math.round(frac * 86400 * 1000);
  }
  if (typeof v === "string") {
    const m = v.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i);
    if (m) {
      let h = +m[1];
      const mi = +m[2];
      const s = m[3] ? +m[3] : 0;
      if (m[4]) {
        const pm = m[4].toLowerCase() === "pm";
        if (pm && h < 12) h += 12;
        if (!pm && h === 12) h = 0;
      }
      return h * 3.6e6 + mi * 6e4 + s * 1e3;
    }
  }
  return null;
}

function combineDateClock(date: Date | null, clockMs: number | null, fallbackIndex: number, intervalMs = 60000): Date {
  if (date && clockMs !== null) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return new Date(d.getTime() + clockMs);
  }
  if (date) return date;
  if (clockMs !== null) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return new Date(d.getTime() + clockMs);
  }
  return new Date(Date.UTC(2026, 0, 1) + fallbackIndex * intervalMs);
}

// ---------------------------------------------------------------------------
// Context extraction from file name
// ---------------------------------------------------------------------------

export function contextFromFileName(name: string): TestContext {
  const ctx: TestContext = {};
  const pad = name.match(/pad\s*#?\s*(\d+)/i);
  if (pad) ctx.pad = `Pad #${pad[1]}`;
  const well = name.match(/([A-Z]{2,5})\s*#\s*(\d+)/);
  if (well && !/pad/i.test(well[1])) ctx.well = `${well[1]} #${well[2]}`;
  const p = name.match(/P1avg[,_]?P2avg[_\s]*(\d+)[_.](\d+)[_\s]*(\d+)[_.](\d+)[_\s]*psi/i);
  if (p) {
    ctx.p1Psi = parseFloat(`${p[1]}.${p[2]}`);
    ctx.p2Psi = parseFloat(`${p[3]}.${p[4]}`);
  }
  const choke = name.match(/choke[_\s]*size\s*=?\s*(\d+)[_\/](\d+)/i);
  if (choke) {
    ctx.chokeNumerator = +choke[1];
    ctx.chokeDenominator = +choke[2];
  }
  const date = name.match(/(\d{1,2})[_\s-]?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i);
  if (date) ctx.testDate = `${date[1]} ${date[2]}`;
  return ctx;
}

// ---------------------------------------------------------------------------
// Core builder
// ---------------------------------------------------------------------------

const num = (v: unknown): number | undefined => {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
};

export function buildDataset(
  rows: Record<string, unknown>[],
  headers: string[],
  name: string,
  context: TestContext = {},
): Dataset {
  const bindings = bindHeaders(headers);
  const byField = new Map<CanonicalField, ColumnBinding[]>();
  for (const b of bindings) {
    if (b.field === "ignore") continue;
    const list = byField.get(b.field) ?? [];
    list.push(b);
    byField.set(b.field, list);
  }

  const getNum = (row: Record<string, unknown>, field: CanonicalField): number | undefined => {
    const bs = byField.get(field);
    if (!bs) return undefined;
    for (const b of bs) {
      const v = num(row[b.header]);
      if (v !== undefined) return b.convert(v);
    }
    return undefined;
  };
  const getRaw = (row: Record<string, unknown>, field: CanonicalField): unknown => {
    const bs = byField.get(field);
    return bs && bs.length ? row[bs[0].header] : undefined;
  };

  const has = (f: CanonicalField) => byField.has(f);
  const provenance: Record<string, Provenance> = {};
  const mark = (k: string, p: Provenance) => {
    if (!provenance[k] || provenance[k] === "missing") provenance[k] = p;
  };

  const records: MpfmRecord[] = [];
  rows.forEach((row, i) => {
    const pressure = getNum(row, "pressure");
    const temperature = getNum(row, "temperature");
    if (pressure === undefined && temperature === undefined) return; // skip blank/footer rows

    // timestamp
    let ts: Date;
    if (has("timestamp")) {
      const t = getRaw(row, "timestamp");
      const d = parseDatePart(t);
      ts = d ?? combineDateClock(null, null, i);
    } else {
      ts = combineDateClock(parseDatePart(getRaw(row, "date")), parseClockPart(getRaw(row, "clock")), i);
    }

    const waterBoth = getNum(row, "waterActStd");
    const oilAct = getNum(row, "oilAct");
    const oilStd = getNum(row, "oilStd");
    const gasAct = getNum(row, "gasAct");
    const gasStd = getNum(row, "gasStd");
    const waterAct = getNum(row, "waterAct") ?? waterBoth;
    const waterStd = getNum(row, "waterStd") ?? waterBoth;

    const oA = oilAct ?? oilStd ?? 0;
    const oS = oilStd ?? oilAct ?? 0;
    const gA = gasAct ?? 0;
    const gS = gasStd ?? gasAct ?? 0;
    const wA = waterAct ?? 0;
    const wS = waterStd ?? waterAct ?? 0;

    mark("oilAct", oilAct !== undefined ? "measured" : oilStd !== undefined ? "derived" : "missing");
    mark("oilStd", oilStd !== undefined ? "measured" : "derived");
    mark("gasAct", gasAct !== undefined ? "measured" : "missing");
    mark("gasStd", gasStd !== undefined ? "measured" : "derived");
    mark("waterAct", waterAct !== undefined ? "measured" : "missing");
    mark("waterStd", waterStd !== undefined ? "measured" : "derived");

    let gvf = getNum(row, "gvf");
    if (gvf === undefined) {
      const tot = oA + wA + gA;
      gvf = tot > 0 ? (100 * gA) / tot : 0;
      mark("gvf", "derived");
    } else mark("gvf", "measured");

    let wlr = getNum(row, "wlr");
    if (wlr === undefined) {
      const liq = oA + wA;
      wlr = liq > 0 ? (100 * wA) / liq : 0;
      mark("wlr", "derived");
    } else mark("wlr", "measured");

    let waterCut = getNum(row, "waterCut");
    if (waterCut === undefined) {
      const liq = oS + wS;
      waterCut = liq > 0 ? (100 * wS) / liq : 0;
      mark("waterCut", "derived");
    } else mark("waterCut", "measured");

    const mixDensity = getNum(row, "mixDensity");
    mark("mixDensity", mixDensity !== undefined ? "measured" : "modeled");
    const venturiDp = getNum(row, "venturiDp");
    mark("venturiDp", venturiDp !== undefined ? "measured" : "modeled");
    const permittivity = getNum(row, "permittivity");
    mark("permittivity", permittivity !== undefined ? "measured" : "modeled");
    const conductivity = getNum(row, "conductivity");
    mark("conductivity", conductivity !== undefined ? "measured" : "modeled");

    let gor = getNum(row, "gor");
    if (gor === undefined) {
      gor = oS > 0 ? gS / oS : undefined;
      mark("gor", "derived");
    } else mark("gor", "measured");

    const oilMassAct = getNum(row, "oilMassAct");
    const gasMassAct = getNum(row, "gasMassAct");
    const waterMassAct = getNum(row, "waterMassAct");
    mark("massRates", oilMassAct !== undefined ? "measured" : "modeled");

    const accRaw = getRaw(row, "accReset");
    const accReset =
      accRaw === undefined ? undefined : typeof accRaw === "boolean" ? accRaw : /1|true|yes|reset/i.test(String(accRaw));
    const pa = getRaw(row, "processAlarms");
    const ta = getRaw(row, "technicalAlarms");
    mark("alarms", pa !== undefined || ta !== undefined ? "measured" : "derived");

    records.push({
      index: records.length,
      timestamp: ts,
      timeLabel: ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
      pressureBara: pressure ?? NaN,
      temperatureC: temperature ?? NaN,
      venturiDpMbar: venturiDp,
      oilAct: oA,
      waterAct: wA,
      gasAct: gA,
      oilStd: oS,
      waterStd: wS,
      gasStd: gS,
      waterCut,
      gvf,
      wlr,
      mixDensityGml: mixDensity,
      permittivity,
      conductivity,
      gorSm3Sm3: gor,
      oilMassAct,
      gasMassAct,
      waterMassAct,
      accReset,
      processAlarms: pa === undefined || pa === null || pa === "" || pa === 0 ? undefined : String(pa),
      technicalAlarms: ta === undefined || ta === null || ta === "" || ta === 0 ? undefined : String(ta),
      raw: row,
    });
  });

  mark("pressure", has("pressure") ? "measured" : "missing");
  mark("temperature", has("temperature") ? "measured" : "missing");

  // sampling interval
  const dts: number[] = [];
  for (let i = 1; i < records.length; i++) {
    const dt = (records[i].timestamp.getTime() - records[i - 1].timestamp.getTime()) / 60000;
    if (dt > 0 && dt < 24 * 60) dts.push(dt);
  }
  dts.sort((a, b) => a - b);
  const intervalMin = dts.length ? dts[Math.floor(dts.length / 2)] : 1;

  return { name, records, sourceHeaders: headers, provenance, context, intervalMin };
}

// ---------------------------------------------------------------------------
// Workbook entry point
// ---------------------------------------------------------------------------

const HEADER_HINTS = /date|time|pressure|oil|gas|water/i;

export function parseWorkbook(buffer: ArrayBuffer, fileName: string): Dataset {
  const wb = XLSX.read(buffer, { type: "array", cellDates: false });
  // choose sheet with most rows containing a recognisable header
  let best: { rows: unknown[][]; headerIdx: number } | null = null;
  for (const sn of wb.SheetNames) {
    const ws = wb.Sheets[sn];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
    const headerIdx = rows.findIndex(
      (r) => Array.isArray(r) && r.filter((c) => typeof c === "string" && HEADER_HINTS.test(c)).length >= 3,
    );
    if (headerIdx >= 0 && (!best || rows.length > best.rows.length)) best = { rows, headerIdx };
  }
  if (!best) throw new Error("No Roxar MPFM header row found (expected Date/Time, Pressure, Oil/Gas/Water columns).");

  const headers = (best.rows[best.headerIdx] as unknown[]).map((h) => String(h ?? "").trim());
  const dataRows = best.rows.slice(best.headerIdx + 1).map((r) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      if (h) obj[h] = (r as unknown[])[i];
    });
    return obj;
  });

  return buildDataset(dataRows, headers, fileName, contextFromFileName(fileName));
}
