// Plain words to FRED series, World Bank indicators and OECD measures: the right one, or none.
// Before 0.2.1 one shared word was enough, so "silver price" returned CPI, "japan inflation"
// returned US inflation and "wage growth" returned GDP growth. No network.
import assert from "node:assert/strict";
import test from "node:test";

import { eoMeasure, resolveIndicator } from "../src/global.mjs";
import { NotFound } from "../src/sources.mjs";
import { resolveSeries } from "../src/tools.mjs";

const series = (q) => resolveSeries(q).id;
const indicator = (q) => resolveIndicator(q).id;
const measure = (q) => eoMeasure(q)[0];

test("economic_series: a request naming something no series is refuses, with where to look instead", () => {
  for (const q of ["silver price", "copper price", "bitcoin price", "gold price", "japan inflation", "uk unemployment rate", "euro area gdp", "stock prices", "interest rates"]) {
    assert.throws(() => resolveSeries(q), (e) => e instanceof NotFound && /price_history/.test(e.message) && /world_economy/.test(e.message), q);
  }
});

test("economic_series: plain requests, with filler, plurals and ids inside the words", () => {
  const want = {
    "inflation": "CPIAUCSL", "US CPI inflation": "CPIAUCSL", "inflation this year": "CPIAUCSL", "inflation rate since 2020": "CPIAUCSL",
    "core inflation year over year": "CPILFESL", "core PCE": "PCEPILFE", "core pce price index": "PCEPILFE", "PCE inflation": "PCEPI", "ppi": "PPIFIS",
    "10-year Treasury yield": "DGS10", "10 year bond yield": "DGS10", "2-year yield": "DGS2", "3 month t bill yield": "DGS3MO", "real yields": "DFII10",
    "30-year fixed mortgage rate": "MORTGAGE30US", "mortgage interest rates": "MORTGAGE30US", "fed funds rate": "FEDFUNDS", "daily fed funds rate": "DFF",
    "yield curve": "T10Y2Y", "2s10s": "T10Y2Y", "10y-2y spread": "T10Y2Y", "credit spreads": "BAMLH0A0HYM2", "investment grade credit spreads": "BAMLC0A0CM",
    "real gdp growth": "A191RL1Q225SBEA", "US GDP growth": "A191RL1Q225SBEA", "GDP": "GDP", "debt to gdp": "GFDEGDQ188S",
    "nonfarm payrolls": "PAYEMS", "jobs report": "PAYEMS", "weekly jobless claims": "ICSA", "wage growth": "CES0500000003", "unemployment rate (UNRATE)": "UNRATE",
    "house prices": "CSUSHPINSA", "housing starts": "HOUST", "credit growth": "TOTALSL", "bank lending": "TOTLL", "lending rate": "DPRIME",
    "gasoline prices": "GASREGW", "natural gas price": "DHHNGSP", "wti oil price": "DCOILWTICO", "usd/jpy": "DEXJPUS", "inflation expectations": "MICH",
  };
  for (const [q, id] of Object.entries(want)) assert.equal(series(q), id, q);
  assert.equal(series("DGS10"), "DGS10", "an id passes straight through");
});

test("world_economy: the indicator asked for, never a neighbour sharing one word", () => {
  for (const q of ["house prices", "wage growth", "employment growth", "household debt", "gold price", "stock prices"]) assert.throws(() => resolveIndicator(q), NotFound, q);
  const want = { "inflation": "FP.CPI.TOTL.ZG", "gdp growth": "NY.GDP.MKTP.KD.ZG", "gdp per capita": "NY.GDP.PCAP.CD", "government debt": "GC.DOD.TOTL.GD.ZS", "real yields": "FR.INR.RINR", "youth unemployment": "SL.UEM.1524.ZS", "military spending": "MS.MIL.XPND.GD.ZS", "life expectancy": "SP.DYN.LE00.IN", "population growth": "SP.POP.GROW", "foreign reserves": "FI.RES.TOTL.CD" };
  for (const [q, id] of Object.entries(want)) assert.equal(indicator(q), id, q);
});

test("economic_outlook: the measure asked for, never a neighbour sharing one word", () => {
  for (const q of ["house prices", "wage growth", "employment growth", "exchange rate", "stock market", "real yields", "lending rate", "household debt"]) assert.throws(() => eoMeasure(q), NotFound, q);
  const want = { "inflation": "CPI_YTYPCT", "core inflation": "PCORE_YTYPCT", "gdp growth": "GDPV_ANNPCT", "bond yields": "IRL", "short term interest rate": "IRS", "budget deficit": "NLGQ", "unemployment": "UNR" };
  for (const [q, id] of Object.entries(want)) assert.equal(measure(q), id, q);
});
