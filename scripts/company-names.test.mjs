// The published name index lists exactly the companies the active release covers, each with a name,
// and its tickers are the published ticker index regrouped, never a second reading of the SEC file
// that could disagree with it. A name a client resolves must lead to a company that has pages.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildCompanyNames, catalogNames } from "./build-company-names.mjs";
import { catalogHash } from "../api/_lib/company-catalog.js";

const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), "utf8"));
const index = read("public/api/v1/company-names.json");
const tickers = read("public/api/v1/company-tickers.json");
const activation = read("config/company-production-activation.json");
const admission = read(activation.admission.path);
const excluded = admission.excluded_companies ?? {};
const cik10 = (n) => String(n).padStart(10, "0");

test("the name index is bound to the active release, its catalog and the ticker index's SEC source", () => {
  assert.equal(index.schema, "canli.company-names.v1");
  assert.equal(index.release_hash, activation.release_hash, "rebuild after a release change: node scripts/build-company-names.mjs");
  assert.equal(index.admission, activation.admission.path);
  assert.equal(index.catalog_root, admission.catalog_root);
  assert.deepEqual(index.source, tickers.source);
  assert.deepEqual(index.columns, ["cik", "name", "tickers"]);
  assert.equal(index.count, index.rows.length);
});

test("one row per covered company, in CIK order, each with a name", () => {
  const covered = Object.keys(admission.companies).filter((cik) => !excluded[cik]).sort();
  assert.deepEqual(index.rows.map(([cik]) => cik10(cik)), covered);
  for (const [cik, name, list] of index.rows) {
    assert.ok(Number.isSafeInteger(cik) && cik > 0, String(cik));
    assert.ok(typeof name === "string" && name.trim() === name && name.length > 0, `${cik} has no name`);
    assert.ok(Array.isArray(list), `${cik} tickers`);
  }
});

test("tickers are the published ticker index, regrouped by company", () => {
  const regrouped = {};
  for (const [cik, , list] of index.rows) for (const ticker of list) regrouped[ticker] = cik10(cik);
  assert.deepEqual(regrouped, tickers.tickers);
});

test("outside lists only tickers whose company the release does not cover, never one the index resolves", () => {
  assert.deepEqual(index.outside.columns, ["ticker", "cik", "name"]);
  for (const [ticker, cik, name] of index.outside.rows) {
    assert.match(ticker, /^[A-Z0-9.\-]{1,10}$/, ticker);
    assert.ok(!admission.companies[cik10(cik)] || excluded[cik10(cik)], `${ticker} -> ${cik} is covered`);
    assert.ok(!(ticker in tickers.tickers), `${ticker} is also in the ticker index`);
    assert.ok(name.length > 0, ticker);
  }
});

test("the companies an agent is most likely to ask for resolve as the SEC names them", () => {
  const rows = new Map(index.rows.map((row) => [row[0], row]));
  assert.deepEqual(rows.get(320193), [320193, "Apple Inc.", ["AAPL"]]);
  assert.equal(rows.get(1418091)[1], "Twitter, Inc.", "a delisted company keeps its name");
  assert.equal(rows.get(34088)[1], "Exxon Mobil Corporation");
  const xom = index.outside.rows.find(([ticker]) => ticker === "XOM");
  assert.deepEqual(xom, ["XOM", 2115436, "ExxonMobil Holdings Corp"], "XOM now names the new holding company");
});

test("the builder checks every catalog object's hash and refuses a ticker index from another SEC file", () => {
  const leaf = Buffer.from(JSON.stringify({ schema: "canli.company-catalog-node.v1", level: 0, entries: [{ first: "0000000001", last: "0000000001", hash: "a".repeat(64), bytes: 10, count: 1, name: "One Co " }] }));
  const hash = catalogHash(leaf);
  assert.deepEqual(catalogNames(hash, () => leaf), { "0000000001": "One Co" });
  assert.throws(() => catalogNames("b".repeat(64), () => leaf), /does not match its hash/);
  const tickerIndex = { release_hash: "r", source: { sha256: "c".repeat(64) }, tickers: {} };
  const small = { companies: { "0000000001": {} }, catalog_root: hash };
  assert.throws(() => buildCompanyNames({ names: {}, tickerIndex, secBytes: Buffer.from("{}"), admission: small, activation: { release_hash: "r", admission: { path: "x" } } }), /is not the one/);
});
