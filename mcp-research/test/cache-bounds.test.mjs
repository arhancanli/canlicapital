import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test, { after, before } from "node:test";

import { BoundedCache } from "../src/bounded-cache.mjs";
import {
  createSession, registerTools, OUTPUT_SCHEMAS, RESEARCH_LIMITS,
  toolSearchResearch, toolListTopics, toolGetPaper, toolTrialLedger,
  toolLiveRecord, toolChainHead,
} from "../src/server.mjs";

const MiB = 1024 * 1024;
const BYTE_CAP = 8 * MiB;
const TTL = 600000;
const BASE = "https://injected.invalid";
const INDEX = JSON.stringify({ count: 1, topics: [], papers: [
  { slug: "risk", title: "Risk study", description: "Supplied fixture", path: "/research/risk" },
] });
const unpack = (result) => JSON.parse(result.content[0].text);
const paperPath = (slug) => "/research/" + slug + ".md";
const paper = (session, slug) => toolGetPaper(session, { slug, max_chars: 500 });
const retainedBytes = (cache) => [...cache.values()].reduce((sum, entry) => sum + Buffer.byteLength(entry.text, "utf8"), 0);
const checkBound = (cache) => {
  assert.ok(cache.size <= 32);
  assert.ok(retainedBytes(cache) <= BYTE_CAP);
};
const budget = (texts) => {
  const bytes = texts.reduce((sum, text) => sum + Buffer.byteLength(text, "utf8"), 0);
  assert.ok(bytes <= 12 * MiB, "A fixture has at most 12 MiB of finite synthetic payload.");
};
const deferred = () => {
  let resolve;
  const promise = new Promise((yes) => { resolve = yes; });
  return { promise, resolve };
};

let originalFetch;
let hiddenRequests = 0;
before(() => {
  originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    hiddenRequests++;
    throw new Error("Uninjected network is forbidden in cache-bound fixtures.");
  };
});
after(() => {
  globalThis.fetch = originalFetch;
  assert.equal(hiddenRequests, 0);
});

function site(files, now = () => 1000) {
  budget([...files.values()]);
  const requests = [];
  const session = createSession({ base: BASE, now, fetchImpl: async (url, options) => {
    const path = new URL(url).pathname;
    requests.push({ path, ...options });
    assert.equal(options.redirect, "error");
    assert.ok(files.has(path), "Only a declared synthetic path can be dispatched.");
    return new Response(files.get(path));
  } });
  return { session, requests };
}

function papers(texts, now) {
  return site(new Map(texts.map((text, i) => [paperPath("paper-" + i), text])), now);
}

function concurrentIndex() {
  budget([INDEX, "{broken", "error"]);
  const first = deferred();
  const started = deferred();
  const requests = [];
  const session = createSession({ base: BASE, now: () => 1000, fetchImpl: async (url, options) => {
    requests.push({ path: new URL(url).pathname, ...options });
    assert.equal(requests.at(-1).path, "/research-index.json");
    assert.equal(options.redirect, "error");
    if (requests.length === 1) { started.resolve(); return first.promise; }
    assert.equal(requests.length, 2);
    return new Response(INDEX);
  } });
  return { session, first, started, requests };
}

test("cache Map: session shape and get set has iteration delete clear inspection stay compatible", () => {
  const now = () => 1000;
  const fetchImpl = () => { throw new Error("No dispatch expected."); };
  const session = createSession({ base: BASE, fetchImpl, now });
  assert.deepEqual(Object.keys(session), ["base", "fetchImpl", "now", "cache"]);
  assert.equal(session.base, BASE);
  assert.equal(session.fetchImpl, fetchImpl);
  assert.equal(session.now, now);
  assert.ok(session.cache instanceof Map);
  const entry = { at: 1000, text: "paper" };
  assert.equal(session.cache.set("one", entry), session.cache);
  assert.equal(session.cache.get("one"), entry);
  assert.equal(session.cache.has("one"), true);
  assert.deepEqual([...session.cache], [["one", entry]]);
  assert.deepEqual([...session.cache.keys()], ["one"]);
  assert.deepEqual([...session.cache.values()], [entry]);
  assert.equal(session.cache.delete("one"), true);
  assert.equal(session.cache.delete("one"), false);
  session.cache.set("two", entry);
  session.cache.clear();
  assert.equal(session.cache.size, 0);
});

test("cache cardinality: thirty-third distinct native response evicts the oldest of thirty-two", async () => {
  const texts = Array.from({ length: 33 }, (_, i) => "# Paper " + i);
  const { session, requests } = papers(texts);
  for (let i = 0; i < texts.length; i++) {
    assert.equal(unpack(await paper(session, "paper-" + i)).text, texts[i]);
    checkBound(session.cache);
  }
  assert.equal(session.cache.size, 32);
  assert.equal(session.cache.has(paperPath("paper-0")), false);
  assert.equal(session.cache.has(paperPath("paper-1")), true);
  await paper(session, "paper-0");
  assert.equal(requests.length, 34);
  assert.equal(session.cache.has(paperPath("paper-1")), false);
  checkBound(session.cache);
});

test("cache byte pressure: three native three-MiB papers evict before cardinality pressure", async () => {
  const text = "x".repeat(3 * MiB);
  const { session, requests } = papers([text, text, text]);
  for (let i = 0; i < 3; i++) {
    assert.equal(unpack(await paper(session, "paper-" + i)).total_chars, text.length);
    checkBound(session.cache);
  }
  assert.equal(session.cache.size, 2);
  assert.equal(retainedBytes(session.cache), 6 * MiB);
  assert.equal(session.cache.has(paperPath("paper-0")), false);
  assert.equal(requests.length, 3);
});

test("cache exact bytes: two four-MiB native bodies fill the cap and one extra byte evicts", async () => {
  const text = "a".repeat(4 * MiB);
  const { session, requests } = papers([text, text, "b"]);
  await paper(session, "paper-0");
  await paper(session, "paper-1");
  assert.equal(retainedBytes(session.cache), BYTE_CAP);
  assert.equal(session.cache.size, 2);
  assert.equal(unpack(await paper(session, "paper-2")).text, "b");
  assert.equal(session.cache.has(paperPath("paper-0")), false);
  assert.equal(session.cache.has(paperPath("paper-1")), true);
  assert.equal(retainedBytes(session.cache), 4 * MiB + 1);
  assert.equal(requests.length, 3);
});

test("cache exact admission: a single eight-MiB retained text is accepted", () => {
  const text = "a".repeat(BYTE_CAP);
  budget([text]);
  const cache = new BoundedCache();
  const entry = { at: 1000, text };
  cache.set("exact", entry);
  assert.equal(cache.lookup("exact", 1000), entry);
  assert.equal(retainedBytes(cache), BYTE_CAP);
});

test("cache over admission: eight-MiB plus one byte is refused without replacing a healthy identity", () => {
  const text = "a".repeat(BYTE_CAP + 1);
  budget([text, "valid"]);
  const cache = new BoundedCache();
  const healthy = { at: 1000, text: "valid" };
  cache.set("same", healthy);
  assert.equal(cache.set("same", { at: 1000, text }), cache);
  assert.equal(cache.get("same"), healthy);
  assert.equal(cache.size, 1);
  assert.equal(retainedBytes(cache), 5);
});

test("cache UTF-8: three two-MiB ASCII texts retain six MiB", async () => {
  const text = "a".repeat(2 * MiB);
  const { session } = papers([text, text, text]);
  for (let i = 0; i < 3; i++) await paper(session, "paper-" + i);
  assert.equal(session.cache.size, 3);
  assert.equal(retainedBytes(session.cache), 6 * MiB);
});

test("cache UTF-8: three two-MiB code-unit accented texts retain only two four-MiB entries", async () => {
  const text = "é".repeat(2 * MiB);
  assert.equal(text.length, 2 * MiB);
  assert.equal(Buffer.byteLength(text, "utf8"), 4 * MiB);
  const { session } = papers([text, text, text]);
  for (let i = 0; i < 3; i++) await paper(session, "paper-" + i);
  assert.equal(session.cache.size, 2);
  assert.equal(retainedBytes(session.cache), BYTE_CAP);
  assert.equal(session.cache.has(paperPath("paper-0")), false);
});

test("cache UTF-8: supplementary code points use four bytes and admit no ninth-MiB hit", async () => {
  const text = "😀".repeat(MiB);
  assert.equal(text.length, 2 * MiB);
  const { session } = papers([text, text, "x"]);
  await paper(session, "paper-0");
  await paper(session, "paper-1");
  assert.equal(retainedBytes(session.cache), BYTE_CAP);
  await paper(session, "paper-2");
  assert.equal(session.cache.has(paperPath("paper-0")), false);
  assert.equal(retainedBytes(session.cache), 4 * MiB + 1);
});

test("cache LRU: a valid tool hit promotes its path before cardinality eviction", async () => {
  const { session, requests } = papers(Array.from({ length: 33 }, (_, i) => "p" + i));
  for (let i = 0; i < 32; i++) await paper(session, "paper-" + i);
  await paper(session, "paper-0");
  assert.equal(requests.length, 32);
  await paper(session, "paper-32");
  assert.equal(session.cache.has(paperPath("paper-0")), true);
  assert.equal(session.cache.has(paperPath("paper-1")), false);
  assert.deepEqual([...session.cache.keys()].slice(-2), [paperPath("paper-0"), paperPath("paper-32")]);
});

test("cache LRU: ordinary Map inspection does not promote a path", async () => {
  const { session } = papers(Array.from({ length: 33 }, (_, i) => "p" + i));
  for (let i = 0; i < 32; i++) await paper(session, "paper-" + i);
  assert.equal(session.cache.get(paperPath("paper-0")).text, "p0");
  assert.equal(session.cache.has(paperPath("paper-0")), true);
  assert.equal([...session.cache.entries()][0][0], paperPath("paper-0"));
  await paper(session, "paper-32");
  assert.equal(session.cache.has(paperPath("paper-0")), false);
});

test("cache LRU: valid promotion selects deterministic eviction under byte pressure", async () => {
  const text = "x".repeat(3 * MiB);
  const { session, requests } = papers([text, text, text]);
  await paper(session, "paper-0");
  await paper(session, "paper-1");
  await paper(session, "paper-0");
  await paper(session, "paper-2");
  assert.equal(requests.length, 3);
  assert.deepEqual([...session.cache.keys()], [paperPath("paper-0"), paperPath("paper-2")]);
  assert.equal(retainedBytes(session.cache), 6 * MiB);
});

test("cache expiry: a fresh hit removes an unrelated entry at the TTL boundary", async () => {
  let clock = 1000;
  const { session, requests } = site(new Map([["/research-index.json", INDEX]]), () => clock);
  session.cache.set(paperPath("stale"), { at: 500, text: "old" });
  await toolListTopics(session);
  clock = 500 + TTL;
  await toolListTopics(session);
  assert.equal(requests.length, 1);
  assert.equal(session.cache.has(paperPath("stale")), false);
  assert.equal(session.cache.size, 1);
});

test("cache expiry: a miss removes all unrelated stale entries before admission", async () => {
  let clock = 1000;
  const { session } = papers(["new"], () => clock);
  session.cache.set("old-a", { at: 1000, text: "old-a" });
  session.cache.set("old-b", { at: 1000, text: "old-b" });
  clock += TTL;
  await paper(session, "paper-0");
  assert.deepEqual([...session.cache.keys()], [paperPath("paper-0")]);
});

test("cache TTL: the preceding millisecond hits and equality requires a new response", async () => {
  let clock = 1000;
  const { session, requests } = papers(["same"], () => clock);
  await paper(session, "paper-0");
  const first = session.cache.get(paperPath("paper-0"));
  clock += TTL - 1;
  await paper(session, "paper-0");
  assert.equal(requests.length, 1);
  clock++;
  await paper(session, "paper-0");
  assert.equal(requests.length, 2);
  assert.notEqual(session.cache.get(paperPath("paper-0")), first);
});

test("cache admission expiry: an unrelated entry expires before a new timestamp is admitted", () => {
  const cache = new BoundedCache();
  cache.set("old", { at: 1000, text: "old" });
  const fresh = { at: 1000 + TTL, text: "fresh" };
  cache.set("fresh", fresh);
  assert.deepEqual([...cache], [["fresh", fresh]]);
});

test("cache age overflow: individually finite clock and timestamp cannot produce an infinite-age hit", async () => {
  const { session, requests } = papers(["fresh"], () => Number.MAX_VALUE);
  session.cache.set(paperPath("paper-0"), { at: -Number.MAX_VALUE, text: "old" });
  assert.equal(unpack(await paper(session, "paper-0")).text, "fresh");
  assert.equal(requests.length, 1);
  assert.equal(session.cache.get(paperPath("paper-0")).at, Number.MAX_VALUE);
});

test("cache rollback: future timestamps at unrelated paths are removed before a fresh return", async () => {
  let clock = 1000;
  const { session, requests } = papers(["new"], () => clock);
  session.cache.set("other", { at: 1000, text: "other" });
  await paper(session, "paper-0");
  clock = 999;
  assert.equal(unpack(await paper(session, "paper-0")).text, "new");
  assert.equal(requests.length, 2);
  assert.equal(session.cache.has("other"), false);
  assert.equal(session.cache.get(paperPath("paper-0")).at, 999);
});

test("cache clocks: NaN and both infinities return validated successes without retention or hits", async () => {
  for (const clock of [NaN, Infinity, -Infinity]) {
    const { session, requests } = site(new Map([["/research-index.json", INDEX]]), () => clock);
    session.cache.set("old", { at: 1000, text: "old" });
    assert.equal(unpack(await toolListTopics(session)).papers, 1);
    assert.equal(session.cache.size, 0);
    assert.equal(unpack(await toolListTopics(session)).papers, 1);
    assert.equal(session.cache.size, 0);
    assert.equal(requests.length, 2);
  }
});

test("cache clocks: strings null and undefined are not silently coerced into evidence", async () => {
  for (const clock of ["1000", null, undefined]) {
    const { session, requests } = papers(["valid"], () => clock);
    assert.equal(unpack(await paper(session, "paper-0")).text, "valid");
    await paper(session, "paper-0");
    assert.equal(session.cache.size, 0);
    assert.equal(requests.length, 2);
  }
});

test("cache admission metadata: unusable timestamps cannot replace a healthy Map entry", () => {
  const cache = new BoundedCache();
  const healthy = { at: 1000, text: "valid" };
  cache.set("same", healthy);
  for (const at of [NaN, Infinity, -Infinity, "1000", null, undefined]) {
    assert.equal(cache.set("same", { at, text: "invalid time" }), cache);
    assert.equal(cache.get("same"), healthy);
  }
});

test("cache mutated text: an oversized inspected entry cannot become a hit", async () => {
  const { session, requests } = papers(["fresh"]);
  const entry = { at: 1000, text: "old" };
  session.cache.set(paperPath("paper-0"), entry);
  entry.text = "x".repeat(BYTE_CAP + 1);
  budget([entry.text, "old", "fresh"]);
  assert.equal(unpack(await paper(session, "paper-0")).text, "fresh");
  assert.equal(requests.length, 1);
  assert.notEqual(session.cache.get(paperPath("paper-0")), entry);
  checkBound(session.cache);
});

test("cache mutated weights: aggregate byte pressure is remeasured before a requested hit", async () => {
  const second = "b".repeat(4 * MiB);
  const changed = "a".repeat(4 * MiB + 1);
  budget(["old", second, changed, "fresh"]);
  const { session, requests } = papers(["fresh"]);
  const old = { at: 1000, text: "old" };
  const other = { at: 1000, text: second };
  session.cache.set(paperPath("paper-0"), old);
  session.cache.set("other", other);
  old.text = changed;
  assert.equal(unpack(await paper(session, "paper-0")).text, "fresh");
  assert.equal(requests.length, 1);
  assert.equal(session.cache.get("other"), other);
  assert.notEqual(session.cache.get(paperPath("paper-0")), old);
  checkBound(session.cache);
});

test("cache mutated timestamps: nonnumeric metadata cannot yield a coerced fresh hit", async () => {
  const { session, requests } = papers(["fresh"]);
  const entry = { at: 1000, text: "old" };
  session.cache.set(paperPath("paper-0"), entry);
  entry.at = "1000";
  assert.equal(unpack(await paper(session, "paper-0")).text, "fresh");
  assert.equal(requests.length, 1);
  assert.notEqual(session.cache.get(paperPath("paper-0")), entry);
});

test("cache isolation: independent sessions retain their own values and clearing one preserves the other", async () => {
  const one = papers(["one"]);
  const two = papers(["two"]);
  assert.notEqual(one.session.cache, two.session.cache);
  assert.equal(unpack(await paper(one.session, "paper-0")).text, "one");
  assert.equal(unpack(await paper(two.session, "paper-0")).text, "two");
  one.session.cache.clear();
  assert.equal(unpack(await paper(two.session, "paper-0")).text, "two");
  assert.equal(two.requests.length, 1);
  await paper(one.session, "paper-0");
  assert.equal(one.requests.length, 2);
});

test("cache replacement: shrinking a value releases its old weight without evicting other values", () => {
  const three = "a".repeat(3 * MiB);
  const four = "b".repeat(4 * MiB);
  budget([three, three, "x", four]);
  const cache = new BoundedCache();
  const other = { at: 1000, text: three };
  cache.set("first", { at: 1000, text: three });
  cache.set("other", other);
  cache.set("first", { at: 1000, text: "x" });
  cache.set("last", { at: 1000, text: four });
  assert.equal(cache.get("other"), other);
  assert.equal(cache.size, 3);
  assert.equal(retainedBytes(cache), 7 * MiB + 1);
  assert.deepEqual([...cache.keys()], ["other", "first", "last"]);
});

test("cache replacement: growing a value counts its replacement once and evicts the oldest other value", () => {
  const text = "a".repeat(3 * MiB);
  budget(["old", text, text, text]);
  const cache = new BoundedCache();
  cache.set("first", { at: 1000, text: "old" });
  cache.set("second", { at: 1000, text });
  cache.set("third", { at: 1000, text });
  const replacement = { at: 1000, text };
  cache.set("first", replacement);
  assert.deepEqual([...cache.keys()], ["third", "first"]);
  assert.equal(cache.get("first"), replacement);
  assert.equal(retainedBytes(cache), 6 * MiB);
});

test("cache deletion: deleting and clearing full entries leave no phantom byte pressure", () => {
  const text = "a".repeat(4 * MiB);
  budget([text, text, text]);
  const cache = new BoundedCache();
  cache.set("first", { at: 1000, text });
  const second = { at: 1000, text };
  cache.set("second", second);
  cache.delete("first");
  cache.set("third", { at: 1000, text });
  assert.equal(cache.get("second"), second);
  assert.equal(retainedBytes(cache), BYTE_CAP);
  cache.clear();
  cache.set("fourth", { at: 1000, text });
  assert.deepEqual([...cache.keys()], ["fourth"]);
  assert.equal(retainedBytes(cache), 4 * MiB);
});

test("cache uncached success: nonfinite admission time still returns the complete validated result", async () => {
  let clockReads = 0;
  const { session, requests } = site(new Map([["/research-index.json", INDEX]]), () => ++clockReads === 1 ? 1000 : NaN);
  const result = unpack(await toolListTopics(session));
  assert.deepEqual(result, { papers: 1, columns: ["slug", "label", "papers", "about"], rows: [], url: BASE + "/research", limits: RESEARCH_LIMITS });
  assert.equal(clockReads, 2);
  assert.equal(requests.length, 1);
  assert.equal(session.cache.size, 0);
});

test("cache concurrency: a late malformed native JSON response retains a newer healthy identity", async () => {
  const { session, first, started, requests } = concurrentIndex();
  const failed = assert.rejects(toolListTopics(session), /did not return JSON/);
  await started.promise;
  assert.equal(unpack(await toolListTopics(session)).papers, 1);
  const healthy = session.cache.get("/research-index.json");
  first.resolve(new Response("{broken"));
  await failed;
  assert.equal(session.cache.get("/research-index.json"), healthy);
  assert.equal(unpack(await toolListTopics(session)).papers, 1);
  assert.equal(requests.length, 2);
});

test("cache concurrency: late native HTTP 404 and 500 failures retain a newer healthy identity", async () => {
  for (const status of [404, 500]) {
    const { session, first, started, requests } = concurrentIndex();
    const failed = assert.rejects(toolListTopics(session), status === 404 ? /was not found/ : /returned HTTP 500/);
    await started.promise;
    await toolListTopics(session);
    const healthy = session.cache.get("/research-index.json");
    first.resolve(new Response("error", { status }));
    await failed;
    assert.equal(session.cache.get("/research-index.json"), healthy);
    assert.equal(unpack(await toolListTopics(session)).papers, 1);
    assert.equal(requests.length, 2);
  }
});

test("cache concurrency: an injected native abort and late response retain a newer healthy identity", async (t) => {
  const controller = new AbortController();
  const nativeTimeout = AbortSignal.timeout.bind(AbortSignal);
  let deadlines = 0;
  t.mock.method(AbortSignal, "timeout", (delay) => {
    assert.equal(delay, 15000);
    return ++deadlines === 1 ? controller.signal : nativeTimeout(delay);
  });
  try {
    const { session, first, started, requests } = concurrentIndex();
    const failed = assert.rejects(toolListTopics(session), /exceeded the request deadline/);
    await started.promise;
    await toolListTopics(session);
    const healthy = session.cache.get("/research-index.json");
    controller.abort();
    await failed;
    first.resolve(new Response(INDEX));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(session.cache.get("/research-index.json"), healthy);
    assert.equal(unpack(await toolListTopics(session)).papers, 1);
    assert.equal(requests.length, 2);
    assert.equal(deadlines, 2);
  } finally {
    t.mock.restoreAll();
  }
});

test("cache concurrency: malformed-hit invalidation cannot delete a replacement admitted during validation", async (t) => {
  const { session, requests } = site(new Map([["/research-index.json", INDEX]]));
  const stale = { at: 1000, text: "{broken" };
  const healthy = { at: 1000, text: INDEX };
  session.cache.set("/research-index.json", stale);
  const nativeParse = JSON.parse;
  let replaced = false;
  t.mock.method(JSON, "parse", (text, ...args) => {
    if (text === "{broken" && !replaced) {
      replaced = true;
      session.cache.set("/research-index.json", healthy);
      throw new SyntaxError("Injected invalid JSON.");
    }
    return nativeParse(text, ...args);
  });
  try {
    await assert.rejects(toolListTopics(session), /did not return JSON/);
  } finally {
    t.mock.restoreAll();
  }
  assert.equal(replaced, true);
  assert.equal(session.cache.get("/research-index.json"), healthy);
  assert.equal(unpack(await toolListTopics(session)).papers, 1);
  assert.equal(requests.length, 0);
});

test("cache concurrency: late native body failure preserves a newer healthy result and sanitizes errors", async () => {
  budget([INDEX]);
  const started = deferred();
  const finish = deferred();
  const response = new Response(new ReadableStream({
    async pull(controller) {
      started.resolve();
      await finish.promise;
      controller.error(new Error("private transport detail"));
    },
  }, { highWaterMark: 0 }));
  let calls = 0;
  const session = createSession({ base: BASE, now: () => 1000, fetchImpl: async () => {
    assert.ok(++calls <= 2);
    return calls === 1 ? response : new Response(INDEX);
  } });
  const failed = assert.rejects(toolListTopics(session), (error) => {
    assert.match(error.message, /could not be reached/);
    assert.doesNotMatch(error.message, /private transport detail/);
    return true;
  });
  await started.promise;
  await toolListTopics(session);
  const healthy = session.cache.get("/research-index.json");
  finish.resolve();
  await failed;
  assert.equal(session.cache.get("/research-index.json"), healthy);
  assert.equal(unpack(await toolListTopics(session)).papers, 1);
  assert.equal(calls, 2);
});

test("cache compatibility: all six tool schemas and exact results survive eviction and refetch", async () => {
  const limits = ["Supplied source limit.", "Paper only."];
  const envelope = (data) => ({ generated_at: "2026-10-02T00:00:00Z", data, limits, canonical_human_page: BASE + "/record" });
  const files = new Map([
    ["/research-index.json", INDEX],
    [paperPath("risk"), "# Risk\n## Method\nSupplied € evidence.\n"],
    ["/api/v1/trials/summary.json", JSON.stringify(envelope({ tried: 3, budget: 10 }))],
    ["/api/v1/record.json", JSON.stringify({ capital: { kind: "paper" } })],
    ["/api/v1/sleeves.json", JSON.stringify(envelope({ rows: [] }))],
    ["/api/v1/chain/head.json", JSON.stringify(envelope({ head: { seq: 3 } }))],
    ...Array.from({ length: 32 }, (_, i) => [paperPath("pressure-" + i), "# Pressure " + i]),
  ]);
  const { session, requests } = site(files);
  const calls = [
    ["search_research", () => toolSearchResearch(session, { query: "risk" })],
    ["list_topics", () => toolListTopics(session)],
    ["get_paper", () => toolGetPaper(session, { slug: "risk" })],
    ["trial_ledger", () => toolTrialLedger(session)],
    ["live_record", () => toolLiveRecord(session)],
    ["chain_head", () => toolChainHead(session)],
  ];
  const registered = [];
  registerTools({ registerTool: (name, spec) => registered.push({ name, spec }) }, session);
  assert.deepEqual(registered.map((row) => row.name), calls.map(([name]) => name));
  for (const { spec } of registered) {
    assert.equal(spec.annotations.readOnlyHint, true);
    assert.equal(spec.annotations.destructiveHint, false);
    assert.ok(spec.outputSchema);
  }
  const original = [];
  for (const [name, call] of calls) {
    const result = await call();
    assert.equal(OUTPUT_SCHEMAS[name].safeParse(result.structuredContent).success, true);
    original.push(result);
  }
  assert.equal(requests.length, 6);
  for (let i = 0; i < 32; i++) await paper(session, "pressure-" + i);
  assert.equal(session.cache.size, 32);
  assert.equal(session.cache.has("/research-index.json"), false);
  assert.equal(session.cache.has("/api/v1/record.json"), false);
  for (let i = 0; i < calls.length; i++) {
    const [name, call] = calls[i];
    const result = await call();
    assert.deepEqual(result, original[i]);
    assert.equal(OUTPUT_SCHEMAS[name].safeParse(result.structuredContent).success, true);
  }
  assert.equal(requests.length, 44);
  checkBound(session.cache);
});
