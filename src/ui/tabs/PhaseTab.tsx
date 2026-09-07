/**
 * UI – Phase behaviour: fractions, continuous phase / inversion, impedance & density closure.
 */
import {
  Area, AreaChart, CartesianGrid, ComposedChart, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from "recharts";
import type { Analysis } from "../../engine/analytics";
import { conductivityWaterContinuous, permittivityOilContinuous, permittivityWaterContinuous, type FluidProps } from "../../engine/mpfm";
import { fmt } from "../../engine/units";
import { Badge, Card, Formula, Kpi, Legend, Stat } from "../primitives";
import { C, ChartTip, axisProps, gridProps, tickEvery } from "../charts";

export function PhaseTab({ a, fp }: { a: Analysis; fp: FluidProps }) {
  const rows = a.rows;
  const step = tickEvery(rows.length);
  const s = a.stats;

  const fracData = rows.map((r) => ({
    timeLabel: r.timeLabel,
    gas: r.alpha * 100,
    water: r.beta * 100,
    oil: r.gamma * 100,
    wlr: r.wlrAct,
    margin: r.inversionMarginPct,
    phase: r.continuousPhase,
  }));

  // sweep of impedance response vs WLR at the mean GVF – shows the inversion discontinuity
  const gvfMean = s.gvf.mean / 100;
  const sweep = Array.from({ length: 41 }, (_, i) => {
    const wlr = i / 40;
    const alpha = gvfMean;
    const beta = (1 - alpha) * wlr;
    const gamma = 1 - alpha - beta;
    const waterCont = wlr * 100 >= fp.inversionWlrPct;
    return {
      wlr: wlr * 100,
      permOil: waterCont ? undefined : permittivityOilContinuous(alpha, beta, gamma, fp),
      permWater: waterCont ? permittivityWaterContinuous(alpha, gamma, fp) : undefined,
      cond: waterCont ? conductivityWaterContinuous(alpha, gamma, fp) : 0,
    };
  });

  // phase state segments for the strip
  const segments: { start: number; end: number; phase: "oil" | "water" }[] = [];
  rows.forEach((r, i) => {
    const last = segments[segments.length - 1];
    if (last && last.phase === r.continuousPhase) last.end = i;
    else segments.push({ start: i, end: i, phase: r.continuousPhase });
  });

  const nearInv = rows.filter((r) => Math.abs(r.inversionMarginPct) <= 10).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
        <Kpi label="Continuous phase" value={a.phaseShare.oil >= 50 ? "Oil" : "Water"} unit={`${fmt(Math.max(a.phaseShare.oil, a.phaseShare.water), 0)}% of test`} color={a.phaseShare.oil >= 50 ? "text-oil" : "text-water"} />
        <Kpi label="Inversions" value={a.inversions.length} digits={0} color={a.inversions.length ? "text-rose-300" : "text-emerald-300"} sub={`threshold WLR ${fp.inversionWlrPct}% ± ${fp.inversionHysteresisPct / 2}`} />
        <Kpi label="WLR (in-situ) mean" value={s.wlr.mean} unit="%" color="text-water" sub={`max ${fmt(s.wlr.max, 1)}%`} />
        <Kpi label="Min inversion margin" value={rows.reduce((m, r) => Math.min(m, r.inversionMarginPct), Infinity)} unit="pt" sub={`${nearInv} samples within 10 pt`} color={nearInv ? "text-amber-300" : "text-emerald-300"} />
        <Kpi label="Σ fractions (mean)" value={rows.reduce((x, r) => x + r.fractionClosureRaw, 0) / rows.length} digits={4} sub="α + β + γ from reported GVF & WLR" />
        <Kpi label="ρ-implied GVF residual" value={s.gvfResidual.mean} unit="pt" digits={2} sub={`σ ${fmt(s.gvfResidual.std, 2)} pt · |max| ${fmt(Math.max(Math.abs(s.gvfResidual.min), Math.abs(s.gvfResidual.max)), 1)}`} />
      </div>

      {/* Phase state strip */}
      <Card title="Continuous-Phase State Track" subtitle="Hysteresis-tracked on in-situ WLR (conductivity/permittivity mode flags override when exported by the meter). Red ticks mark inversions.">
        <div className="relative h-8 w-full rounded-md overflow-hidden border border-slate-800 flex">
          {segments.map((sg) => (
            <div
              key={sg.start}
              title={`${rows[sg.start].timeLabel} – ${rows[sg.end].timeLabel}: ${sg.phase}-continuous`}
              style={{ width: `${((sg.end - sg.start + 1) / rows.length) * 100}%`, background: sg.phase === "oil" ? "linear-gradient(180deg,#f5a52488,#f5a52433)" : "linear-gradient(180deg,#38bdf888,#38bdf833)" }}
            />
          ))}
          {a.inversions.map((ev) => (
            <div key={ev.index} className="absolute top-0 bottom-0 w-0.5 bg-rose-400" style={{ left: `${(ev.index / rows.length) * 100}%` }} />
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-slate-500 num">
          <span>{rows[0]?.timeLabel}</span><span>{rows[Math.floor(rows.length / 2)]?.timeLabel}</span><span>{rows[rows.length - 1]?.timeLabel}</span>
        </div>
        {a.inversions.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {a.inversions.map((ev) => (
              <Badge key={ev.index} tone="red">{ev.time} · {ev.from}→{ev.to} @ WLR {fmt(ev.wlr, 1)}%</Badge>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400">
            No inversion: the meter remained in <b className="text-oil">oil-continuous (permittivity) mode</b> throughout. Highest in-situ WLR {fmt(s.wlr.max, 1)}% at{" "}
            {rows.reduce((b, r) => (r.wlrAct > b.wlrAct ? r : b), rows[0])?.timeLabel} leaves a {fmt(fp.inversionWlrPct - s.wlr.max, 1)} pt margin to the {fp.inversionWlrPct}% inversion threshold.
          </p>
        )}
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2" title="In-situ Phase Fractions  α + β + γ = 1" subtitle="Reconciled from actual volumetric rates (Q = A·V): gas α, water β, oil γ">
          <div className="h-64">
            <ResponsiveContainer>
              <AreaChart data={fracData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }} stackOffset="expand">
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="timeLabel" interval={step} {...axisProps} />
                <YAxis tickFormatter={(v) => `${Math.round(v * 100)}%`} {...axisProps} width={40} />
                <Tooltip content={<ChartTip units={{ gas: "%", water: "%", oil: "%" }} />} />
                <Area type="monotone" dataKey="oil" name="Oil γ" stackId="1" stroke={C.oil} fill={C.oil} fillOpacity={0.7} />
                <Area type="monotone" dataKey="water" name="Water β" stackId="1" stroke={C.water} fill={C.water} fillOpacity={0.85} />
                <Area type="monotone" dataKey="gas" name="Gas α" stackId="1" stroke={C.gas} fill={C.gas} fillOpacity={0.45} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <Legend items={[{ label: "Gas α", color: C.gas }, { label: "Water β", color: C.water }, { label: "Oil γ", color: C.oil }]} />
        </Card>

        <Card title="Inversion Margin" subtitle="WLR vs threshold; band = hysteresis">
          <div className="h-64">
            <ResponsiveContainer>
              <ComposedChart data={fracData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="timeLabel" interval={step * 2} {...axisProps} />
                <YAxis domain={[0, Math.max(60, fp.inversionWlrPct + 15)]} {...axisProps} width={40} />
                <Tooltip content={<ChartTip units={{ wlr: "%" }} />} />
                <ReferenceArea y1={fp.inversionWlrPct - fp.inversionHysteresisPct / 2} y2={fp.inversionWlrPct + fp.inversionHysteresisPct / 2} fill={C.bad} fillOpacity={0.15} />
                <ReferenceLine y={fp.inversionWlrPct} stroke={C.bad} strokeDasharray="4 4" label={{ value: "inversion", fill: C.bad, fontSize: 10, position: "insideTopRight" }} />
                <Area type="monotone" dataKey="wlr" name="WLR in-situ" stroke={C.water} fill={C.water} fillOpacity={0.2} strokeWidth={1.6} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card title="Impedance Response vs WLR (at mean GVF)" subtitle="Left of threshold: oil-continuous → permittivity (insulator). Right: water-continuous → conductivity (conductor). The discontinuity is the phase inversion.">
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={sweep} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="wlr" type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} {...axisProps} />
                <YAxis yAxisId="e" {...axisProps} width={40} />
                <YAxis yAxisId="s" orientation="right" {...axisProps} width={40} />
                <Tooltip content={<ChartTip labelPrefix="WLR " units={{ permOil: "", permWater: "", cond: "S/m" }} digits={{ permOil: 2, permWater: 1, cond: 2 }} />} />
                <ReferenceLine yAxisId="e" x={fp.inversionWlrPct} stroke={C.bad} strokeDasharray="4 4" />
                <ReferenceArea yAxisId="e" x1={0} x2={fp.inversionWlrPct} fill={C.oil} fillOpacity={0.05} />
                <ReferenceArea yAxisId="e" x1={fp.inversionWlrPct} x2={100} fill={C.water} fillOpacity={0.05} />
                <Line yAxisId="e" type="monotone" dataKey="permOil" name="ε mix (oil-cont.)" stroke={C.oil} dot={false} strokeWidth={2} connectNulls={false} />
                <Line yAxisId="e" type="monotone" dataKey="permWater" name="ε mix (water-cont.)" stroke={C.temp} dot={false} strokeWidth={1.2} strokeDasharray="3 3" />
                <Line yAxisId="s" type="monotone" dataKey="cond" name="σ mix" stroke={C.water} dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <Legend items={[{ label: "ε mix oil-continuous (left)", color: C.oil }, { label: "σ mix water-continuous S/m (right)", color: C.water }]} />
          <Formula>
            oil-cont.: (ε<sub>m</sub>−ε<sub>d</sub>)/(ε<sub>c</sub>−ε<sub>d</sub>)·(ε<sub>c</sub>/ε<sub>m</sub>)<sup>1/3</sup> = 1−φ<sub>d</sub> (Hanai–Bruggeman)  ·  water-cont.: σ<sub>m</sub> = σ<sub>w</sub>(1−α−γ)<sup>3/2</sup>
          </Formula>
        </Card>

        <Card title="Gamma Densitometer Closure" subtitle="Measured mixture density vs homogeneous model ρm = αρg + βρw + γρo. Off-diagonal points = transient slugs where impedance and gamma time constants diverge.">
          <div className="h-64">
            <ResponsiveContainer>
              <ScatterChart margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid {...gridProps} vertical />
                <XAxis type="number" dataKey="rhoMixModel" name="Model ρ" domain={["auto", "auto"]} {...axisProps} label={{ value: "model ρ (kg/m³)", fill: C.axis, fontSize: 10, position: "insideBottom", dy: 8 }} />
                <YAxis type="number" dataKey="rhoMixMeasured" name="Gamma ρ" domain={["auto", "auto"]} {...axisProps} width={45} />
                <ZAxis type="number" dataKey="gvf" range={[20, 20]} />
                <Tooltip content={<ChartTip units={{ rhoMixModel: "kg/m³", rhoMixMeasured: "kg/m³" }} digits={{ rhoMixModel: 0, rhoMixMeasured: 0 }} />} />
                <ReferenceLine segment={[{ x: 50, y: 50 }, { x: 420, y: 420 }]} stroke={C.model} strokeDasharray="4 4" />
                <Scatter data={rows.filter((r) => r.rhoMixMeasured !== undefined)} fill={C.liquid} fillOpacity={0.7} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-x-6">
            <Stat label="Mean ρ residual" value={`${fmt(s.rhoResidual.mean, 1)} %`} />
            <Stat label="σ ρ residual" value={`${fmt(s.rhoResidual.std, 1)} %`} />
            <Stat label="ρ gas (line)" value={fmt(rows[0]?.rhoGasAct ?? NaN, 2)} unit="kg/m³" />
            <Stat label="ρ oil (live)" value={fmt(rows[0]?.rhoOilAct ?? NaN, 0)} unit="kg/m³" />
          </div>
        </Card>
      </div>

      <Card title="Reported GVF vs Density-Implied GVF" subtitle="αρ = (ρL − ρm)/(ρL − ρg). Sustained offsets point to liquid-density (WLR) misallocation; spikes point to slugs.">
        <div className="h-56">
          <ResponsiveContainer>
            <LineChart data={rows} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="timeLabel" interval={step} {...axisProps} />
              <YAxis domain={[60, 100]} {...axisProps} width={40} />
              <Tooltip content={<ChartTip units={{ gvf: "%", gvfFromDensity: "%" }} />} />
              <Line type="monotone" dataKey="gvf" name="GVF reported" stroke={C.gas} dot={false} strokeWidth={1.8} />
              <Line type="monotone" dataKey="gvfFromDensity" name="GVF from γ-density" stroke={C.density} dot={false} strokeWidth={1.2} strokeDasharray="4 3" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <Legend items={[{ label: "Reported GVF", color: C.gas }, { label: "Density-implied GVF", color: C.density, dashed: true }]} />
      </Card>
    </div>
  );
}
