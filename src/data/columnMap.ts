/**
 * Data layer – header recognition & unit normalisation.
 *
 * Roxar MPFM 2600 exports come in several flavours:
 *   1. Native Roxar logger:  "Sensor Time", "Oil (m3/hr) Act", "Water Cut (%)",
 *                            "Flow Pressure (Bar(a))", "Mix Density (g/ml)" ...
 *   2. Field/well-test report (this project's dataset):
 *      "Pressure (psig)", "Std.OilFlowrate (SBPD)", "Act.GasFlowrate (CFD)",
 *      "Act&Std.WaterFlowrate (SBPD)", "Density (Kg/m3)" ...
 *
 * Each header is classified into a canonical field and paired with a unit
 * converter derived from the unit annotation in the header itself.
 */

import {
  bargToBara,
  bpdToM3h,
  cfdToM3h,
  fToC,
  kgdToKgh,
  kgm3ToGml,
  kpaToBara,
  m3dToM3h,
  psiaToBara,
  psigToBara,
  scfStbToSm3Sm3,
} from "../engine/units";

export type CanonicalField =
  | "date"
  | "clock"
  | "timestamp"
  | "pressure"
  | "temperature"
  | "venturiDp"
  | "oilAct"
  | "waterAct"
  | "gasAct"
  | "oilStd"
  | "waterStd"
  | "gasStd"
  | "waterActStd" // "Act&Std" water – applies to both
  | "waterCut"
  | "gvf"
  | "wlr"
  | "mixDensity"
  | "permittivity"
  | "conductivity"
  | "gor"
  | "oilMassAct"
  | "gasMassAct"
  | "waterMassAct"
  | "accReset"
  | "processAlarms"
  | "technicalAlarms"
  | "ignore";

export interface ColumnBinding {
  header: string;
  field: CanonicalField;
  convert: (v: number) => number;
  unitLabel: string;
}

const identity = (v: number) => v;

const unitOf = (h: string): string => {
  const m = h.match(/\(([^)]*)\)/g);
  if (!m) return "";
  return m[m.length - 1].replace(/[()]/g, "").trim().toLowerCase();
};

/** Volumetric-rate converter → m³/h */
function rateConverter(unit: string): [(v: number) => number, string] {
  const u = unit.replace(/\s/g, "");
  if (/^(s?bpd|s?bbl\/d|stb\/d|bopd|bwpd)$/.test(u)) return [bpdToM3h, "bbl/d → m³/h"];
  if (/^(s?cfd|s?cf\/d|ft3\/d|scf\/d)$/.test(u)) return [cfdToM3h, "ft³/d → m³/h"];
  if (/^(mscfd|mscf\/d)$/.test(u)) return [(v) => cfdToM3h(v * 1000), "Mscf/d → m³/h"];
  if (/^(mmscfd|mmscf\/d)$/.test(u)) return [(v) => cfdToM3h(v * 1e6), "MMscf/d → m³/h"];
  if (/^(s?m3\/d|sm3\/day|m3\/day)$/.test(u)) return [m3dToM3h, "m³/d → m³/h"];
  if (/^(s?m3\/hr?|am3\/h)$/.test(u)) return [identity, "m³/h"];
  return [identity, unit || "m³/h (assumed)"];
}

function pressureConverter(unit: string): [(v: number) => number, string] {
  const u = unit.replace(/\s/g, "");
  if (/psig/.test(u)) return [psigToBara, "psig → bar(a)"];
  if (/psia|psi$/.test(u)) return [psiaToBara, "psia → bar(a)"];
  if (/barg/.test(u)) return [bargToBara, "barg → bar(a)"];
  if (/kpa/.test(u)) return [kpaToBara, "kPa → bar(a)"];
  return [identity, "bar(a)"];
}

function temperatureConverter(unit: string): [(v: number) => number, string] {
  if (/f\b|degf|°f|deg f/.test(unit)) return [fToC, "°F → °C"];
  return [identity, "°C"];
}

function densityConverter(unit: string): [(v: number) => number, string] {
  const u = unit.replace(/\s/g, "");
  if (/kg\/m3|kgm3/.test(u)) return [kgm3ToGml, "kg/m³ → g/ml"];
  return [identity, "g/ml"];
}

function dpConverter(unit: string): [(v: number) => number, string] {
  const u = unit.replace(/\s/g, "");
  if (/^mbar/.test(u)) return [identity, "mbar"];
  if (/^bar/.test(u)) return [(v) => v * 1000, "bar → mbar"];
  if (/kpa/.test(u)) return [(v) => v * 10, "kPa → mbar"];
  if (/^pa$/.test(u)) return [(v) => v / 100, "Pa → mbar"];
  if (/psi/.test(u)) return [(v) => v * 68.9476, "psi → mbar"];
  if (/inh2o|"h2o/.test(u)) return [(v) => v * 2.4908, "inH₂O → mbar"];
  return [identity, "mbar (assumed)"];
}

function massConverter(unit: string): [(v: number) => number, string] {
  const u = unit.replace(/\s/g, "");
  if (/kg\/d/.test(u)) return [kgdToKgh, "kg/d → kg/h"];
  if (/t\/d|ton/.test(u)) return [(v) => (v * 1000) / 24, "t/d → kg/h"];
  return [identity, "kg/h"];
}

function gorConverter(unit: string): [(v: number) => number, string] {
  const u = unit.replace(/\s/g, "");
  if (/scf/.test(u) || /cfd\/s?bpd/.test(u)) return [scfStbToSm3Sm3, "scf/stb → Sm³/Sm³"];
  return [identity, "Sm³/Sm³"];
}

/** Classify a single header string. */
export function bindHeader(headerRaw: string): ColumnBinding {
  const header = String(headerRaw ?? "").trim();
  const h = header.toLowerCase();
  const unit = unitOf(h);
  const bind = (field: CanonicalField, conv: [(v: number) => number, string] = [identity, unit]) => ({
    header,
    field,
    convert: conv[0],
    unitLabel: conv[1],
  });

  if (!h) return bind("ignore");
  if (/^date$/.test(h)) return bind("date");
  if (/^(clock|time)$/.test(h)) return bind("clock");
  if (/sensor\s*time|timestamp|date\s*time|datetime/.test(h)) return bind("timestamp");

  if (/acc(um)?\.?\s*reset/.test(h)) return bind("accReset");
  if (/process\s*alarm/.test(h)) return bind("processAlarms");
  if (/technical\s*alarm/.test(h)) return bind("technicalAlarms");

  // accumulated volumes are reproduced by integration – keep raw but don't map
  if (/accum|cumul|total\s*vol/.test(h)) return bind("ignore");

  if (/venturi|differential|\bdp\b|delta\s*p/.test(h)) return bind("venturiDp", dpConverter(unit));
  if (/pressure/.test(h)) return bind("pressure", pressureConverter(unit));
  if (/temp/.test(h)) return bind("temperature", temperatureConverter(unit));

  if (/water\s*cut|watercut|\bwc\b/.test(h)) return bind("waterCut");
  if (/\bgvf\b|gas\s*volume\s*fraction/.test(h)) return bind("gvf");
  if (/\bwlr\b|water\s*(in\s*)?liquid\s*ratio/.test(h)) return bind("wlr");
  if (/permittivity|dielectric/.test(h)) return bind("permittivity");
  if (/conductivity/.test(h)) return bind("conductivity");
  if (/\bgor\b/.test(h)) return bind("gor", gorConverter(unit));
  if (/density/.test(h) && !/oil|gas|water/.test(h.replace(/mix(ture)?/g, "")))
    return bind("mixDensity", densityConverter(unit));
  if (/mix(ture)?\s*density/.test(h)) return bind("mixDensity", densityConverter(unit));

  const isOil = /\boil\b|oil/.test(h);
  const isWater = /water/.test(h);
  const isGas = /\bgas\b|gas/.test(h);
  const isStd = /std|standard|\bs(bpd|cfd|m3)/.test(h);
  const isAct = /\bact|actual/.test(h);
  const isMass = /mass/.test(h);

  if (isMass) {
    if (isStd && !isAct) return bind("ignore"); // std mass is rate × std density – recomputed
    if (isOil) return bind("oilMassAct", massConverter(unit));
    if (isGas) return bind("gasMassAct", massConverter(unit));
    if (isWater) return bind("waterMassAct", massConverter(unit));
  }

  if (isOil || isWater || isGas) {
    const conv = rateConverter(unit);
    if (isWater && isAct && isStd) return bind("waterActStd", conv);
    if (isOil) return bind(isStd && !isAct ? "oilStd" : "oilAct", conv);
    if (isGas) return bind(isStd && !isAct ? "gasStd" : "gasAct", conv);
    if (isWater) return bind(isStd && !isAct ? "waterStd" : "waterAct", conv);
  }

  return bind("ignore");
}

export function bindHeaders(headers: string[]): ColumnBinding[] {
  return headers.map(bindHeader);
}
