/**
 * Data layer – canonical types.
 *
 * Every record ingested from a Roxar MPFM 2600 export (regardless of the
 * original header naming or unit system) is normalised into `MpfmRecord`
 * using SI / Roxar-native units:
 *   - pressure        bar(a)
 *   - temperature     °C
 *   - volumetric rate m³/h  (actual and standard conditions)
 *   - density         g/ml
 *   - venturi dP      mbar
 *   - mass rate       kg/h
 */

export type Provenance = "measured" | "derived" | "modeled" | "missing";

export interface MpfmRecord {
  index: number;
  timestamp: Date;
  timeLabel: string;

  /** Transmitter raw data */
  pressureBara: number;
  temperatureC: number;
  venturiDpMbar?: number;

  /** Volumetric rates – actual (line) conditions, m³/h */
  oilAct: number;
  waterAct: number;
  gasAct: number;

  /** Volumetric rates – standard conditions (15.6 °C, 1.01 bar(a)), m³/h */
  oilStd: number;
  waterStd: number;
  gasStd: number;

  /** Phase fractions, % */
  waterCut: number; // standard-condition water cut
  gvf: number; // actual gas volume fraction
  wlr: number; // actual water-in-liquid ratio

  /** Electrical / radiometric */
  mixDensityGml?: number;
  permittivity?: number;
  conductivity?: number;

  /** Ratios */
  gorSm3Sm3?: number;

  /** Mass rates kg/h (actual conditions) when exported by the meter */
  oilMassAct?: number;
  gasMassAct?: number;
  waterMassAct?: number;

  /** Status */
  accReset?: boolean;
  processAlarms?: string;
  technicalAlarms?: string;

  /** Original row for traceability */
  raw: Record<string, unknown>;
}

export interface TestContext {
  pad?: string;
  well?: string;
  p1Psi?: number; // upstream choke pressure
  p2Psi?: number; // downstream choke pressure
  chokeNumerator?: number; // e.g. 20 (of 64ths)
  chokeDenominator?: number; // 64
  testDate?: string;
}

export interface Dataset {
  name: string;
  records: MpfmRecord[];
  sourceHeaders: string[];
  provenance: Record<string, Provenance>;
  context: TestContext;
  /** Median sampling interval in minutes */
  intervalMin: number;
}
