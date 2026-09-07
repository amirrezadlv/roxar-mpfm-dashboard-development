/**
 * UI – fluid / meter configuration drawer.
 */
import type { ReactNode } from "react";
import { DEFAULT_FLUIDS, type FluidProps } from "../engine/mpfm";
import { NumberField } from "./primitives";

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">{title}</div>
      {children}
    </div>
  );
}

export function SettingsPanel({ fp, onChange, onClose }: { fp: FluidProps; onChange: (f: FluidProps) => void; onClose: () => void }) {
  const set = <K extends keyof FluidProps>(k: K) => (v: number) => onChange({ ...fp, [k]: v });
  return (
    <aside className="fixed inset-y-0 right-0 z-40 w-[340px] max-w-full border-l border-slate-800 bg-slate-950/95 backdrop-blur p-5 overflow-y-auto shadow-2xl flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-100">Fluid & Meter Configuration</h2>
        <button onClick={onClose} className="text-slate-400 hover:text-white text-lg leading-none">×</button>
      </div>
      <p className="text-xs text-slate-400 -mt-3">Inputs to the density, impedance and Venturi models. Defaults are back-calculated from this dataset's mass/volume ratios.</p>

      <Group title="Phase densities">
        <NumberField label="Oil (stock tank)" value={fp.oilDensityStd} onChange={set("oilDensityStd")} unit="kg/m³" step={1} />
        <NumberField label="Water / brine" value={fp.waterDensity} onChange={set("waterDensity")} unit="kg/m³" step={1} />
        <NumberField label="Gas (std)" value={fp.gasDensityStd} onChange={set("gasDensityStd")} unit="kg/m³" step={0.01} />
      </Group>

      <Group title="Electrical properties">
        <NumberField label="ε oil" value={fp.oilPermittivity} onChange={set("oilPermittivity")} step={0.05} />
        <NumberField label="ε water" value={fp.waterPermittivity} onChange={set("waterPermittivity")} step={1} />
        <NumberField label="ε gas" value={fp.gasPermittivity} onChange={set("gasPermittivity")} step={0.01} />
        <NumberField label="σ water" value={fp.waterConductivity} onChange={set("waterConductivity")} unit="S/m" step={0.5} />
      </Group>

      <Group title="Phase inversion">
        <NumberField label="Inversion WLR" value={fp.inversionWlrPct} onChange={set("inversionWlrPct")} unit="%" step={1} min={5} max={95} />
        <NumberField label="Hysteresis band" value={fp.inversionHysteresisPct} onChange={set("inversionHysteresisPct")} unit="pt" step={1} min={0} />
        <NumberField label="GVF accuracy limit" value={fp.gvfAccuracyLimitPct} onChange={set("gvfAccuracyLimitPct")} unit="%" step={1} />
      </Group>

      <Group title="Venturi geometry">
        <NumberField label="Meter ID" value={fp.meterIdMm} onChange={set("meterIdMm")} unit="mm" step={1} />
        <NumberField label="Throat d" value={fp.throatDMm} onChange={set("throatDMm")} unit="mm" step={0.5} />
        <NumberField label="C_q" value={fp.dischargeCoeff} onChange={set("dischargeCoeff")} step={0.005} />
      </Group>

      <button onClick={() => onChange(DEFAULT_FLUIDS)} className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800">Reset to defaults</button>
    </aside>
  );
}
