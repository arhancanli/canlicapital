import assert from "node:assert/strict";
import { test } from "node:test";

import { factBook, ratioFromText } from "../src/listing.mjs";
import { releasesFrom } from "../src/earnings.mjs";

const named = "American Depositary Shares. American Depositary Shares. American Depositary Shares. ";

test("ratioFromText reads the ratio in the forms 20-Fs state it, and refuses to guess", () => {
  assert.equal(ratioFromText(`${named}Each ADS represents five (5) common shares.`).shares_per_listed_share, 5);
  assert.equal(ratioFromText(`${named}American Depositary Shares, each representing eight Ordinary Shares`).shares_per_listed_share, 8);
  assert.equal(ratioFromText(`${named}one American Depositary Share represents 10 shares of common stock`).shares_per_listed_share, 10);
  assert.equal(ratioFromText("Ordinary shares listed in New York as registry shares.").shares_per_listed_share, 1, "no depositary shares named");
  assert.equal(ratioFromText(`${named}The depositary holds them.`), null, "depositary shares named, no ratio stated");
  assert.equal(ratioFromText(`${named}Each ADS represents five shares. Each ADS represents two shares.`), null, "a tie is no answer");
});

test("factBook takes the taxonomy of the latest balance sheet and its currency", () => {
  const row = (filed, end = "2025-12-31") => ({ filed, end, val: 1 });
  assert.deepEqual((({ taxonomy, currency }) => ({ taxonomy, currency }))(factBook({ facts: { "ifrs-full": { Assets: { units: { TWD: [row("2025-04-17")] } } } } })), { taxonomy: "ifrs-full", currency: "TWD" });
  const moved = factBook({ facts: { "us-gaap": { Assets: { units: { USD: [row("2020-06-01", "2020-03-31")] } } }, "ifrs-full": { Assets: { units: { JPY: [row("2026-06-01")] } } } } });
  assert.equal(moved.taxonomy, "ifrs-full");
  assert.equal(factBook({ facts: { "us-gaap": { Assets: { units: { USD: [row("2026-02-01")] } } } } }).currency, "USD");
});

test("an interim Item 2.02 8-K is not a quarter's results: Tesla's deliveries", () => {
  const k = (filingDate, accessionNumber) => ({ form: "8-K", items: "2.02,9.01", filingDate, accessionNumber, primaryDocument: "x.htm" });
  const q = (filingDate) => ({ form: "10-Q", items: "", filingDate, accessionNumber: `q-${filingDate}`, primaryDocument: "q.htm" });
  const rel = releasesFrom([k("2025-04-02", "deliveries-q1"), k("2025-04-22", "q1"), q("2025-04-23"), k("2025-07-02", "deliveries-q2"), k("2025-07-23", "q2"), q("2025-07-24"), k("2025-10-02", "deliveries-q3")]);
  assert.deepEqual(rel.map((r) => r.accession), ["q1", "q2"], "20 days apart, 21 days apart, and an early one with the quarter's report yet to come");
  assert.deepEqual(rel.map((r) => r.date), ["2025-04-22", "2025-07-23"]);
});
