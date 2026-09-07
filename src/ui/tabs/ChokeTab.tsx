/**
 * UI – Choke / pressure sensitivity: rates vs meter pressure bins, correlations, slug dynamics.
 */
import {
  Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from "recharts";
import type { Analysis } from "../../engine/analytics";
import { fmt } from "../../engine/units";
import { Badge, Card, Kpi, Legend, Stat } from "../primitives";
import { C, ChartTip, axisProps, gridProps, tickEvery } from "../charts";

function corrColor(v: number) {
  if (!Number.isFinite(v)) return "transparent";
  const a = Math.min(1, Math.abs(v));
  return v >= 0 ? `rgba(245,165,36,${0.12 + a * 0.75})` : `rgba(56,189,248,${0.12 + a * 0.75})`;
}

export function ChokeTab({ a }: { a: Analysis }) {
  const rows = a.rows;
  const s = a.stats;
  const step = tickEvery(rows.length);
  const ch = a.choke;
  const { labels, matrix } = a.correlation;
  const pIdx = 0;
  const corrPOil = matrix[pIdx][2];
  const corrPGvf = matrix[pIdx][6];
  const corrPWc = matrix[pIdx][5];

  const bins = a.pressureBins.map((b) => ({ ...b, gasMscf: b.gasStd / 1000 }));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
        <Kpi label="Choke ΔP (P1 − P2)" value={ch.dp} unit="psi" color="text-pressure" sub={ch.p1 !== undefined ? `${fmt(ch.p1, 1)} → ${fmt(ch.p2, 1)} psi` : "not in file name"} />
        <Kpi label="P2 / P1" value={ch.ratio} digits={3} sub={ch.critical === undefined ? "" : ch.critical ? "critical flow ✓" : "sub-critical"} color={ch.critical ? "text-emerald-300" : "text-amber-300"} />
        <Kpi label="Meter P range" value={`${fmt(s.pPsig.min, 0)}–${fmt(s.pPsig.max, 0)}`} unit="psig" sub={`σ ${fmt(s.pPsig.std, 1)} psi`} />
        <Kpi label="ρ(P, Q oil)" value={corrPOil} digits={2} color={corrPOil < -0.5 ? "text-water" : "text-slate-100"} sub="Pearson correlation" />
        <Kpi label="ρ(P, GVF)" value={corrPGvf} digits={2} color={corrPGvf > 0.5 ? "text-oil" : "text-slate-100"} sub="Pearson correlation" />
        <Kpi label="Slug period" value={a.oscillation.periodMin} unit="min" digits={0} sub={`ACF strength ${fmt(a.oscillation.strength, 2)} · oil CV ${fmt(a.oscillation.cvOil, 0)}%`} />
      </div>

      <Card title="Interpretation" subtitle="How the choke pressure differential propagates into the meter readings">
        <div className="grid md:grid-cols-3 gap-3 text-xs text-slate-300 leading-relaxed">
          <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
            <div className="font-semibold text-slate-100 mb-1">Choke regime</div>
            {ch.ratio !== undefined ? (
              ch.critical
                ? <>With P₂/P₁ = {fmt(ch.ratio, 2)} the {fmt((ch.chokeIn ?? 0) * 64, 0)}/64" bean is in critical flow. Mass rate through the choke is fixed by P₁ and fluid properties; the meter-side pressure ({fmt(s.pPsig.mean, 0)} psig avg) is a <b>consequence</b> of downstream hydraulics and slug packing – not a driver of well deliverability.</>
                : <>P₂/P₁ = {fmt(ch.ratio, 2)} – sub-critical. Downstream pressure fluctuations feed back into the choke rate; expect a physical (not just hydraulic) pressure–rate coupling.</>
            ) : "Upload a file whose name carries P1avg/P2avg to enable the critical-flow check."}
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
            <div className="font-semibold text-slate-100 mb-1">Pressure–rate coupling at the meter</div>
            Correlation of line P with oil rate is <b className="num">{fmt(corrPOil, 2)}</b>, with GVF <b className="num">{fmt(corrPGvf, 2)}</b>, with water cut <b className="num">{fmt(corrPWc, 2)}</b>.
            {corrPOil < -0.4 && corrPGvf > 0.4 && <> Pressure rises as gas-rich, oil-lean slugs pass (line packing behind the gas front) and falls as liquid slugs discharge – the classic hydrodynamic slugging signature.</>}
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
            <div className="font-semibold text-slate-100 mb-1">Averaging implication</div>
            Oil-rate CV of <b className="num">{fmt(a.oscillation.cvOil, 0)}%</b>{a.oscillation.periodMin ? <> with a dominant ~{fmt(a.oscillation.periodMin, 0)} min slug period</> : null}. Report rates over windows that are integer multiples of the slug period ({a.oscillation.periodMin ? `≥ ${fmt(a.oscillation.periodMin * 3, 0)} min` : "≥ 30 min"}) to keep averaging bias below ~2%.
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card title="Rates by Meter-Pressure Quartile" subtitle="Average standard rates and fractions per pressure bin (quartile edges)">
          <div className="h-64">
            <ResponsiveContainer>
              <ComposedChart data={bins} margin={{ top: 5, right: 10, left: -5, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis yAxisId="l" {...axisProps} width={50} />
                <YAxis yAxisId="r" orientation="right" domain={[0, 100]} {...axisProps} width={40} />
                <Tooltip content={<ChartTip units={{ oilStd: "STB/d", gasMscf: "Mscf/d", waterStd: "bbl/d", gvf: "%", waterCut: "%" }} digits={{ oilStd: 0 }} />} />
                <Bar yAxisId="l" dataKey="oilStd" name="Oil" fill={C.oil} radius={[3, 3, 0, 0]} />
                <Bar yAxisId="l" dataKey="gasMscf" name="Gas" fill={C.gas} radius={[3, 3, 0, 0]} />
                <Bar yAxisId="l" dataKey="waterStd" name="Water" fill={C.water} radius={[3, 3, 0, 0]} />
                <Line yAxisId="r" type="monotone" dataKey="gvf" name="GVF" stroke={C.density} strokeWidth={1.6} />
                <Line yAxisId="r" type="monotone" dataKey="waterCut" name="Water cut" stroke={C.liquid} strokeWidth={1.6} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <Legend items={[{ label: "Oil STB/d", color: C.oil }, { label: "Gas Mscf/d", color: C.gas }, { label: "Water bbl/d", color: C.water }, { label: "GVF % (right)", color: C.density }, { label: "WC % (right)", color: C.liquid }]} />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
            {bins.map((b) => (
              <div key={b.label} className="rounded-md border border-slate-800 p-2">
                <div className="text-slate-400">{b.label}</div>
                <div className="num text-slate-200">n={b.count} · GOR {fmt(b.gor, 0)} · ρ {fmt(b.density, 0)}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Correlation Matrix" subtitle="Pearson ρ across process & phase variables (amber = positive, blue = negative)">
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] num border-separate border-spacing-0.5">
              <thead>
                <tr>
                  <th></th>
                  {labels.map((l) => <th key={l} className="text-slate-400 font-medium py-1 px-1 text-center">{l}</th>)}
                </tr>
              </thead>
              <tbody>
                {labels.map((l, i) => (
                  <tr key={l}>
                    <td className="text-slate-400 pr-2 text-right font-medium">{l}</td>
                    {labels.map((m, j) => (
                      <td key={m} className="text-center rounded" style={{ background: corrColor(matrix[i][j]), color: Math.abs(matrix[i][j]) > 0.6 ? "#0b1220" : "#e2e8f0" }}>
                        {i === j ? "1" : fmt(matrix[i][j], 2)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card title="Line Pressure vs Oil Rate" subtitle="Point size ∝ GVF">
          <div className="h-60">
            <ResponsiveContainer>
              <ScatterChart margin={{ top: 5, right: 10, left: -5, bottom: 5 }}>
                <CartesianGrid {...gridProps} vertical />
                <XAxis type="number" dataKey="pPsig" name="P" domain={["auto", "auto"]} {...axisProps} label={{ value: "psig", fill: C.axis, fontSize: 10, position: "insideBottomRight", dy: 8 }} />
                <YAxis type="number" dataKey="oilStdBpd" name="Oil" domain={["auto", "auto"]} {...axisProps} width={50} />
                <ZAxis type="number" dataKey="gvf" range={[10, 80]} />
                <Tooltip content={<ChartTip units={{ pPsig: "psig", oilStdBpd: "STB/d", gvf: "%" }} digits={{ oilStdBpd: 0 }} />} />
                <ReferenceLine x={s.pPsig.mean} stroke={C.model} strokeDasharray="3 3" />
                <Scatter data={rows} fill={C.oil} fillOpacity={0.6} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Oil Rate Oscillation & Water Slugs" subtitle="Standard oil rate with water-cut spikes flagged (WC > mean + 2.5σ)">
          <div className="h-60">
            <ResponsiveContainer>
              <ComposedChart data={rows} margin={{ top: 5, right: 10, left: -5, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="timeLabel" interval={step} {...axisProps} />
                <YAxis yAxisId="o" {...axisProps} width={50} />
                <YAxis yAxisId="w" orientation="right" {...axisProps} width={40} />
                <Tooltip content={<ChartTip units={{ oilStdBpd: "STB/d", waterCut: "%" }} digits={{ oilStdBpd: 0 }} />} />
                <Bar yAxisId="w" dataKey="waterCut" name="Water cut" fill={C.water} fillOpacity={0.35} />
                <Line yAxisId="o" type="monotone" dataKey="oilStdBpd" name="Oil std" stroke={C.oil} dot={false} strokeWidth={1.8} />
                <ReferenceLine yAxisId="w" y={s.waterCut.mean + 2.5 * s.waterCut.std} stroke={C.warn} strokeDasharray="3 3" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {rows.filter((r) => r.flags.some((f) => f.code === "WC")).slice(0, 12).map((r) => (
              <Badge key={r.index} tone="water">{r.timeLabel} · {fmt(r.waterCut, 1)}%</Badge>
            ))}
          </div>
        </Card>
      </div>

      <Card title="Statistical Summary" subtitle="Per-variable descriptive statistics over the test window">
        <div className="overflow-x-auto">
          <table className="w-full text-xs num">
            <thead>
              <tr className="text-slate-400 text-left border-b border-slate-800">
                <th className="py-1.5 pr-3 font-medium">Variable</th><th className="font-medium text-right px-2">Mean</th><th className="font-medium text-right px-2">Std</th><th className="font-medium text-right px-2">CV %</th><th className="font-medium text-right px-2">Min</th><th className="font-medium text-right px-2">P10</th><th className="font-medium text-right px-2">P90</th><th className="font-medium text-right px-2">Max</th>
              </tr>
            </thead>
            <tbody>
              {([
                ["Std. oil (STB/d)", "oilStdBpd", 0], ["Std. gas (scf/d)", "gasStdCfd", 0], ["Water (bbl/d)", "waterStdBpd", 1], ["Liquid (bbl/d)", "liquidStdBpd", 0],
                ["Water cut (%)", "waterCut", 2], ["GVF (%)", "gvf", 1], ["WLR in-situ (%)", "wlr", 2], ["GOR (scf/STB)", "gorScf", 0],
                ["Pressure (psig)", "pPsig", 1], ["Temperature (°C)", "tC", 1], ["Mix density (kg/m³)", "density", 0], ["Venturi ΔP (mbar)", "venturiDp", 0],
              ] as [string, string, number][]).map(([label, key, d]) => {
                const st = s[key];
                return (
                  <tr key={key} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                    <td className="py-1.5 pr-3 text-slate-300">{label}</td>
                    <td className="text-right px-2 text-slate-100">{fmt(st.mean, d)}</td>
                    <td className="text-right px-2">{fmt(st.std, d)}</td>
                    <td className="text-right px-2">{fmt(st.cv, 1)}</td>
                    <td className="text-right px-2">{fmt(st.min, d)}</td>
                    <td className="text-right px-2">{fmt(st.p10, d)}</td>
                    <td className="text-right px-2">{fmt(st.p90, d)}</td>
                    <td className="text-right px-2">{fmt(st.max, d)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Stat label="Note" value="Rates ↔ pressure relationships above are hydraulic (downstream of a critical choke) unless P2/P1 > 0.55." mono={false} />
      </Card>
    </div>
  );
}
