// The published ticker index may only point at companies the active release admits, and must name
// its sources. A ticker that resolved to a CIK with no page would send an agent to a 404.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { PRIMARY_TICKERS } from "./lib/company-primary-tickers.mjs";
import { titleLabel } from "./lib/company-label.mjs";

const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), "utf8"));
const index = read("public/api/v1/company-tickers.json");
const activation = read("config/company-production-activation.json");
const admission = read(activation.admission.path);

test("the ticker index is bound to the active release and names the SEC source", () => {
  assert.equal(index.schema, "canli.company-tickers.v1");
  assert.equal(index.release_hash, activation.release_hash, "rebuild after a release change: node scripts/build-company-tickers.mjs");
  assert.equal(index.admission, activation.admission.path);
  assert.equal(index.source.url, "https://www.sec.gov/files/company_tickers.json");
  assert.match(index.source.sha256, /^[0-9a-f]{64}$/);
  assert.match(index.source.captured, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(index.count, Object.keys(index.tickers).length);
});

test("every ticker resolves to an admitted, non-excluded company", () => {
  const excluded = admission.excluded_companies ?? {};
  for (const [ticker, cik] of Object.entries(index.tickers)) {
    assert.match(ticker, /^[A-Z0-9.\-]{1,10}$/, ticker);
    assert.match(cik, /^\d{10}$/, `${ticker}: ${cik}`);
    assert.ok(admission.companies[cik], `${ticker} -> ${cik} is not in the release`);
    assert.ok(!excluded[cik], `${ticker} -> ${cik} is excluded`);
  }
  assert.equal(index.tickers.AAPL, "0000320193");
});

test("the title ticker module agrees with the published index", () => {
  const indexed = new Set(Object.values(index.tickers));
  assert.deepEqual(new Set(Object.keys(PRIMARY_TICKERS)), indexed, "rebuild both with node scripts/build-company-tickers.mjs");
  for (const [cik, ticker] of Object.entries(PRIMARY_TICKERS)) assert.equal(index.tickers[ticker], cik, `${cik} title ticker ${ticker}`);
  assert.equal(PRIMARY_TICKERS["0001652044"], "GOOGL", "a company's main share class comes first");
  assert.equal(titleLabel({ name: "Lockheed Martin Corp", cik: "0000936468" }), "Lockheed Martin (LMT)");
  assert.equal(titleLabel({ name: "No Ticker Holdings Inc", cik: "0000000001" }), "No Ticker Holdings");
});
