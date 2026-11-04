// The edge cache: the markets pack's own reads, by two isolates, reaching the SEC once and keeping the first
// read's evidence; copies counted fresh, stale or missing for each request on its own; a broken cache, no
// cache or no request answering nothing and throwing nothing; and canlicapital.com's company reference, read
// by the fundamentals pack, cached by address, with revalidations, ranges, POSTs and failures passed by.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { gzipSync } from "node:zlib";

import { createSession as fundamentalsSession, loadCompany } from "canli-fundamentals-mcp/src/server.mjs";
import { createSession, evidenceScope, getText } from "canli-markets-mcp/src/sources.mjs";

import { edgeDisk, requestScope, ttlFor, withCache } from "../src/cache.mjs";

const DOC = "https://www.sec.gov/Archives/edgar/data/320193/000032019324000123/aapl-20240928.htm";
const SUBMISSIONS = "https://data.sec.gov/submissions/CIK0000320193.json";
const T0 = Date.parse("2026-11-03T22:32:15.220Z");
const DAY_SECONDS = 86_400;

// A stand-in for caches.default: bodies and headers by URL.
function fakeCache({ broken = false } = {}) {
  const kept = new Map();
  return {
    kept,
    async match(request) {
      if (broken) throw new Error("cache unavailable");
      const copy = kept.get(request.url);
      return copy && new Response(copy.body, { headers: copy.headers });
    },
    async put(request, response) {
      if (broken) throw new Error("cache unavailable");
      kept.set(request.url, { body: new Uint8Array(await response.arrayBuffer()), headers: Object.fromEntries(response.headers) });
    },
  };
}

// Runs `work` as one request to the Worker and waits for its cache writes.
async function asRequest(work) {
  const writes = [];
  const scope = { origin: "https://canli-mcp.example.workers.dev", hit: 0, stale: 0, miss: 0, waitUntil: (p) => writes.push(p) };
  const value = await requestScope.run(scope, work);
  await Promise.all(writes);
  return { scope, value };
}

test("a filing read in one isolate is answered from the edge cache in the next, with the evidence of its first read", async () => {
  const reached = [];
  const fetchImpl = async (url) => {
    reached.push(url);
    return new Response("<html>Apple 10-K</html>", { headers: { "Content-Type": "text/html", "Set-Cookie": "bm_sz=1" } });
  };
  const cache = fakeCache();
  // Each isolate has a session of its own; the second runs a minute later.
  const isolate = (now) => Object.assign(createSession({ fetchImpl, now: () => now, sleep: async () => {} }), { disk: edgeDisk({ cacheOf: () => cache, now: () => now }) });
  const read = (session) => asRequest(() => evidenceScope.run(new Map(), async () => ({ text: await getText(session, DOC), evidence: evidenceScope.getStore().get(DOC) })));
  const first = await read(isolate(T0));
  const second = await read(isolate(T0 + 60_000));
  assert.deepEqual(reached, [DOC], "the SEC was reached once");
  assert.equal(second.value.text, "<html>Apple 10-K</html>");
  assert.deepEqual(second.value.evidence, first.value.evidence);
  assert.equal(second.value.evidence.retrieved_at, "2026-11-03T22:32:15.220Z", "when the SEC served it, not when the cache did");
  assert.deepEqual([first.scope.hit, first.scope.miss, second.scope.hit, second.scope.miss], [0, 1, 1, 0]);
  const [stored] = cache.kept.values();
  assert.equal(stored.headers["set-cookie"], undefined, "only the text and its evidence are kept");
  assert.equal(stored.headers["cache-control"], "public, max-age=2592000");
});

test("each request counts its own copies: fresh, stale, or not there", async () => {
  const cache = fakeCache();
  let now = T0;
  const disk = edgeDisk({ cacheOf: () => cache, now: () => now });
  const record = { sha256: "ab".repeat(32), bytes: 2, retrieved_at: new Date(T0).toISOString() };
  await asRequest(() => disk.write(SUBMISSIONS, { at: T0, text: "{}", record }));
  // The list of filings is fresh for 15 minutes: read beside a request that finds nothing, then 20 minutes on.
  const [fresh, missing] = await Promise.all([asRequest(() => disk.read(SUBMISSIONS)), asRequest(() => disk.read(DOC))]);
  assert.deepEqual(fresh.value, { at: T0, record, text: "{}" });
  assert.equal(missing.value, null);
  now = T0 + 20 * 60_000;
  const stale = await asRequest(() => disk.read(SUBMISSIONS));
  assert.deepEqual(stale.value.record, record, "an older copy is still given, for when the SEC is down");
  assert.deepEqual([fresh.scope, missing.scope, stale.scope].map((s) => [s.hit, s.stale, s.miss]), [[1, 0, 0], [0, 0, 1], [0, 1, 0]]);
});

test("a broken cache, no cache, or no request: nothing is answered and nothing throws", async () => {
  const entry = { at: T0, text: "{}", record: null };
  for (const cacheOf of [() => fakeCache({ broken: true }), () => null]) {
    const disk = edgeDisk({ cacheOf });
    const { value, scope } = await asRequest(async () => {
      await disk.write(SUBMISSIONS, entry);
      return disk.read(SUBMISSIONS);
    });
    assert.equal(value, null);
    assert.equal(scope.hit, 0);
  }
  const cache = fakeCache();
  const disk = edgeDisk({ cacheOf: () => cache });
  await disk.write(SUBMISSIONS, entry);
  assert.deepEqual([await disk.read(SUBMISSIONS), cache.kept.size], [null, 0], "outside a request nothing is kept");
});

const BASE = "https://canlicapital.com";

test("canlicapital.com's company reference: a snapshot kept a year, a record and the lists six hours, nothing else", () => {
  const sha = "73a86c6aedc31f77cac2ea4df5f80f0b3bd7e6eb58bb4e01444fbedf3afb9c43";
  assert.equal(ttlFor(`${BASE}/company-data/sources/${sha}.json.gz`), 365 * DAY_SECONDS);
  for (const path of ["/company-data/0000320193.json", "/api/v1/company-tickers.json", "/api/v1/company-names.json"]) assert.equal(ttlFor(`${BASE}${path}`), 6 * 3600, path);
  for (const other of [
    `${BASE}/company-data/sources/latest.json.gz`, // not named by its hash
    `${BASE}/companies/0000320193`,
    `${BASE}/company-data/0000320193.json?v=2`,
    "http://canlicapital.com/api/v1/company-tickers.json",
    "https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json", // the markets pack's disk cache keeps these
  ]) assert.equal(ttlFor(other), 0, other);
});

test("a company loaded in one isolate comes from the edge cache in the next: its record and its hash-checked snapshot", async () => {
  const raw = Buffer.from(JSON.stringify({ cik: 320193, entityName: "Apple Inc.", facts: { "us-gaap": { Revenues: { units: { USD: [{ start: "2024-09-29", end: "2025-09-27", val: 416161000000, accn: "0000320193-25-000079", fy: 2025, fp: "FY", form: "10-K", filed: "2025-10-31" }] } } } } }));
  const sha = createHash("sha256").update(raw).digest("hex");
  const files = {
    [`${BASE}/company-data/0000320193.json`]: JSON.stringify({ name: "Apple Inc.", source_sha256: sha, source_snapshot: `/company-data/sources/${sha}.json.gz`, fetched_at: "2026-11-01T09:30:25.021Z" }),
    [`${BASE}/company-data/sources/${sha}.json.gz`]: gzipSync(raw),
  };
  const reached = [];
  const origin = async (url) => {
    reached.push(url);
    return files[url] ? new Response(files[url], { headers: { "Content-Type": "application/octet-stream" } }) : new Response("Not Found", { status: 404 });
  };
  const cache = fakeCache();
  // Each isolate has a session of its own and no disk.
  const load = () => asRequest(() => loadCompany(fundamentalsSession({ base: BASE, fetchImpl: withCache(origin, () => cache), cacheDir: "" }), "320193"));
  const first = await load();
  const second = await load();
  assert.deepEqual(reached, Object.keys(files), "the record and the snapshot, once each");
  assert.deepEqual([second.value.name, second.value.snapshot.sha256, second.value.snapshot.fetched_at], ["Apple Inc.", sha, "2026-11-01T09:30:25.021Z"]);
  assert.deepEqual([first.scope.miss, first.scope.hit, second.scope.hit, second.scope.miss], [2, 0, 2, 0]);
});

test("a revalidation, a range, a POST or an answer other than 200 goes straight through and is not kept", async () => {
  const tickers = `${BASE}/api/v1/company-tickers.json`;
  const missing = `${BASE}/company-data/0000000001.json`;
  const reached = [];
  const origin = async (url, init = {}) => {
    reached.push(`${init.method ?? "GET"} ${url}`);
    return url === missing ? new Response("Not Found", { status: 404 }) : new Response("{}", { headers: { ETag: '"v1"' } });
  };
  const cache = fakeCache();
  const get = withCache(origin, () => cache);
  const { scope } = await asRequest(async () => {
    for (let i = 0; i < 2; i++) {
      await get(tickers, { headers: { "If-None-Match": '"v0"' } });
      await get(tickers, { headers: { Range: "bytes=0-9" } });
      await get(tickers, { method: "POST", body: "{}" });
      await get(missing);
    }
  });
  assert.equal(reached.length, 8);
  assert.equal(cache.kept.size, 0);
  assert.deepEqual([scope.hit, scope.miss], [0, 2], "only the 404 was looked up, and missed");
});
