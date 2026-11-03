// The edge cache: the markets pack's own reads, by two isolates, reaching the SEC once and keeping the first
// read's evidence; copies counted fresh, stale or missing for each request on its own; and a broken cache,
// no cache or no request answering nothing and throwing nothing.
import assert from "node:assert/strict";
import test from "node:test";

import { createSession, evidenceScope, getText } from "canli-markets-mcp/src/sources.mjs";

import { edgeDisk, requestScope } from "../src/cache.mjs";

const DOC = "https://www.sec.gov/Archives/edgar/data/320193/000032019324000123/aapl-20240928.htm";
const SUBMISSIONS = "https://data.sec.gov/submissions/CIK0000320193.json";
const T0 = Date.parse("2026-11-03T22:32:15.220Z");

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
      kept.set(request.url, { body: await response.text(), headers: Object.fromEntries(response.headers) });
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
