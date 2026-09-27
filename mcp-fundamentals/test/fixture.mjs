// A small SEC companyfacts document with known answers, served the way canlicapital.com serves the
// real ones: a ticker list, a company record naming the snapshot's SHA-256, and the gzip snapshot.
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

export const CIK = "0000123456";
const K = (start, end, val, filed, form, accn, fy, fp) => ({ ...(start ? { start } : {}), end, val, accn, fy, fp, form, filed });

// Known answers:
// - Revenues FY2019 (2018-10-01 to 2019-09-30) was first reported as 100 on 2019-10-30 and restated
//   to 90 on 2020-10-29. FY2020 is 110. Q1 FY2020 (92 days) is 30. A six-month YTD figure is "other".
// - Assets at 2019-09-30 was 500 in the 10-K (2019-10-30) and 520 in a 10-K/A (2020-01-15); the
//   quarter-end balance at 2019-12-31 (first in a 10-Q) is 510.
// - SalesRevenueNet is the older revenue tag, last used for FY2018 (80).
// - EarningsPerShareDiluted is in USD/shares.
export const FACTS = {
  cik: 123456,
  entityName: "Fixture Corp",
  facts: {
    dei: {
      EntityCommonStockSharesOutstanding: {
        label: "Entity Common Stock, Shares Outstanding",
        units: { shares: [K(null, "2019-10-15", 1000, "2019-10-30", "10-K", "0000123456-19-000010", 2019, "FY")] },
      },
    },
    "us-gaap": {
      Revenues: {
        label: "Revenues",
        units: {
          USD: [
            K("2018-10-01", "2019-09-30", 100, "2019-10-30", "10-K", "0000123456-19-000010", 2019, "FY"),
            K("2018-10-01", "2019-09-30", 90, "2020-10-29", "10-K", "0000123456-20-000020", 2020, "FY"),
            K("2019-10-01", "2020-09-30", 110, "2020-10-29", "10-K", "0000123456-20-000020", 2020, "FY"),
            K("2019-10-01", "2019-12-31", 30, "2020-01-29", "10-Q", "0000123456-20-000005", 2020, "Q1"),
            K("2019-10-01", "2020-03-31", 58, "2020-04-29", "10-Q", "0000123456-20-000009", 2020, "Q2"),
          ],
        },
      },
      SalesRevenueNet: {
        label: "Sales Revenue, Net",
        units: { USD: [K("2017-10-01", "2018-09-30", 80, "2018-10-31", "10-K", "0000123456-18-000010", 2018, "FY")] },
      },
      Assets: {
        label: "Assets",
        units: {
          USD: [
            K(null, "2019-09-30", 500, "2019-10-30", "10-K", "0000123456-19-000010", 2019, "FY"),
            K(null, "2019-09-30", 520, "2020-01-15", "10-K/A", "0000123456-20-000002", 2019, "FY"),
            K(null, "2019-12-31", 510, "2020-01-29", "10-Q", "0000123456-20-000005", 2020, "Q1"),
          ],
        },
      },
      EarningsPerShareDiluted: {
        label: "Earnings Per Share, Diluted",
        units: { "USD/shares": [K("2018-10-01", "2019-09-30", 1.5, "2019-10-30", "10-K", "0000123456-19-000010", 2019, "FY")] },
      },
    },
  },
};

export const RAW = Buffer.from(JSON.stringify(FACTS));
export const SHA = createHash("sha256").update(RAW).digest("hex");
export const SNAPSHOT_PATH = `/company-data/sources/${SHA}.json.gz`;

export function files({ sha = SHA, snapshot = gzipSync(RAW) } = {}) {
  return {
    "/api/v1/company-tickers.json": Buffer.from(JSON.stringify({ schema: "canli.company-tickers.v1", count: 2, tickers: { FIX: CIK, "BRK-B": "0001067983" } })),
    [`/company-data/${CIK}.json`]: Buffer.from(JSON.stringify({
      schema: "canli.company-reference.v1",
      cik: CIK,
      name: "Fixture Corp",
      source_url: `https://data.sec.gov/api/xbrl/companyfacts/CIK${CIK}.json`,
      source_sha256: sha,
      source_snapshot: SNAPSHOT_PATH,
      fetched_at: "2026-09-19T09:30:25.021Z",
    })),
    [SNAPSHOT_PATH]: snapshot,
  };
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
