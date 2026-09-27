// A small SEC companyfacts document with known answers, served the way canlicapital.com serves the
// real ones: a ticker list, a company record naming the snapshot's SHA-256, and the gzip snapshot.
// Each fact below reproduces a case the 2026-09-27 audit found in real filings.
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

export const CIK = "0000123456";
const K = (start, end, val, filed, form, accn, fy, fp) => ({ ...(start ? { start } : {}), end, val, accn, fy, fp, form, filed });
const A19 = "0000123456-19-000010"; // 10-K filed 2019-10-30
const Q20 = "0000123456-20-000005"; // 10-Q filed 2020-01-29
const AM20 = "0000123456-20-000002"; // 10-K/A filed 2020-01-15
const A20 = "0000123456-20-000020"; // 10-K filed 2020-10-29

// Known answers:
// - Revenue moved tags, as Apple's did: SalesRevenueNet carries FY2018 (80) and FY2019 (100, first
//   filed 2019-10-30); from the 2020 10-K the company uses Revenues: FY2019 restated to 90, FY2020
//   110, the 92-day Q1 FY2020 (30) and a 112-day (16-week) Q2 (40), like Kroger's first quarter.
//   A six-month year-to-date figure (70) is "other". A 424B2 prospectus repeats FY2019 as 999;
//   it is not a periodic report and must never become a vintage.
// - Assets (us-gaap) at 2019-09-30: 500 in the 10-K, 520 in a 10-K/A; the 2019-12-31 balance (510)
//   is first reported in a 10-Q. The company then moved to IFRS: ifrs-full:Assets at 2021-09-30 is
//   700, filed in a 20-F on 2021-11-15, like Toyota's switch.
// - EarningsPerShareDiluted FY2019: 1.5 in 2019, 0.75 in 2020 after a 2-for-1 split the company
//   reported (StockholdersEquityNoteStockSplitConversionRatio1 = 2).
// - LongTermDebt at 2019-09-30: 50, then 51 in a 10-Q, then back to 50 (changed, then reverted).
// - OperatingLeaseLiability at 2019-09-30: first reported 0, then 30 (a change from zero).
// - ffd:FeeRate is a filing-fee exhibit and is ignored, whatever form carries it.
// - Cash at 2019-09-30 was first reported as CashCashEquivalentsRestrictedCashAndRestrictedCash
//   Equivalents (60). The 2020 10-K reports that date under both it (60) and the narrower
//   CashAndCashEquivalentsAtCarryingValue (55): one filing, two definitions, no revision.
export const FACTS = {
  cik: 123456,
  entityName: "Fixture Corp",
  facts: {
    dei: {
      EntityCommonStockSharesOutstanding: {
        label: "Entity Common Stock, Shares Outstanding",
        units: { shares: [K(null, "2019-10-15", 1000, "2019-10-30", "10-K", A19, 2019, "FY")] },
      },
    },
    ffd: {
      FeeRate: { label: "Fee Rate", units: { pure: [K(null, "2020-02-01", 0.0001, "2020-10-29", "10-K", A20, null, null)] } },
    },
    "ifrs-full": {
      Assets: { label: "Assets", units: { USD: [K(null, "2021-09-30", 700, "2021-11-15", "20-F", "0000123456-21-000030", 2021, "FY")] } },
    },
    "us-gaap": {
      SalesRevenueNet: {
        label: "Sales Revenue, Net",
        units: {
          USD: [
            K("2017-10-01", "2018-09-30", 80, "2018-10-31", "10-K", "0000123456-18-000010", 2018, "FY"),
            K("2018-10-01", "2019-09-30", 100, "2019-10-30", "10-K", A19, 2019, "FY"),
          ],
        },
      },
      Revenues: {
        label: "Revenues",
        units: {
          USD: [
            K("2018-10-01", "2019-09-30", 999, "2020-02-01", "424B2", "0000123456-20-000003", null, null),
            K("2018-10-01", "2019-09-30", 90, "2020-10-29", "10-K", A20, 2020, "FY"),
            K("2019-10-01", "2020-09-30", 110, "2020-10-29", "10-K", A20, 2020, "FY"),
            K("2019-10-01", "2019-12-31", 30, "2020-01-29", "10-Q", Q20, 2020, "Q1"),
            K("2020-01-01", "2020-04-21", 40, "2020-05-20", "10-Q", "0000123456-20-000009", 2020, "Q2"),
            K("2019-10-01", "2020-03-31", 70, "2020-04-29", "10-Q", "0000123456-20-000008", 2020, "Q2"),
          ],
        },
      },
      Assets: {
        label: "Assets",
        units: {
          USD: [
            K(null, "2019-09-30", 500, "2019-10-30", "10-K", A19, 2019, "FY"),
            K(null, "2019-09-30", 520, "2020-01-15", "10-K/A", AM20, 2019, "FY"),
            K(null, "2019-12-31", 510, "2020-01-29", "10-Q", Q20, 2020, "Q1"),
          ],
        },
      },
      EarningsPerShareDiluted: {
        label: "Earnings Per Share, Diluted",
        units: {
          "USD/shares": [
            K("2018-10-01", "2019-09-30", 1.5, "2019-10-30", "10-K", A19, 2019, "FY"),
            K("2018-10-01", "2019-09-30", 0.75, "2020-10-29", "10-K", A20, 2020, "FY"),
          ],
        },
      },
      StockholdersEquityNoteStockSplitConversionRatio1: {
        label: "Stockholders' Equity Note, Stock Split, Conversion Ratio",
        units: { pure: [K(null, "2020-06-01", 2, "2020-10-29", "10-K", A20, 2020, "FY")] },
      },
      LongTermDebt: {
        label: "Long-term Debt",
        units: {
          USD: [
            K(null, "2019-09-30", 50, "2019-10-30", "10-K", A19, 2019, "FY"),
            K(null, "2019-09-30", 51, "2020-01-29", "10-Q", Q20, 2020, "Q1"),
            K(null, "2019-09-30", 50, "2020-10-29", "10-K", A20, 2020, "FY"),
          ],
        },
      },
      CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents: {
        label: "Cash, Cash Equivalents, Restricted Cash and Restricted Cash Equivalents",
        units: {
          USD: [
            K(null, "2019-09-30", 60, "2019-10-30", "10-K", A19, 2019, "FY"),
            K(null, "2019-09-30", 60, "2020-10-29", "10-K", A20, 2020, "FY"),
          ],
        },
      },
      CashAndCashEquivalentsAtCarryingValue: {
        label: "Cash and Cash Equivalents, at Carrying Value",
        units: { USD: [K(null, "2019-09-30", 55, "2020-10-29", "10-K", A20, 2020, "FY")] },
      },
      OperatingLeaseLiability: {
        label: "Operating Lease, Liability",
        units: {
          USD: [
            K(null, "2019-09-30", 0, "2019-10-30", "10-K", A19, 2019, "FY"),
            K(null, "2019-09-30", 30, "2020-10-29", "10-K", A20, 2020, "FY"),
          ],
        },
      },
    },
  },
};

export const RAW = Buffer.from(JSON.stringify(FACTS));
export const SHA = createHash("sha256").update(RAW).digest("hex");
export const SNAPSHOT_PATH = `/company-data/sources/${SHA}.json.gz`;

const record = (cik, sha) => Buffer.from(JSON.stringify({
  schema: "canli.company-reference.v1",
  cik,
  name: "Fixture Corp",
  source_url: `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`,
  source_sha256: sha,
  source_snapshot: SNAPSHOT_PATH,
  fetched_at: "2026-09-19T09:30:25.021Z",
}));

// extraCiks: more companies that share the same snapshot, to exercise the in-memory cache limit.
export function files({ sha = SHA, snapshot = gzipSync(RAW), extraCiks = [] } = {}) {
  const out = {
    "/api/v1/company-tickers.json": Buffer.from(JSON.stringify({ schema: "canli.company-tickers.v1", count: 2, tickers: { FIX: CIK, "BRK-B": "0001067983" } })),
    [`/company-data/${CIK}.json`]: record(CIK, sha),
    [SNAPSHOT_PATH]: snapshot,
  };
  for (const cik of extraCiks) out[`/company-data/${cik}.json`] = record(cik, sha);
  return out;
}

// A fetch that serves the files above and records every path it was asked for.
export function fakeFetch(map = files()) {
  const calls = [];
  const impl = async (url) => {
    const path = new URL(url).pathname;
    calls.push(path);
    const body = map[path];
    return body ? new Response(body, { status: 200 }) : new Response("not found", { status: 404 });
  };
  return { impl, calls };
}
