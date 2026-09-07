/**
 * Engine – PVT conversions (line → standard conditions).
 *
 * Roxar MPFM default PVT engine expresses the conversion factors as bilinear
 * functions of line temperature T (°C) and line pressure P (bar(a)):
 *
 *   Oil shrinkage factor   Bo = A0 + A1·T + (B0 + B1·T)·P        [m³/Sm³]
 *   Gas in solution        Rs = D0 + D1·T + (E0 + E1·T)·P        [Sm³/Sm³]
 *   Gas compressibility    Z  = F0 + F1·T + (G0 + G1·T)·P        [-]
 *
 * With these, the meter converts actual (in-situ) rates:
 *   Q_oil,std = Q_oil,act / Bo
 *   Q_gas,std = Q_gas,act / E  +  Rs · Q_oil,std      E = (P_std/P)(T_K/T_std,K) Z
 *   Q_wat,std = Q_wat,act        (water treated as incompressible, Bw = 1)
 */

import { cToK, STD_P_BARA, STD_T_C } from "./units";
import type { MpfmRecord } from "../data/types";

export interface PvtCoefficients {
  A0: number; A1: number; B0: number; B1: number; // Bo
  D0: number; D1: number; E0: number; E1: number; // Rs
  F0: number; F1: number; G0: number; G1: number; // Z
}

/**
 * Default coefficient set tuned for a ~19 °API black oil at low separator
 * pressure (the Pad#20 / AZN#59 regime). Users can override in Settings.
 */
export const DEFAULT_PVT: PvtCoefficients = {
  A0: 1.045, A1: 0.0003, B0: 0.0007, B1: 0,
  D0: 0, D1: 0, E0: 2.0, E1: 0,
  F0: 1.0, F1: 0, G0: -0.002, G1: 0.000005,
};

export const PVT_COEFF_META: { key: keyof PvtCoefficients; group: "Bo" | "Rs" | "Z"; label: string; step: number }[] = [
  { key: "A0", group: "Bo", label: "A0 (intercept)", step: 0.001 },
  { key: "A1", group: "Bo", label: "A1 (×T)", step: 0.0001 },
  { key: "B0", group: "Bo", label: "B0 (×P)", step: 0.0001 },
  { key: "B1", group: "Bo", label: "B1 (×T·P)", step: 0.00001 },
  { key: "D0", group: "Rs", label: "D0 (intercept)", step: 0.1 },
  { key: "D1", group: "Rs", label: "D1 (×T)", step: 0.01 },
  { key: "E0", group: "Rs", label: "E0 (×P)", step: 0.1 },
  { key: "E1", group: "Rs", label: "E1 (×T·P)", step: 0.001 },
  { key: "F0", group: "Z", label: "F0 (intercept)", step: 0.001 },
  { key: "F1", group: "Z", label: "F1 (×T)", step: 0.0001 },
  { key: "G0", group: "Z", label: "G0 (×P)", step: 0.0001 },
  { key: "G1", group: "Z", label: "G1 (×T·P)", step: 0.000001 },
];

export const shrinkageFactorBo = (T: number, P: number, c: PvtCoefficients) =>
  c.A0 + c.A1 * T + (c.B0 + c.B1 * T) * P;

export const solutionGasRs = (T: number, P: number, c: PvtCoefficients) =>
  Math.max(0, c.D0 + c.D1 * T + (c.E0 + c.E1 * T) * P);

export const gasCompressibilityZ = (T: number, P: number, c: PvtCoefficients) =>
  c.F0 + c.F1 * T + (c.G0 + c.G1 * T) * P;

/** Ideal-gas volume ratio (act/std) before Z-correction */
export const idealExpansion = (T: number, P: number) => (STD_P_BARA / P) * (cToK(T) / cToK(STD_T_C));

/** Real-gas expansion factor E = V_act / V_std */
export const gasExpansionFactor = (T: number, P: number, Z: number) => idealExpansion(T, P) * Z;

/** Gas density at line conditions from standard density */
export const gasDensityAct = (rhoGasStd: number, T: number, P: number, Z: number) =>
  rhoGasStd / gasExpansionFactor(T, P, Z);

/** Live oil density at line conditions (mass of stock-tank oil + dissolved gas per m³ of live oil) */
export const oilDensityAct = (rhoOilStd: number, rhoGasStd: number, Rs: number, Bo: number) =>
  (rhoOilStd + Rs * rhoGasStd) / Bo;

export interface PvtAudit {
  boModel: number;
  boImplied: number; // Q_oil,act / Q_oil,std reported by the meter
  boResidualPct: number; // (implied − model)/model
  rsModel: number;
  zModel: number;
  expansionModel: number; // E = act/std gas volume factor
  expansionImplied: number; // Q_gas,act / Q_gas,free,std
  zImplied: number; // back-calculated Z from meter data (using model Rs)
  freeGasStd: number; // Q_gas,std − Rs·Q_oil,std  [Sm³/h]
  dissolvedGasStd: number; // Rs·Q_oil,std
  gasActModel: number; // predicted actual gas rate [m³/h]
  gasResidualPct: number; // (reported act gas − model act gas)/model
  oilStdModel: number; // Q_oil,act / Bo_model
  oilStdResidualPct: number;
}

export function auditRecord(rec: MpfmRecord, c: PvtCoefficients): PvtAudit {
  const T = rec.temperatureC;
  const P = rec.pressureBara;
  const boModel = shrinkageFactorBo(T, P, c);
  const rsModel = solutionGasRs(T, P, c);
  const zModel = gasCompressibilityZ(T, P, c);
  const expansionModel = gasExpansionFactor(T, P, zModel);

  const boImplied = rec.oilStd > 0 ? rec.oilAct / rec.oilStd : NaN;
  const dissolvedGasStd = rsModel * rec.oilStd;
  const freeGasStd = Math.max(0, rec.gasStd - dissolvedGasStd);
  const gasActModel = freeGasStd * expansionModel;
  const expansionImplied = freeGasStd > 0 ? rec.gasAct / freeGasStd : NaN;
  const zImplied = expansionImplied / idealExpansion(T, P);
  const oilStdModel = rec.oilAct / boModel;

  return {
    boModel,
    boImplied,
    boResidualPct: Number.isFinite(boImplied) ? (100 * (boImplied - boModel)) / boModel : NaN,
    rsModel,
    zModel,
    expansionModel,
    expansionImplied,
    zImplied,
    freeGasStd,
    dissolvedGasStd,
    gasActModel,
    gasResidualPct: gasActModel > 0 ? (100 * (rec.gasAct - gasActModel)) / gasActModel : NaN,
    oilStdModel,
    oilStdResidualPct: rec.oilStd > 0 ? (100 * (oilStdModel - rec.oilStd)) / rec.oilStd : NaN,
  };
}
