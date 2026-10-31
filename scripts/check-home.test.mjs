import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import handler, { ACTIONS } from "../api/count.js";
import { findCompany, indexCompanies } from "../js/check-company.js";

const index = indexCompanies([
  [320193, "Apple Inc.", ["AAPL"]],
  [1045810, "NVIDIA CORP", ["NVDA"]],
  [1318605, "Tesla, Inc.", ["TSLA"]],
  [1652044, "Alphabet Inc.", ["GOOGL"]],
  [21344, "COCA COLA CO", ["KO"]],
  [789019, "MICROSOFT CORP", ["MSFT"]],
  [1, "Apple Hospitality REIT, Inc.", ["APLE"]],
]);
const named = (text) => findCompany(index, text)?.ticker ?? null;

test("a text finds its company by name, ticker or everyday name", () => {
  assert.equal(named("Apple's revenue was $500 billion in fiscal 2025."), "AAPL");
  assert.equal(named("Nvidia made $130 billion"), "NVDA");
  assert.equal(named("$TSLA earned $5 billion"), "TSLA");
  assert.equal(named("MSFT net income was $100 billion"), "MSFT");
  assert.equal(named("Google's revenue was $400 billion"), "GOOGL");
  assert.equal(named("Coca-Cola earned $10 billion"), "KO");
});

test("the longest name wins, and a text naming no company finds none", () => {
  assert.equal(named("Apple Hospitality REIT made $1 billion"), "APLE");
  assert.equal(named("They made $10 billion in revenue in fiscal 2025."), null);
  assert.equal(named("Revenue was up in the US and the CEO said so"), null);
});

const call = async (req) => {
  const out = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, end() { return this; } };
  await handler(req, out);
  return out;
};

test("the counter takes only known action names, and needs no storage to answer", async () => {
  assert.equal((await call({ method: "GET" })).code, 405);
  assert.equal((await call({ method: "POST", body: "check_answered" })).code, 204);
  assert.equal((await call({ method: "POST", body: "someone@example.com" })).code, 204);
  assert.ok(![...ACTIONS].some((name) => /@|\s/.test(name)));
});

test("the homepage does one job, in few words, and the privacy page says what is counted", () => {
  const html = readFileSync("index.html", "utf8");
  const main = html.slice(html.indexOf("<main"), html.indexOf("</main>")).replace(/<[^>]+>/g, " ");
  assert.ok(main.split(/\s+/).length < 190, "words on the homepage");
  assert.equal((html.match(/<h1/g) ?? []).length, 1);
  assert.match(html, /id="check-form"/);
  const privacy = readFileSync("privacy.html", "utf8");
  assert.match(privacy, /anonymous actions/);
  assert.doesNotMatch(privacy, /no analytics, advertising/);
});

// The production build runs build-site-design.mjs first, and that strips a stylesheet linked in this page's head:
// on 2026-10-31 the homepage went live with no styles while every check passed.
test("the homepage's styles survive the design step", () => {
  const script = readFileSync(new URL("../js/check-home.js", import.meta.url), "utf8");
  assert.match(script, /import "\.\.\/css\/check-home\.css"/);
  assert.equal(readFileSync(new URL("../index.html", import.meta.url), "utf8").includes('href="/css/check-home.css"'), false);
});
