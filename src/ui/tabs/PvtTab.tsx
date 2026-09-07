/**
 * UI – PVT audit: line → standard conversion factors, implied vs modelled.
 */
import {
  Bar, BarChart, CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { Analysis } from "../../engine/analytics";
import { PVT_COEFF_META, type PvtCoefficients } from "../../engine/pvt";
import { fmt, STD_P_BARA, STD_T_C } from "../../engine/units";
import { Card, Formula, Kpi, Legend, NumberField, Stat } from "../primitives";
import { C, ChartTip, axisProps, gridProps, tickEvery } from "../charts";

export function PvtTab({ a, pvt, onPvt }: { a: Analysis; pvt: PvtCoefficients; onPvt: (p: PvtCoefficients) => void }) {
  const rows = a.rows;
  const s = a.stats;
  const step = tickEvery(rows.length);

  const data = rows.map((r) => ({
    timeLabel: r.timeLabel,
    boImplied: r.pvt.boImplied,
    boModel: r.pvt.boModel,
    boRes: r.pvt.boResidualPct,
    expImplied: r.pvt.expansionImplied,
    expModel: r.pvt.expansionModel,
    zImplied: r.pvt.zImplied,
    zModel: r.pvt.zModel,
    rs: r.pvt.rsModel,
    gasRes: r.pvt.gasResidualPct,
    dissolved: r.pvt.dissolvedGasStd,
    free: r.pvt.freeGasStd,
    p: r.pressureBara,
    t: r.temperatureC,
  }));

  // histogram of Bo residuals
  const res = data.map((d) => d.boRes).filter(Number.isFinite);
  const bins = 15;
  const lo = Math.min(...res), hi = Math.max(...res);
  const w = (hi - lo) / bins || 1;
  const hist = Array.from({ length: bins }, (_, i) => ({ x: `${fmt(lo + i * w, 2)}`, n: 0 }));
  res.forEach((v) => { const i = Math.min(bins - 1, Math.floor((v - lo) / w)); hist[i].n++; });

  const gasRes = data.map((d) => d.gasRes).filter(Number.isFinite);
  const gasResMean = gasRes.reduce((x, y) => x + y, 0) / (gasRes.length || 1);

  const set = (k: keyof PvtCoefficients, v: number) => onPvt({ ...pvt, [k]: v });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
        <Kpi label="Bo implied (meter)" value={s.boImplied.mean} digits={4} unit="m³/Sm³" color="text-oil" sub={`σ ${fmt(s.boImplied.std, 4)}`} />
        <Kpi label="Bo model" value={s.boModel.mean} digits={4} unit="m³/Sm³" sub={`residual ${fmt((100 * (s.boImplied.mean - s.boModel.mean)) / s.boModel.mean, 2)}%`} />
        <Kpi label="Rs model" value={s.rsModel.mean} digits={2} unit="Sm³/Sm³" sub={`${fmt(s.rsModel.mean / 0.178108, 1)} scf/STB`} />
        <Kpi label="Z model" value={s.zModel.mean} digits={4} sub={`implied ${fmt(s.zImplied.mean, 3)}`} />
        <Kpi label="Gas act. residual" value={gasResMean} digits={1} unit="%" color={Math.abs(gasResMean) < 5 ? "text-emerald-300" : "text-amber-300"} sub="reported vs modelled act. gas" />
        <Kpi label="Std. conditions" value={`${STD_T_C} °C`} unit={`/ ${STD_P_BARA} bar(a)`} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2" title="Oil Shrinkage Factor  Bo = A0 + A1·T + (B0 + B1·T)·P" subtitle="Implied Bo = Q_oil,act / Q_oil,std as applied by the meter, versus the coefficient model. Flat implied Bo ⇒ meter is running a constant-shrinkage PVT table.">
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={data} margin={{ top: 5, right: 10, left: -5, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="timeLabel" interval={step} {...axisProps} />
                <YAxis domain={["auto", "auto"]} tickFormatter={(v) => fmt(v, 3)} {...axisProps} width={55} />
                <Tooltip content={<ChartTip digits={{ boImplied: 4, boModel: 4 }} />} />
                <Line type="monotone" dataKey="boImplied" name="Bo implied" stroke={C.oil} dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="boModel" name="Bo model" stroke={C.model} dot={false} strokeWidth={1.4} strokeDasharray="5 3" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <Legend items={[{ label: "Implied (Q_act / Q_std)", color: C.oil }, { label: "Model", color: C.model, dashed: true }]} />
        </Card>

        <Card title="Bo Residual Distribution" subtitle="(implied − model) / model, %">
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={hist} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="x" interval={3} {...axisProps} />
                <YAxis {...axisProps} width={40} allowDecimals={false} />
                <Tooltip content={<ChartTip labelPrefix="res ≥ " digits={{ n: 0 }} />} />
                <Bar dataKey="n" name="samples" fill={C.oil} fillOpacity={0.8} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card title="Gas Expansion  E = (P_std/P)(T/T_std)·Z" subtitle="Implied E = Q_gas,act / (Q_gas,std − Rs·Q_oil,std). Z back-calculated on the right axis. Persistent implied-Z ≠ model-Z ⇒ Rs or reference-condition mismatch.">
          <div className="h-64">
            <ResponsiveContainer>
              <ComposedChart data={data} margin={{ top: 5, right: 10, left: -5, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="timeLabel" interval={step} {...axisProps} />
                <YAxis yAxisId="e" domain={["auto", "auto"]} tickFormatter={(v) => fmt(v, 3)} {...axisProps} width={55} />
                <YAxis yAxisId="z" orientation="right" domain={["auto", "auto"]} tickFormatter={(v) => fmt(v, 2)} {...axisProps} width={45} />
                <Tooltip content={<ChartTip digits={{ expImplied: 4, expModel: 4, zImplied: 3, zModel: 3 }} />} />
                <Line yAxisId="e" type="monotone" dataKey="expImplied" name="E implied" stroke={C.gas} dot={false} strokeWidth={2} />
                <Line yAxisId="e" type="monotone" dataKey="expModel" name="E model" stroke={C.model} dot={false} strokeWidth={1.4} strokeDasharray="5 3" />
                <Line yAxisId="z" type="monotone" dataKey="zImplied" name="Z implied" stroke={C.liquid} dot={false} strokeWidth={1.2} />
                <Line yAxisId="z" type="monotone" dataKey="zModel" name="Z model" stroke={C.liquid} dot={false} strokeWidth={1} strokeDasharray="2 3" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <Legend items={[{ label: "E implied", color: C.gas }, { label: "E model", color: C.model, dashed: true }, { label: "Z implied / model (right)", color: C.liquid }]} />
        </Card>

        <Card title="Gas in Solution  Rs = D0 + D1·T + (E0 + E1·T)·P" subtitle="Standard gas split into free gas (measured in line) and gas liberated from oil between line and stock-tank conditions.">
          <div className="h-64">
            <ResponsiveContainer>
              <ComposedChart data={data} margin={{ top: 5, right: 10, left: -5, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="timeLabel" interval={step} {...axisProps} />
                <YAxis yAxisId="q" {...axisProps} width={50} />
                <YAxis yAxisId="rs" orientation="right" domain={[0, "auto"]} {...axisProps} width={40} />
                <Tooltip content={<ChartTip units={{ free: "Sm³/h", dissolved: "Sm³/h", rs: "Sm³/Sm³" }} digits={{ rs: 2 }} />} />
                <Bar yAxisId="q" dataKey="free" name="Free gas (std)" stackId="g" fill={C.gas} fillOpacity={0.6} />
                <Bar yAxisId="q" dataKey="dissolved" name="Dissolved gas Rs·Qo" stackId="g" fill={C.oil} fillOpacity={0.7} />
                <Line yAxisId="rs" type="monotone" dataKey="rs" name="Rs" stroke={C.temp} dot={false} strokeWidth={1.6} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <Legend items={[{ label: "Free gas Sm³/h", color: C.gas }, { label: "Dissolved gas Sm³/h", color: C.oil }, { label: "Rs Sm³/Sm³ (right)", color: C.temp }]} />
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2" title="Gas Actual-Rate Residual" subtitle="(Q_gas,act reported − Q_gas,act model) / model. Tune E0 (Rs slope) and G0 (Z slope) in the editor to close the audit.">
          <div className="h-52">
            <ResponsiveContainer>
              <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="timeLabel" interval={step} {...axisProps} />
                <YAxis {...axisProps} width={45} tickFormatter={(v) => `${fmt(v, 0)}%`} />
                <Tooltip content={<ChartTip units={{ gasRes: "%" }} />} />
                <ReferenceLine y={0} stroke={C.model} />
                <ReferenceLine y={5} stroke={C.warn} strokeDasharray="3 3" />
                <ReferenceLine y={-5} stroke={C.warn} strokeDasharray="3 3" />
                <Bar dataKey="gasRes" name="Gas residual" fill={C.gas} fillOpacity={0.75} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="PVT Coefficient Editor" subtitle="Roxar default-equation coefficients (T in °C, P in bar(a)). Changes propagate live through every tab.">
          <Formula>Bo = A0 + A1·T + (B0 + B1·T)·P</Formula>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {PVT_COEFF_META.filter((m) => m.group === "Bo").map((m) => (
              <NumberField key={m.key} label={m.label} value={pvt[m.key]} step={m.step} onChange={(v) => set(m.key, v)} />
            ))}
          </div>
          <Formula>Rs = D0 + D1·T + (E0 + E1·T)·P</Formula>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {PVT_COEFF_META.filter((m) => m.group === "Rs").map((m) => (
              <NumberField key={m.key} label={m.label} value={pvt[m.key]} step={m.step} onChange={(v) => set(m.key, v)} />
            ))}
          </div>
          <Formula>Z = F0 + F1·T + (G0 + G1·T)·P</Formula>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {PVT_COEFF_META.filter((m) => m.group === "Z").map((m) => (
              <NumberField key={m.key} label={m.label} value={pvt[m.key]} step={m.step} onChange={(v) => set(m.key, v)} />
            ))}
          </div>
          <div className="mt-1">
            <Stat label="Eval @ mean line conditions" value={`${fmt(s.tC.mean, 1)} °C · ${fmt(s.pBara.mean, 2)} bar(a)`} />
            <Stat label="Bo / Rs / Z" value={`${fmt(s.boModel.mean, 4)} · ${fmt(s.rsModel.mean, 2)} · ${fmt(s.zModel.mean, 4)}`} />
          </div>
        </Card>
      </div>
    </div>
  );
}
