/**
 * Engine – unit conversion utilities.
 * All internal calculations use SI / Roxar-native units.
 */

export const PSI_TO_BAR = 0.0689476;
export const ATM_PSI = 14.696;
export const BBL_TO_M3 = 0.158987;
export const FT3_TO_M3 = 0.0283168;
export const SCF_PER_STB_TO_SM3_PER_SM3 = 0.178108;

/** Standard reference conditions used by the Roxar default PVT engine */
export const STD_T_C = 15.6;
export const STD_P_BARA = 1.01325;
export const KELVIN = 273.15;

export const psigToBara = (psig: number) => (psig + ATM_PSI) * PSI_TO_BAR;
export const psiaToBara = (psia: number) => psia * PSI_TO_BAR;
export const baraToPsig = (bara: number) => bara / PSI_TO_BAR - ATM_PSI;
export const bargToBara = (barg: number) => barg + STD_P_BARA;
export const kpaToBara = (kpa: number) => kpa / 100;

export const fToC = (f: number) => ((f - 32) * 5) / 9;
export const cToF = (c: number) => (c * 9) / 5 + 32;
export const cToK = (c: number) => c + KELVIN;

export const bpdToM3h = (bpd: number) => (bpd * BBL_TO_M3) / 24;
export const m3hToBpd = (m3h: number) => (m3h * 24) / BBL_TO_M3;
export const cfdToM3h = (cfd: number) => (cfd * FT3_TO_M3) / 24;
export const m3hToCfd = (m3h: number) => (m3h * 24) / FT3_TO_M3;
export const m3dToM3h = (m3d: number) => m3d / 24;

export const kgm3ToGml = (v: number) => v / 1000;
export const gmlToKgm3 = (v: number) => v * 1000;

export const kgdToKgh = (v: number) => v / 24;

export const scfStbToSm3Sm3 = (v: number) => v * SCF_PER_STB_TO_SM3_PER_SM3;
export const sm3Sm3ToScfStb = (v: number) => v / SCF_PER_STB_TO_SM3_PER_SM3;

export const isFiniteNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

export const fmt = (v: number | undefined, digits = 1): string => {
  if (v === undefined || !Number.isFinite(v)) return "—";
  return v.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};

export const fmtInt = (v: number | undefined): string => fmt(v, 0);
