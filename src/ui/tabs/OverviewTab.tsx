/**
 * UI – Overview: executive KPIs, choke context, production & process trends.
 */
import {
  Area, AreaChart, Bar, CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { Analysis } from "../../engine/analytics";
import type { Dataset } from "../../data/types";
import { fmt, fmtInt } from "../../engine/units";
import { Badge, Card, Kpi, Legend, Stat } from "../primitives";
import { C, ChartTip, axisProps, gridProps, tickEvery } from "../charts";

export function OverviewTab({ a, ds }: { a: Analysis; ds: Dataset }) {
  const s = a.stats;
  const rows = a.rows;
  const step = tickEvery(rows.length);
  const ch = a.choke;
  const alarms = a.flagSummary.filter((f) => f.severity === "alarm").reduce((x, f) => x + f.count, 0);
  const warns = a.flagSummary.filter((f) => f.severity === "warn").reduce((x, f) => x + f.count, 0);

  return (
    <div className="flex flex-col gap-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        <Kpi label="Std. Oil" value={s.oilStdBpd.mean} unit="STB/d" color="text-oil" sub={`σ ${fmt(s.oilStdBpd.std, 0)} · CV ${fmt(s.oilStdBpd.cv, 0)}%`} digits={0} />
        <Kpi label="Std. Gas" value={s.gasStdCfd.mean / 1000} unit="Mscf/d" color="text-gas" sub={`${fmtInt(s.gasStdCfd.min / 1000)} – ${fmtInt(s.gasStdCfd.max / 1000)}`} />
        <Kpi label="Water" value={s.waterStdBpd.mean} unit="bbl/d" color="text-water" sub={`max ${fmt(s.waterStdBpd.max, 1)}`} />
        <Kpi label="Water Cut" value={s.waterCut.mean} unit="%" color="text-water" sub={`P90 ${fmt(s.waterCut.p90, 1)}%`} />
        <Kpi label="GVF (act)" value={s.gvf.mean} unit="%" color="text-gas" sub={`${fmt(s.gvf.min, 0)} – ${fmt(s.gvf.max, 0)}%`} />
        <Kpi label="GOR" value={s.gorScf.mean} unit="scf/STB" sub={`${fmt(s.gorScf.mean * 0.1781, 1)} Sm³/Sm³`} digits={0} />
        <Kpi label="Line P" value={s.pPsig.mean} unit="psig" color="text-pressure" sub={`${fmt(s.pBara.mean, 2)} bar(a)`} />
        <Kpi label="Line T" value={s.tF.mean} unit="°F" color="text-temp" sub={`${fmt(s.tC.mean, 1)} °C`} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Test context */}
        <Card title="Well-Test Context" subtitle="Parsed from file name & meter statistics">
          <div className="flex flex-wrap gap-1.5">
            {ds.context.pad && <Badge tone="sky">{ds.context.pad}</Badge>}
            {ds.context.well && <Badge tone="oil">{ds.context.well}</Badge>}
            {ch.chokeIn !== undefined && <Badge tone="slate">Choke {ds.context.chokeNumerator}/{ds.context.chokeDenominator}" = {fmt(ch.chokeIn * 25.4, 1)} mm</Badge>}
            {ds.context.testDate && <Badge tone="slate">{ds.context.testDate}</Badge>}
            <Badge tone="slate">{rows.length} samples @ {ds.intervalMin} min</Badge>
          </div>
          <div className="mt-1">
            <Stat label="Upstream choke P1 (avg)" value={ch.p1 !== undefined ? fmt(ch.p1, 1) : "—"} unit="psi" />
            <Stat label="Downstream choke P2 (avg)" value={ch.p2 !== undefined ? fmt(ch.p2, 1) : "—"} unit="psi" />
            <Stat label="Choke ΔP" value={ch.dp !== undefined ? fmt(ch.dp, 1) : "—"} unit="psi" />
            <Stat label="P2/P1 (absolute)" value={ch.ratio !== undefined ? fmt(ch.ratio, 3) : "—"} />
            <Stat label="Meter line P (avg)" value={fmt(ch.meterPAvgPsig, 1)} unit="psig" />
            <Stat label="Test duration" value={`${fmt(a.totals.durationMin / 60, 2)} h`} />
          </div>
          {ch.critical !== undefined && (
            <div className={`rounded-lg border px-3 py-2 text-xs ${ch.critical ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-amber-500/30 bg-amber-500/10 text-amber-200"}`}>
              {ch.critical
                ? <>P₂/P₁ = {fmt(ch.ratio!, 2)} &lt; ~0.55 → <b>critical (sonic) choke flow</b>. Rates are governed by upstream pressure; meter-side pressure swings ({fmt(s.pPsig.min, 0)}–{fmt(s.pPsig.max, 0)} psig) reflect downstream slug dynamics, not reservoir deliverability.</>
                : <>P₂/P₁ = {fmt(ch.ratio!, 2)} → <b>sub-critical choke flow</b>; downstream pressure feeds back on rate. Expect correlation between meter P and rates.</>}
            </div>
          )}
        </Card>

        {/* Cumulatives & status */}
        <Card title="Cumulative Production (Std.)" subtitle="Trapezoidal integration of standard-condition rates">
          <div className="grid grid-cols-3 gap-2 mt-1">
            <div className="rounded-lg bg-oil/10 border border-oil/20 p-3">
              <div className="text-[10px] uppercase tracking-wider text-oil/80">Oil</div>
              <div className="text-xl font-semibold text-oil num">{fmt(a.totals.oilStdBbl, 1)}</div>
              <div className="text-[10px] text-slate-400">STB</div>
            </div>
            <div className="rounded-lg bg-gas/10 border border-gas/20 p-3">
              <div className="text-[10px] uppercase tracking-wider text-gas/80">Gas</div>
              <div className="text-xl font-semibold text-gas num">{fmt(a.totals.gasStdMscf, 2)}</div>
              <div className="text-[10px] text-slate-400">Mscf</div>
            </div>
            <div className="rounded-lg bg-water/10 border border-water/20 p-3">
              <div className="text-[10px] uppercase tracking-wider text-water/80">Water</div>
              <div className="text-xl font-semibold text-water num">{fmt(a.totals.waterStdBbl, 2)}</div>
              <div className="text-[10px] text-slate-400">bbl</div>
            </div>
          </div>
          <div className="mt-2">
            <Stat label="Continuous phase" value={a.phaseShare.oil >= 50 ? `Oil-continuous ${fmt(a.phaseShare.oil, 0)}% of test` : `Water-continuous ${fmt(a.phaseShare.water, 0)}% of test`} mono={false} />
            <Stat label="Phase inversions detected" value={a.inversions.length} />
            <Stat label="Slug period (oil rate ACF)" value={a.oscillation.periodMin ? `${fmt(a.oscillation.periodMin, 0)} min` : "n/a"} />
            <Stat label="Diagnostics" value={`${alarms} alarm · ${warns} warn`} mono={false} />
          </div>
        </Card>

        {/* Pressure / temperature */}
        <Card title="Line Pressure & Temperature" subtitle="Transmitter raw data at the meter">
          <div className="h-56">
            <ResponsiveContainer>
              <LineChart data={rows} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="timeLabel" interval={step} {...axisProps} />
                <YAxis yAxisId="p" domain={["auto", "auto"]} {...axisProps} width={45} />
                <YAxis yAxisId="t" orientation="right" domain={["auto", "auto"]} {...axisProps} width={45} />
                <Tooltip content={<ChartTip units={{ pPsig: "psig", tF: "°F" }} />} />
                <Line yAxisId="p" type="monotone" dataKey="pPsig" name="Pressure" stroke={C.pressure} dot={false} strokeWidth={1.8} />
                <Line yAxisId="t" type="monotone" dataKey="tF" name="Temperature" stroke={C.temp} dot={false} strokeWidth={1.5} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <Legend items={[{ label: "Pressure (psig)", color: C.pressure }, { label: "Temperature (°F)", color: C.temp }]} />
        </Card>
      </div>

      {/* Production timeline */}
      <Card
        title="Production Timeline — Standard Conditions"
        subtitle="Oil and water as bars (STB/d, bbl/d, left axis); gas as line (Mscf/d, right axis). Anti-correlated oil/water peaks with ~10 min period indicate slug flow."
      >
        <div className="h-72">
          <ResponsiveContainer>
            <ComposedChart data={rows} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="timeLabel" interval={step} {...axisProps} />
              <YAxis yAxisId="l" {...axisProps} width={50} />
              <YAxis yAxisId="r" orientation="right" {...axisProps} width={50} tickFormatter={(v) => fmt(v / 1000, 0)} />
              <Tooltip content={<ChartTip units={{ oilStdBpd: "STB/d", waterStdBpd: "bbl/d", gasStdCfd: "scf/d" }} digits={{ gasStdCfd: 0, oilStdBpd: 0 }} />} />
              <Bar yAxisId="l" dataKey="oilStdBpd" name="Oil (std)" fill={C.oil} fillOpacity={0.75} stackId="liq" />
              <Bar yAxisId="l" dataKey="waterStdBpd" name="Water" fill={C.water} fillOpacity={0.85} stackId="liq" />
              <Line yAxisId="r" type="monotone" dataKey="gasStdCfd" name="Gas (std)" stroke={C.gas} dot={false} strokeWidth={1.8} />
              <ReferenceLine yAxisId="l" y={s.oilStdBpd.mean} stroke={C.oil} strokeDasharray="4 4" strokeOpacity={0.6} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <Legend items={[{ label: "Oil STB/d", color: C.oil }, { label: "Water bbl/d", color: C.water }, { label: "Gas Mscf/d (right)", color: C.gas }, { label: "Mean oil", color: C.oil, dashed: true }]} />
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card title="GVF & Water Cut" subtitle="Actual gas volume fraction vs standard-condition water cut">
          <div className="h-60">
            <ResponsiveContainer>
              <AreaChart data={rows} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="gGvf" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.gas} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={C.gas} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gWc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.water} stopOpacity={0.6} />
                    <stop offset="100%" stopColor={C.water} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="timeLabel" interval={step} {...axisProps} />
                <YAxis yAxisId="g" domain={[60, 100]} {...axisProps} width={40} />
                <YAxis yAxisId="w" orientation="right" domain={[0, "auto"]} {...axisProps} width={40} />
                <Tooltip content={<ChartTip units={{ gvf: "%", waterCut: "%" }} />} />
                <Area yAxisId="g" type="monotone" dataKey="gvf" name="GVF" stroke={C.gas} fill="url(#gGvf)" strokeWidth={1.6} />
                <Area yAxisId="w" type="monotone" dataKey="waterCut" name="Water cut" stroke={C.water} fill="url(#gWc)" strokeWidth={1.6} />
                <ReferenceLine yAxisId="g" y={85} stroke={C.warn} strokeDasharray="4 4" label={{ value: "wet-gas boundary", fill: C.warn, fontSize: 10, position: "insideTopLeft" }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <Legend items={[{ label: "GVF % (left)", color: C.gas }, { label: "Water cut % (right)", color: C.water }]} />
        </Card>

        <Card title="Actual vs Standard Oil Rate" subtitle="Difference is the live-oil shrinkage Bo applied by the meter's PVT engine">
          <div className="h-60">
            <ResponsiveContainer>
              <LineChart data={rows} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="timeLabel" interval={step} {...axisProps} />
                <YAxis {...axisProps} width={50} domain={["auto", "auto"]} />
                <Tooltip content={<ChartTip units={{ oilActBpd: "bbl/d", oilStdBpd: "STB/d" }} digits={{ oilActBpd: 0, oilStdBpd: 0 }} />} />
                <Line type="monotone" dataKey="oilActBpd" name="Oil (actual)" stroke={C.temp} dot={false} strokeWidth={1.4} />
                <Line type="monotone" dataKey="oilStdBpd" name="Oil (std)" stroke={C.oil} dot={false} strokeWidth={1.8} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <Legend items={[{ label: "Actual bbl/d", color: C.temp }, { label: "Standard STB/d", color: C.oil }]} />
        </Card>
      </div>
    </div>
  );
}
