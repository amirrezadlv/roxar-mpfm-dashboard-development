/**
 * UI – Venturi / momentum flux: dual-velocity system validation.
 */
import {
  CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis, Area,
} from "recharts";
import type { Analysis } from "../../engine/analytics";
import type { FluidProps } from "../../engine/mpfm";
import type { Dataset } from "../../data/types";
import { fmt } from "../../engine/units";
import { Badge, Card, Formula, Kpi, Legend, Stat } from "../primitives";
import { C, ChartTip, axisProps, gridProps, tickEvery } from "../charts";

export function VenturiTab({ a, ds, fp }: { a: Analysis; ds: Dataset; fp: FluidProps }) {
  const rows = a.rows;
  const s = a.stats;
  const step = tickEvery(rows.length);
  const dpMeasured = ds.provenance.venturiDp === "measured";
  const massMeasured = ds.provenance.massRates === "measured";

  const data = rows.map((r) => ({
    timeLabel: r.timeLabel,
    dp: r.venturiDpMeasured ?? r.venturiDpModel,
    dpModel: r.venturiDpModel,
    vPipe: r.mixtureVelocityPipe,
    vThroat: r.mixtureVelocityThroat,
    vsg: r.superficialGasVel,
    vsl: r.superficialLiquidVel,
    mass: r.massRateTotal / 1000, // t/h
    massVenturi: r.venturiMassRate !== undefined ? r.venturiMassRate / 1000 : undefined,
    closure: r.venturiClosurePct,
    momentum: r.momentumFlux / 1000, // kPa
    rho: r.rhoMixMeasured ?? r.rhoMixModel,
    qTot: r.totalActFlow,
    gvf: r.gvf,
  }));

  const aThroat = (Math.PI * (fp.throatDMm / 1000) ** 2) / 4;
  const beta = fp.throatDMm / fp.meterIdMm;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
        <Kpi label={dpMeasured ? "Venturi ΔP (meas.)" : "Venturi ΔP (inferred)"} value={s.venturiDp.mean} unit="mbar" color="text-pressure" sub={`${fmt(s.venturiDp.min, 0)} – ${fmt(s.venturiDp.max, 0)} mbar`} />
        <Kpi label="Throat mixture velocity" value={s.vMixThroat.mean} unit="m/s" digits={2} sub={`max ${fmt(s.vMixThroat.max, 2)} m/s`} />
        <Kpi label="Total mass rate" value={s.massRate.mean / 1000} unit="t/h" digits={2} sub={massMeasured ? "from exported mass rates" : "Σ ρᵢ·Qᵢ (modelled densities)"} />
        <Kpi label="Mixture density" value={s.density.mean} unit="kg/m³" digits={0} sub={ds.provenance.mixDensity === "measured" ? "gamma densitometer" : "homogeneous model"} />
        <Kpi label="β ratio" value={beta} digits={3} sub={`d ${fp.throatDMm} / D ${fp.meterIdMm} mm`} />
        <Kpi label="C_q" value={fp.dischargeCoeff} digits={3} sub="discharge coefficient" />
      </div>

      <Card title="Homogeneous Venturi Model" subtitle="Roxar MPFM 2600 combines gas velocity from impedance cross-correlation with liquid velocity from Venturi ΔP. The homogeneous model closes total mass flux against the reported phase rates.">
        <div className="grid md:grid-cols-3 gap-3">
          <Formula>Q<sub>m</sub> = C<sub>q</sub>·A·√(2Δp/ρ<sub>m</sub>)   ṁ = ρ<sub>m</sub>·Q<sub>m</sub></Formula>
          <Formula>Δp = ρ<sub>m</sub>·(Q<sub>tot</sub>/(C<sub>q</sub>A))² / 2   (inverse form)</Formula>
          <Formula>A<sub>throat</sub> = π d²/4 = {fmt(aThroat * 1e6, 1)} mm²   v<sub>throat</sub> = Q<sub>tot</sub>/A</Formula>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={dpMeasured ? "green" : "amber"}>{dpMeasured ? "ΔP measured – closure computed" : "ΔP column absent – Δp inferred from reported rates & density"}</Badge>
          <Badge tone={massMeasured ? "green" : "slate"}>{massMeasured ? "Mass rates measured" : "Mass rates modelled"}</Badge>
          <Badge tone="slate">No-slip assumption (v_gas ≈ v_liq) for superficial velocities</Badge>
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card title="Venturi Differential Pressure" subtitle={dpMeasured ? "Measured ΔP vs homogeneous-model ΔP" : "Inferred ΔP the Venturi must have seen to pass the reported total flow"}>
          <div className="h-64">
            <ResponsiveContainer>
              <ComposedChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="timeLabel" interval={step} {...axisProps} />
                <YAxis {...axisProps} width={45} />
                <Tooltip content={<ChartTip units={{ dp: "mbar", dpModel: "mbar" }} />} />
                <Area type="monotone" dataKey="dp" name={dpMeasured ? "ΔP measured" : "ΔP inferred"} stroke={C.pressure} fill={C.pressure} fillOpacity={0.15} strokeWidth={1.8} />
                {dpMeasured && <Line type="monotone" dataKey="dpModel" name="ΔP model" stroke={C.model} dot={false} strokeDasharray="4 3" />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Mixture & Superficial Velocities" subtitle="Throat velocity drives momentum flux; superficial velocities define the flow-regime map position (annular / slug / churn).">
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="timeLabel" interval={step} {...axisProps} />
                <YAxis {...axisProps} width={40} />
                <Tooltip content={<ChartTip units={{ vThroat: "m/s", vPipe: "m/s", vsg: "m/s", vsl: "m/s" }} digits={{ vThroat: 2, vPipe: 2, vsg: 2, vsl: 3 }} />} />
                <Line type="monotone" dataKey="vThroat" name="v mix throat" stroke={C.pressure} dot={false} strokeWidth={1.8} />
                <Line type="monotone" dataKey="vsg" name="v superficial gas" stroke={C.gas} dot={false} strokeWidth={1.4} />
                <Line type="monotone" dataKey="vsl" name="v superficial liquid" stroke={C.liquid} dot={false} strokeWidth={1.4} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <Legend items={[{ label: "Throat mixture", color: C.pressure }, { label: "Superficial gas (pipe)", color: C.gas }, { label: "Superficial liquid (pipe)", color: C.liquid }]} />
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2" title="Δp vs Total Volumetric Flow" subtitle="Should follow Δp ∝ ρm·Q² – vertical spread at constant Q is the density (GVF) effect; colour shading by GVF.">
          <div className="h-64">
            <ResponsiveContainer>
              <ScatterChart margin={{ top: 5, right: 10, left: -5, bottom: 5 }}>
                <CartesianGrid {...gridProps} vertical />
                <XAxis type="number" dataKey="qTot" name="Q total" domain={["auto", "auto"]} {...axisProps} label={{ value: "Q total actual (m³/h)", fill: C.axis, fontSize: 10, position: "insideBottom", dy: 8 }} />
                <YAxis type="number" dataKey="dp" name="ΔP" {...axisProps} width={45} />
                <ZAxis type="number" dataKey="gvf" range={[15, 60]} name="GVF" />
                <Tooltip content={<ChartTip units={{ qTot: "m³/h", dp: "mbar", gvf: "%" }} />} />
                <Scatter data={data} fill={C.pressure} fillOpacity={0.6} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Mass Flux Closure" subtitle="Total mass rate vs momentum flux ρv² at throat">
          <div className="h-40">
            <ResponsiveContainer>
              <ComposedChart data={data} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="timeLabel" interval={step * 2} {...axisProps} />
                <YAxis yAxisId="m" {...axisProps} width={40} />
                <YAxis yAxisId="k" orientation="right" {...axisProps} width={40} />
                <Tooltip content={<ChartTip units={{ mass: "t/h", massVenturi: "t/h", momentum: "kPa" }} digits={{ mass: 2, massVenturi: 2, momentum: 1 }} />} />
                <Line yAxisId="m" type="monotone" dataKey="mass" name="ṁ reported" stroke={C.liquid} dot={false} strokeWidth={1.6} />
                {dpMeasured && <Line yAxisId="m" type="monotone" dataKey="massVenturi" name="ṁ venturi" stroke={C.pressure} dot={false} strokeDasharray="4 3" />}
                <Line yAxisId="k" type="monotone" dataKey="momentum" name="ρv² throat" stroke={C.temp} dot={false} strokeWidth={1} />
                {dpMeasured && <ReferenceLine yAxisId="m" y={0} stroke={C.model} />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div>
            <Stat label="Mean ṁ" value={fmt(s.massRate.mean / 1000, 3)} unit="t/h" />
            <Stat label="ṁ range" value={`${fmt(s.massRate.min / 1000, 2)} – ${fmt(s.massRate.max / 1000, 2)}`} unit="t/h" />
            {dpMeasured && <Stat label="Venturi closure (mean)" value={fmt(rows.reduce((x, r) => x + (r.venturiClosurePct ?? 0), 0) / rows.length, 2)} unit="%" />}
            <Stat label="Liquid mass share" value={fmt(100 * (1 - (rows.reduce((x, r) => x + r.gasAct * r.rhoGasAct, 0) / rows.reduce((x, r) => x + r.massRateTotal, 0))), 1)} unit="%" />
          </div>
        </Card>
      </div>
    </div>
  );
}
