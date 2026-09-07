# Roxar MPFM Dashboard Development

---

## Overview
This repository contains the source code and frontend assets for a web-based dashboard designed to visualize operational telemetry and flow assurance data from the Emerson Roxar Multiphase Flow Meter (MPFM). The dashboard facilitates real-time monitoring and analysis of wellsite production metrics.

The project is deployed and accessible via GitHub Pages:
[Roxar MPFM Dashboard Live Page](https://amirrezadlv.github.io/roxar-mpfm-dashboard-development/)

---

## Key Features

* **Multiphase Flow Visualization:** Real-time tracking of individual phase flow rates (Oil, Water, and Gas).
* **Critical Metric Calculations:** Dynamic monitoring of key multiphase flow parameters, including:
  * Water Liquid Ratio (WLR)
  * Gas Volume Fraction (GVF)
* **Operational Telemetry:** Display of essential wellsite operating conditions such as differential pressure, line pressure, and fluid temperature.
* **Responsive Interface:** A front-end architecture optimized for both desktop analysis and field-portable device viewing.

---

## Technical Architecture

The dashboard is built using standard web technologies to ensure lightweight deployment and broad compatibility:
* **HTML5:** For structural markup and data presentation layout.
* **CSS3:** For interface styling and visual data hierarchy.
* **JavaScript:** For dynamic data handling, numerical updates, and interactive user interface elements.
* **Hosting:** Deployed via GitHub Pages for continuous availability.

---

## Data Definitions & Formulas

The dashboard relies on standard multiphase flow engineering equations to interpret the physical behavior of the reservoir fluid.

### Water Liquid Ratio (WLR)
Represents the fraction of water in the total liquid phase:
$$ WLR = \frac{Q_w}{Q_w + Q_o} $$
*(Where $Q_w$ is the water flow rate and $Q_o$ is the oil flow rate)*

### Gas Volume Fraction (GVF)
Represents the fraction of gas in the total multiphase fluid flow:
$$ GVF = \frac{Q_g}{Q_g + Q_w + Q_o} $$
*(Where $Q_g$ is the gas flow rate under operating conditions)*

---

## Installation & Setup

To run this dashboard locally for testing or further development, follow these steps:

1. **Clone the Repository:**
   ```bash
   # Clone the project to your local machine
   git clone [https://github.com/amirrezadlv/roxar-mpfm-dashboard-development.git](https://github.com/amirrezadlv/roxar-mpfm-dashboard-development.git)
