/**
 * Engine – Multiphase flow metering physics (Roxar MPFM 2600 / MVG logic).
 *
 *  1. Volumetric constraint      Q_phase = A_phase · V_phase,   α + β + γ = 1
 *  2. Impedance interpretation   ε_mix = f(α ε_g, β ε_w, γ ε_o)   (oil-continuous)
 *                                σ_mix = f(α σ_g, β σ_w, γ σ_o)   (water-continuous)
 *  3. Gamma densitometer         ρ_mix = α ρ_g + β ρ_w + γ ρ_o
 *  4. Venturi momentum flux      Q = C_q A √(2Δp/ρ_m)  → ṁ = ρ_m Q
 */

import type { MpfmRecord } from "../data/types";
import { auditRecord, gasDensityAct, oilDensityAct, type PvtAudit, type PvtCoefficients } from "./pvt";
import { gmlToKgm3 } from "./units";

// ---------------------------------------------------------------------------
// Fluid & meter configuration
// ---------------------------------------------------------------------------

export interface FluidProps {
  oilDensityStd: number; // kg/m³ stock-tank oil
  waterDensity: number; // kg/m³ produced brine
  gasDensityStd: number; // kg/m³ at standard conditions (SG × 1.225)
  oilPermittivity: number; // ~2.1–2.4
  waterPermittivity: number; // ~60–80 (falls with salinity & temperature)
  gasPermittivity: number; // ~1.0
  waterConductivity: number; // S/m
  inversionWlrPct: number; // phase-inversion threshold on in-situ WLR
  inversionHysteresisPct: number; // hysteresis band around threshold
  meterIdMm: number; // full-bore inlet diameter
  throatDMm: number; // venturi throat diameter
  dischargeCoeff: number; // C_q
  gvfAccuracyLimitPct: number; // Roxar performance envelope upper GVF
}

export const DEFAULT_FLUIDS: FluidProps = {
  oilDensityStd: 940, // ~19 °API – back-calculated from Std.OilMassRate/Std.OilFlowrate
  waterDensity: 1145, // high-salinity brine – back-calculated from water mass rate
  gasDensityStd: 1.11, // SG ≈ 0.91 – back-calculated from Std.GasMassRate/Std.GasFlowrate
  oilPermittivity: 2.3,
  waterPermittivity: 62,
  gasPermittivity: 1.0,
  waterConductivity: 18,
  inversionWlrPct: 45,
  inversionHysteresisPct: 5,
  meterIdMm: 52,
  throatDMm: 30,
  dischargeCoeff: 0.98,
  gvfAccuracyLimitPct: 85,
};

export type ContinuousPhase = "oil" | "water";

// ---------------------------------------------------------------------------
// Mixing rules
// ---------------------------------------------------------------------------

/**
 * Hanai–Bruggeman relation for a dispersed phase (permittivity εd, fraction φ)
 * in a continuous phase εc:  (ε_m − ε_d)/(ε_c − ε_d) · (ε_c/ε_m)^(1/3) = 1 − φ
 * Solved by bisection (monotonic in ε_m between εc and εd).
 */
export function hanaiBruggeman(epsC: number, epsD: number, phi: number): number {
  if (phi <= 0) return epsC;
  if (phi >= 1) return epsD;
  const target = 1 - phi;
  const f = (em: number) => ((em - epsD) / (epsC - epsD)) * Math.cbrt(epsC / em) - target;
  let lo = Math.min(epsC, epsD) * 0.999 + 1e-6;
  let hi = Math.max(epsC, epsD) * 1.001;
  for (let i = 0; i < 60; i++) {
    const mid = 0.5 * (lo + hi);
    if (f(lo) * f(mid) <= 0) hi = mid;
    else lo = mid;
  }
  return 0.5 * (lo + hi);
}

/** Oil-continuous: water droplets in oil, then gas bubbles in the emulsion. */
export function permittivityOilContinuous(alpha: number, beta: number, gamma: number, fp: FluidProps): number {
  const liq = beta + gamma;
  const phiW = liq > 0 ? beta / liq : 0;
  const epsLiq = hanaiBruggeman(fp.oilPermittivity, fp.waterPermittivity, phiW);
  return hanaiBruggeman(epsLiq, fp.gasPermittivity, alpha);
}

/**
 * Water-continuous: Bruggeman effective-medium for non-conducting inclusions
 * (oil + gas) in a conducting brine:  σ_m = σ_w (1 − φ_d)^{3/2}
 */
export function conductivityWaterContinuous(alpha: number, gamma: number, fp: FluidProps): number {
  const phiD = Math.min(1, Math.max(0, alpha + gamma));
  return fp.waterConductivity * Math.pow(1 - phiD, 1.5);
}

/** Permittivity of a water-continuous mixture (for completeness – meter would be in conductivity mode) */
export function permittivityWaterContinuous(alpha: number, gamma: number, fp: FluidProps): number {
  const epsLiq = hanaiBruggeman(fp.waterPermittivity, fp.oilPermittivity, gamma / Math.max(1e-9, 1 - alpha));
  return hanaiBruggeman(epsLiq, fp.gasPermittivity, alpha);
}

// ---------------------------------------------------------------------------
// Per-record physics
// ---------------------------------------------------------------------------

export interface MpfmDerived {
  // fractions (0–1) – reconciled so α+β+γ = 1
  alpha: number;
  beta: number;
  gamma: number;
  fractionClosureRaw: number; // Σ before normalisation (from reported GVF & WLR)
  wlrAct: number; // %
  continuousPhaseRaw: ContinuousPhase; // threshold only – hysteresis applied at dataset level
  inversionMarginPct: number; // distance of WLR from inversion threshold

  // densities kg/m³
  rhoGasAct: number;
  rhoOilAct: number;
  rhoLiquid: number;
  rhoMixModel: number; // homogeneous model from fractions
  rhoMixMeasured: number | undefined; // gamma densitometer
  rhoMixResidualPct: number | undefined;
  gvfFromDensity: number | undefined; // %
  gvfResidualPct: number | undefined; // reported − density-implied (abs %)

  // impedance
  permittivityModel: number;
  conductivityModel: number;

  // momentum / venturi
  massRateTotal: number; // kg/h (measured if exported, else Σρ·Q)
  massRateSource: "measured" | "derived";
  totalActFlow: number; // m³/h
  mixtureVelocityPipe: number; // m/s
  mixtureVelocityThroat: number; // m/s
  superficialGasVel: number; // m/s
  superficialLiquidVel: number; // m/s
  venturiDpModel: number; // mbar – inferred from homogeneous model
  venturiDpMeasured: number | undefined;
  venturiMassRate: number | undefined; // kg/h from measured dp
  venturiClosurePct: number | undefined;
  momentumFlux: number; // ρ_m v² (Pa) at throat

  // ratios
  gorStd: number; // Sm³/Sm³
  liquidStd: number; // Sm³/h

  pvt: PvtAudit;
}

export function analyzeRecord(rec: MpfmRecord, fp: FluidProps, pvtC: PvtCoefficients): MpfmDerived {
  const pvt = auditRecord(rec, pvtC);

  // --- phase fractions from actual volumetric rates -------------------------
  const tot = rec.oilAct + rec.waterAct + rec.gasAct;
  let alpha: number, beta: number, gamma: number;
  if (tot > 0) {
    alpha = rec.gasAct / tot;
    beta = rec.waterAct / tot;
    gamma = rec.oilAct / tot;
  } else {
    alpha = rec.gvf / 100;
    beta = (1 - alpha) * (rec.wlr / 100);
    gamma = 1 - alpha - beta;
  }
  // raw closure from reported fractions (GVF + liquid split)
  const aRep = rec.gvf / 100;
  const bRep = (1 - aRep) * (rec.wlr / 100);
  const gRep = (1 - aRep) * (1 - rec.wlr / 100);
  const fractionClosureRaw = aRep + bRep + gRep;
  const s = alpha + beta + gamma;
  alpha /= s; beta /= s; gamma /= s;

  const liqAct = rec.oilAct + rec.waterAct;
  const wlrAct = liqAct > 0 ? (100 * rec.waterAct) / liqAct : rec.wlr;
  const continuousPhaseRaw: ContinuousPhase = wlrAct >= fp.inversionWlrPct ? "water" : "oil";
  const inversionMarginPct = fp.inversionWlrPct - wlrAct;

  // --- densities -------------------------------------------------------------
  const rhoGasAct = gasDensityAct(fp.gasDensityStd, rec.temperatureC, rec.pressureBara, pvt.zModel);
  const rhoOilAct = oilDensityAct(fp.oilDensityStd, fp.gasDensityStd, pvt.rsModel, pvt.boModel);
  const rhoLiquid = liqAct > 0 ? (rec.oilAct * rhoOilAct + rec.waterAct * fp.waterDensity) / liqAct : rhoOilAct;
  const rhoMixModel = alpha * rhoGasAct + beta * fp.waterDensity + gamma * rhoOilAct;
  const rhoMixMeasured = rec.mixDensityGml !== undefined ? gmlToKgm3(rec.mixDensityGml) : undefined;
  const rhoMixResidualPct =
    rhoMixMeasured !== undefined ? (100 * (rhoMixMeasured - rhoMixModel)) / rhoMixModel : undefined;
  const gvfFromDensity =
    rhoMixMeasured !== undefined ? (100 * (rhoLiquid - rhoMixMeasured)) / (rhoLiquid - rhoGasAct) : undefined;
  const gvfResidualPct = gvfFromDensity !== undefined ? rec.gvf - gvfFromDensity : undefined;

  // --- impedance -------------------------------------------------------------
  const permittivityModel =
    continuousPhaseRaw === "oil"
      ? permittivityOilContinuous(alpha, beta, gamma, fp)
      : permittivityWaterContinuous(alpha, gamma, fp);
  const conductivityModel = continuousPhaseRaw === "water" ? conductivityWaterContinuous(alpha, gamma, fp) : 0;

  // --- momentum / venturi ----------------------------------------------------
  const measuredMass =
    rec.oilMassAct !== undefined && rec.gasMassAct !== undefined && rec.waterMassAct !== undefined
      ? rec.oilMassAct + rec.gasMassAct + rec.waterMassAct
      : undefined;
  const derivedMass = rec.oilAct * rhoOilAct + rec.waterAct * fp.waterDensity + rec.gasAct * rhoGasAct;
  const massRateTotal = measuredMass ?? derivedMass;
  const rhoForVenturi = rhoMixMeasured ?? rhoMixModel;

  const aPipe = (Math.PI * (fp.meterIdMm / 1000) ** 2) / 4;
  const aThroat = (Math.PI * (fp.throatDMm / 1000) ** 2) / 4;
  const qTot = tot / 3600; // m³/s
  const mixtureVelocityPipe = qTot / aPipe;
  const mixtureVelocityThroat = qTot / aThroat;
  const superficialGasVel = rec.gasAct / 3600 / aPipe;
  const superficialLiquidVel = liqAct / 3600 / aPipe;

  // Δp = ρ_m (Q / (C_q A))² / 2   [Pa] → mbar
  const venturiDpModel = (rhoForVenturi * (qTot / (fp.dischargeCoeff * aThroat)) ** 2) / 2 / 100;
  const venturiDpMeasured = rec.venturiDpMbar;
  let venturiMassRate: number | undefined;
  let venturiClosurePct: number | undefined;
  if (venturiDpMeasured !== undefined && venturiDpMeasured > 0) {
    const q = fp.dischargeCoeff * aThroat * Math.sqrt((2 * venturiDpMeasured * 100) / rhoForVenturi);
    venturiMassRate = q * rhoForVenturi * 3600;
    venturiClosurePct = massRateTotal > 0 ? (100 * (venturiMassRate - massRateTotal)) / massRateTotal : undefined;
  }
  const momentumFlux = rhoForVenturi * mixtureVelocityThroat ** 2;

  const liquidStd = rec.oilStd + rec.waterStd;
  const gorStd = rec.oilStd > 0 ? rec.gasStd / rec.oilStd : 0;

  return {
    alpha, beta, gamma, fractionClosureRaw, wlrAct, continuousPhaseRaw, inversionMarginPct,
    rhoGasAct, rhoOilAct, rhoLiquid, rhoMixModel, rhoMixMeasured, rhoMixResidualPct, gvfFromDensity, gvfResidualPct,
    permittivityModel, conductivityModel,
    massRateTotal, massRateSource: measuredMass !== undefined ? "measured" : "derived",
    totalActFlow: tot, mixtureVelocityPipe, mixtureVelocityThroat, superficialGasVel, superficialLiquidVel,
    venturiDpModel, venturiDpMeasured, venturiMassRate, venturiClosurePct, momentumFlux,
    gorStd, liquidStd, pvt,
  };
}
