<div align="center">

#  MPFM · Multiphase Insight Console

**A browser-based executive dashboard for multiphase flow meter data — ingest `.xlsx` exports, audit the meter's PVT engine, validate Venturi closure, and characterise phase / slug behaviour in seconds.**

[![Live demo](https://img.shields.io/badge/demo-amirrezadlv.github.io%2mpfm--dashboard-0ea5e9?style=for-the-badge&logo=github)](https://amirrezadlv.github.io/roxar-mpfm-dashboard-development/)
[![Built with React](https://img.shields.io/badge/React-19-61dafb?style=for-the-badge&logo=react)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-7-646cff?style=for-the-badge&logo=vite)](https://vite.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-22c55e?style=for-the-badge)](LICENSE)

</div>


## Why

MPFM field exports arrive as Excel workbooks with mixed unitsystems, native meter columns interleaved with derived ones, and almost no
engineering narrative attached. The standard workflow — open the file,
rebuild the conversions in a spreadsheet, sanity-check the PVT table, then
hand-interpret phase and slug dynamics — is slow, error-prone, and
untestable.

**Multiphase Insight Console** does that work interactively, in the browser,
with the same physics the meter itself uses. Drag a workbook onto the page
(or hit *Import .xlsx*) and you get:

- A normalised dataset (SI + Roxar-native units) with provenance for every column.
- A live PVT audit comparing the meter's *implied* `Bo / Rs / Z` against a
  bilinear coefficient model — with the coefficients themselves editable.
- Venturi / momentum-flux closure, including ρ-implied GVF and venturi-mass
  reconciliation.
- Phase-inversion tracking with hysteresis, impedance-response sweeps
  across the inversion threshold, and a Pearson correlation matrix.
- A diagnostic engine that flags slugs, density-model drift, GVF boundary
  excursions, fraction-closure violations, accumulator resets and process
  / technical alarms.

No data leaves the browser. The whole app ships as a **single HTML file** via
`vite-plugin-singlefile`, so it also runs perfectly well from a USB stick.

---

## Table of contents

- [Features](#features)
- [Quick start](#quick-start)
- [Live demo](#live-demo)
- [Tabs in detail](#tabs-in-detail)
- [Architecture](#architecture)
- [File-name context parsing](#file-name-context-parsing)
- [Tech stack](#tech-stack)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [Acknowledgements](#acknowledgements)
- [License](#license)

---

## Features

| Area | What it does |
| --- | --- |
| **Ingestion** | Accepts `.xlsx`, `.xls`, `.csv` exports; recognises both Roxar-native headers (`Sensor Time`, `Oil (m3/hr) Act`, `Water Cut (%)`, …) and field/well-test report headers (`Std.OilFlowrate (SBPD)`, `Act&Std.WaterFlowrate (SBPD)`, `Density (Kg/m3)`, …); auto-converts every column to SI / Roxar-native units (`bar(a)`, `°C`, `m³/h`, `kg/m³`, `mbar`, `kg/h`, `Sm³/Sm³`). |
| **Drag & drop** | Drop the workbook anywhere on the page; the overlay lights up and ingestion starts. |
| **Provenance** | Every canonical field is tagged `measured`, `derived`, `modeled` or `missing`, surfaced in the *Data & Diagnostics* tab and as inline chips. |
| **Test context** | Pad / well / choke size / test date / upstream & downstream choke pressures (`P1avg`, `P2avg`) are parsed from the file name and shown as badges. |
| **KPIs** | Std. oil, gas, water, WC, GVF, GOR, line P, line T, cumulative production, dominant slug period, alarms counter. |
| **Choke verdict** | Auto-detects critical vs sub-critical flow using `P₂/P₁ < 0.55`, with a written interpretation that propagates through the choke tab. |
| **Phase tracking** | Hysteresis-tracked continuous-phase state (oil vs water), with conductivity / permittivity mode overrides, a visual state-strip and timestamped inversion events. |
| **Impedance models** | Hanai–Bruggeman permittivity (oil-continuous) and Bruggeman effective-medium conductivity (water-continuous), with a sweep plot across the inversion threshold. |
| **PVT audit** | Bilinear `Bo`, `Rs`, `Z` coefficients editable live; implied (meter-applied) vs modelled factors shown side by side with residuals. |
| **Venturi / momentum** | Homogeneous-model closure, Δp–Q² relationship with GVF colour shading, mass-rate reconciliation. |
| **Slug detection** | Dominant period from autocorrelation of detrended oil rate; water-cut spikes flagged when `WC > μ + 2.5σ`. |
| **Diagnostics** | 10 flag codes (`PROC`, `TECH`, `ACC`, `GVF`, `RHO`, `INV`, `PHASE`, `WC`, `BO`, `SUM`, `VENT`) with severity ranks, click-to-filter in the table. |
| **Export** | Download the full enriched dataset (measured + derived columns + flags) as CSV. |
| **Single-file build** | Ship as one `index.html` — no server, no CDN; runs from `file://`. |
| **Offline** | Everything (parsing, charts, physics) happens client-side; nothing is uploaded. |

---

## Quick start

### Prerequisites

- Node.js **20+** and npm### Local development

```bash
git clone https://github.com/amirrezadlv/roxar-mpfm-dashboard-development.git
cd roxar-mpfm-dashboard-development
npm install
npm run dev
