// The published name index lists exactly the companies the active release covers, each with a name,
// and its tickers are the published ticker index regrouped, never a second reading of the SEC file
// that could disagree with it. A name a client resolves must lead to a company that has pages.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildCompanyNames, catalogNames, indexNames } from "./build-company-names.mjs";
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
  assert.deepEqual(index.other_names.columns, ["cik", "names"]);
});

test("other_names: the SEC file's names for a covered company, only where they differ from the release's", () => {
  const names = new Map(index.rows.map(([cik, name]) => [cik, name]));
  const plain = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  let last = 0;
  for (const [cik, list] of index.other_names.rows) {
    assert.ok(cik > last, "in CIK order, once each");
    last = cik;
    assert.ok(names.has(cik), `${cik} is covered`);
    assert.ok(Array.isArray(list) && list.length > 0, `${cik}`);
    for (const name of list) assert.ok(name && name.trim() === name && plain(name) !== plain(names.get(cik)), `${cik}: ${name}`);
  }
  const other = new Map(index.other_names.rows);
  assert.deepEqual(other.get(1932770), ["Here Group Ltd"], "renamed after the release was captured (QuantaSing Group Limited)");
  assert.deepEqual(other.get(38777), ["FRANKLIN TEMPLETON INC"]);
  assert.equal(other.get(320193), undefined, "Apple's names differ only in case and punctuation");
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

test("the builder lists the SEC file's other names, and rebuilds from a committed index only of the same release and catalog", () => {
  const secBytes = Buffer.from(JSON.stringify({ 0: { cik_str: 1, ticker: "ONE", title: "ONE CO" }, 1: { cik_str: 2, ticker: "TWO", title: "Renamed Two Inc" }, 2: { cik_str: 3, ticker: "OUT", title: "Outside Co" } }));
  const tickerIndex = { release_hash: "r", source: { sha256: catalogHash(secBytes) }, tickers: { ONE: "0000000001", TWO: "0000000002" } };
  const admission = { companies: { "0000000001": {}, "0000000002": {} }, catalog_root: "root" };
  const activation = { release_hash: "r", admission: { path: "x" } };
  const built = buildCompanyNames({ names: { "0000000001": "One Co.", "0000000002": "Two Ltd" }, tickerIndex, secBytes, admission, activation });
  assert.deepEqual(built.other_names, { columns: ["cik", "names"], rows: [[2, ["Renamed Two Inc"]]] }, "ONE CO is One Co. in other letters");
  assert.deepEqual(built.outside.rows, [["OUT", 3, "Outside Co"]]);
  assert.deepEqual(indexNames(built, { admission, activation }), { "0000000001": "One Co.", "0000000002": "Two Ltd" });
  assert.throws(() => indexNames({ ...built, catalog_root: "another" }, { admission, activation }), /another release or catalog/);
});
