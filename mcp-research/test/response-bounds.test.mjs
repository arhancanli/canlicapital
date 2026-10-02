import assert from "node:assert/strict";
import test, { after, before } from "node:test";

import { fetchBoundedText, readBoundedResponse } from "../src/bounded-response.mjs";
import {
  createSession, RESEARCH_LIMITS, toolSearchResearch, toolListTopics, toolGetPaper,
  toolTrialLedger, toolLiveRecord, toolChainHead,
} from "../src/server.mjs";

const MAX_BYTES = 4 * 1024 * 1024;
const TTL = 10 * 60 * 1000;
const BASE = "https://injected.invalid";
const encode = (text) => new TextEncoder().encode(text);
const unpack = (result) => JSON.parse(result.content[0].text);
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

let originalFetch;
let hiddenRequests = 0;
before(() => {
  originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    hiddenRequests++;
    throw new Error("Uninjected network is forbidden in response-bound fixtures.");
  };
});
after(() => {
  globalThis.fetch = originalFetch;
  assert.equal(hiddenRequests, 0);
});

// Native Response and ReadableStream, with delegating reader counters. HWM zero prevents
// speculative pulling from being mistaken for application reads or cap admission.
function tracked(chunks = [], { status = 200, headers = {}, pull, cancel, onRead } = {}) {
  const counts = { reads: 0, cancels: 0, releases: 0, pulls: 0, sourceCancels: 0 };
  let index = 0;
  const body = new ReadableStream({
    pull(controller) {
      counts.pulls++;
      if (pull) return pull(controller);
      if (index < chunks.length) controller.enqueue(chunks[index++]);
      else controller.close();
    },
    cancel(reason) {
      counts.sourceCancels++;
      return cancel?.(reason);
    },
  }, { highWaterMark: 0 });
  const response = new Response(body, { status, headers });
  const getReader = response.body.getReader.bind(response.body);
  response.body.getReader = () => {
    const reader = getReader();
    return {
      read() {
        counts.reads++;
        const pending = reader.read();
        return onRead ? pending.then(onRead) : pending;
      },
      cancel() { counts.cancels++; return reader.cancel(); },
      releaseLock() { counts.releases++; return reader.releaseLock(); },
    };
  };
  response.text = () => { throw new Error("Unbounded response.text() is forbidden."); };
  return { response, counts };
}

function read(fixture, maxBytes = MAX_BYTES, signal = new AbortController().signal) {
  return readBoundedResponse(fixture.response, { signal, maxBytes });
}

function sessionWith(responses, now) {
  const requests = [];
  const session = createSession({
    base: BASE, now,
    fetchImpl: async (url, options) => {
      requests.push({ path: new URL(url).pathname, ...options });
      const next = responses.shift();
      assert.ok(next, "No hidden retry or extra request is allowed.");
      return typeof next === "function" ? next(options) : next;
    },
  });
  return { session, requests };
}

const indexText = JSON.stringify({
  count: 1,
  topics: [{ slug: "risk", label: "Risk", count: 1, blurb: "Source-bound research." }],
  papers: [{ slug: "risk-study", title: "Risk study", description: "Risk evidence", publication_year: 2026, path: "/research/risk-study" }],
});

test("response bytes: exactly four MiB is accepted without response.text", async () => {
  const fixture = tracked([new Uint8Array(MAX_BYTES).fill(97)]);
  const text = await read(fixture);
  assert.equal(text.length, MAX_BYTES);
  assert.equal(text[0], "a");
  assert.equal(text.at(-1), "a");
  assert.deepEqual(fixture.counts, { reads: 2, cancels: 0, releases: 1, pulls: 2, sourceCancels: 0 });
  assert.equal(fixture.response.body.locked, false);
});

test("response bytes: cap plus one rejects without reading subsequent chunks", async () => {
  const fixture = tracked([new Uint8Array(MAX_BYTES).fill(97), encode("b"), encode("never read")]);
  await assert.rejects(read(fixture), { code: "TOO_LARGE" });
  assert.equal(fixture.counts.reads, 2);
  assert.equal(fixture.counts.pulls, 2);
  assert.equal(fixture.counts.cancels, 1);
  assert.equal(fixture.counts.releases, 1);
  assert.equal(fixture.response.body.locked, false);
});

test("response bytes: a supplied oversized chunk is refused before decoding", async () => {
  const fixture = tracked([new Uint8Array(MAX_BYTES + 1).fill(255), encode("never read")]);
  await assert.rejects(read(fixture), { code: "TOO_LARGE" });
  assert.equal(fixture.counts.reads, 1);
  assert.equal(fixture.counts.cancels, 1);
  assert.equal(fixture.counts.releases, 1);
});

test("response bytes: multibyte paper under the code-unit cap exceeds the byte cap", async () => {
  const markdown = "é".repeat(MAX_BYTES / 2 + 1);
  assert.ok(markdown.length < MAX_BYTES);
  const fixture = tracked([encode(markdown)]);
  const { session, requests } = sessionWith([fixture.response]);
  await assert.rejects(toolGetPaper(session, { slug: "risk-study" }), /is larger than expected; response omitted/);
  assert.equal(session.cache.size, 0);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].redirect, "error");
});

test("response headers: absent Content-Length still counts actual bytes", async () => {
  const fixture = tracked([encode("12345678"), encode("9"), encode("never read")]);
  await assert.rejects(read(fixture, 8), { code: "TOO_LARGE" });
  assert.equal(fixture.response.headers.get("content-length"), null);
  assert.equal(fixture.counts.reads, 2);
  assert.equal(fixture.counts.releases, 1);
});

test("response headers: misleading small Content-Length cannot bypass the cap", async () => {
  const fixture = tracked([encode("123456789")], { headers: { "content-length": "1" } });
  await assert.rejects(read(fixture, 8), { code: "TOO_LARGE" });
  assert.equal(fixture.counts.reads, 1);
  assert.equal(fixture.counts.cancels, 1);
});

test("response headers: advertised oversize is rejected before the first read", async () => {
  const fixture = tracked([encode("small")], { headers: { "content-length": String(MAX_BYTES + 1) } });
  await assert.rejects(read(fixture), { code: "TOO_LARGE" });
  assert.deepEqual(fixture.counts, { reads: 0, cancels: 1, releases: 1, pulls: 0, sourceCancels: 1 });
});

test("response headers: huge and zero-prefixed decimal lengths are compared safely", async () => {
  for (const value of ["9".repeat(200), "000000" + String(MAX_BYTES + 1)]) {
    const fixture = tracked([encode("small")], { headers: { "content-length": value } });
    await assert.rejects(read(fixture), { code: "TOO_LARGE" });
    assert.equal(fixture.counts.reads, 0);
    assert.equal(fixture.counts.cancels, 1);
    assert.equal(fixture.counts.releases, 1);
  }
});

test("response headers: unusable lengths use actual bytes and valid lengths preserve content", async () => {
  for (const value of ["-1", "nonsense", "1.5", "0008"]) {
    const fixture = tracked([encode("12345678")], { headers: { "content-length": value } });
    assert.equal(await read(fixture, 8), "12345678");
    assert.equal(fixture.counts.releases, 1);
    assert.equal(fixture.counts.cancels, 0);
  }
});

test("response UTF-8: split multibyte code points and BOM decode as valid text", async () => {
  const expected = "研究 € 😀\n";
  const bytes = encode("\uFEFF" + expected);
  const fixture = tracked(Array.from(bytes, (byte) => Uint8Array.of(byte)));
  assert.equal(await read(fixture), expected);
  assert.equal(fixture.counts.reads, bytes.length + 1);
  assert.equal(fixture.counts.cancels, 0);
  assert.equal(fixture.counts.releases, 1);
});

test("response UTF-8: truncated code point is refused and a later healthy paper recovers", async () => {
  const bad = tracked([encode("# Paper\n"), Uint8Array.of(0xe2, 0x82)]);
  const good = tracked([encode("# Paper\n## Method\nValid € evidence.\n")]);
  const { session, requests } = sessionWith([bad.response, good.response]);
  await assert.rejects(toolGetPaper(session, { slug: "risk-study" }), /did not return valid UTF-8/);
  assert.equal(session.cache.size, 0);
  const result = unpack(await toolGetPaper(session, { slug: "risk-study" }));
  assert.match(result.text, /Valid € evidence/);
  assert.equal(requests.length, 2);
  assert.equal(bad.counts.cancels, 1);
  assert.equal(bad.counts.releases, 1);
});

test("response UTF-8: invalid byte sequence is not replaced or cached", async () => {
  const bad = tracked([Uint8Array.of(0xc3, 0x28)]);
  const { session } = sessionWith([bad.response]);
  await assert.rejects(toolGetPaper(session, { slug: "risk-study" }), /did not return valid UTF-8/);
  assert.equal(session.cache.size, 0);
  assert.equal(bad.counts.cancels, 1);
  assert.equal(bad.counts.releases, 1);
});

test("response streams: mid-read transport failure is sanitized and disposed once", async () => {
  let pulls = 0;
  const fixture = tracked([], { pull(controller) {
    if (pulls++ === 0) controller.enqueue(encode("# Paper\n"));
    else controller.error(new Error("private transport detail"));
  } });
  const { session, requests } = sessionWith([fixture.response]);
  await assert.rejects(toolGetPaper(session, { slug: "risk-study" }), (error) => {
    assert.match(error.message, /could not be reached/);
    assert.doesNotMatch(error.message, /private transport detail/);
    return true;
  });
  assert.equal(session.cache.size, 0);
  assert.equal(requests.length, 1);
  assert.equal(fixture.counts.cancels, 1);
  assert.equal(fixture.counts.releases, 1);
});

test("response streams: non-byte native stream data fails without cache admission", async () => {
  const fixture = tracked(["not a byte chunk"]);
  const { session } = sessionWith([fixture.response]);
  await assert.rejects(toolGetPaper(session, { slug: "risk-study" }), /could not be reached/);
  assert.equal(session.cache.size, 0);
  assert.equal(fixture.counts.reads, 1);
  assert.equal(fixture.counts.cancels, 1);
  assert.equal(fixture.counts.releases, 1);
});

test("response abort: an already aborted request performs no dispatch", async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  await assert.rejects(fetchBoundedText(() => { calls++; }, BASE, {
    signal: controller.signal, maxBytes: MAX_BYTES,
  }), { name: "AbortError" });
  assert.equal(calls, 0);
});

test("response abort: already aborted supplied body is cancelled without a read", async () => {
  const controller = new AbortController();
  controller.abort();
  const fixture = tracked([encode("never read")]);
  await assert.rejects(read(fixture, MAX_BYTES, controller.signal), { name: "AbortError" });
  assert.deepEqual(fixture.counts, { reads: 0, cancels: 1, releases: 1, pulls: 0, sourceCancels: 1 });
});

test("response abort: late fetch completion is cancelled without body admission", async () => {
  const controller = new AbortController();
  const pending = deferred();
  const fixture = tracked([encode("late")]);
  let calls = 0;
  const result = fetchBoundedText((_url, options) => {
    calls++;
    assert.equal(options.signal, controller.signal);
    assert.equal(options.redirect, "error");
    return pending.promise;
  }, BASE, { signal: controller.signal, maxBytes: MAX_BYTES });
  controller.abort();
  await assert.rejects(result, { name: "AbortError" });
  pending.resolve(fixture.response);
  await pending.promise;
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.deepEqual(fixture.counts, { reads: 0, cancels: 1, releases: 1, pulls: 0, sourceCancels: 1 });
});

test("response abort: stalled read releases once without awaiting stuck cancellation", async () => {
  const controller = new AbortController();
  const started = deferred();
  const cancellation = deferred();
  const fixture = tracked([], {
    pull() { started.resolve(); },
    cancel() { return cancellation.promise; },
  });
  const result = read(fixture, MAX_BYTES, controller.signal);
  await started.promise;
  controller.abort();
  await assert.rejects(result, { name: "AbortError" });
  assert.equal(fixture.counts.reads, 1);
  assert.equal(fixture.counts.cancels, 1);
  assert.equal(fixture.counts.releases, 1);
  assert.equal(fixture.response.body.locked, false);
  cancellation.resolve();
});

test("response deadline: a native timeout remains active through the body read", async () => {
  const signal = AbortSignal.timeout(30);
  const fixture = tracked([], { pull() {} });
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(fetchBoundedText((_url, options) => {
      assert.equal(options.signal, signal);
      return Promise.resolve(fixture.response);
    }, BASE, { signal, maxBytes: MAX_BYTES }), { name: "TimeoutError" });
    assert.equal(signal.aborted, true);
    assert.equal(fixture.counts.reads, 1);
    assert.equal(fixture.counts.cancels, 1);
    assert.equal(fixture.counts.releases, 1);
  } finally {
    clearTimeout(keepAlive);
  }
});

test("response deadline: server fifteen-second scope refuses stalled body and cache", { timeout: 22000 }, async () => {
  const fixture = tracked([], { pull() {} });
  const { session, requests } = sessionWith([fixture.response]);
  const keepAlive = setTimeout(() => {}, 21000);
  try {
    await assert.rejects(toolGetPaper(session, { slug: "risk-study" }), /exceeded the request deadline/);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].signal.aborted, true);
    assert.equal(session.cache.size, 0);
    assert.equal(fixture.counts.reads, 1);
    assert.equal(fixture.counts.cancels, 1);
    assert.equal(fixture.counts.releases, 1);
  } finally {
    clearTimeout(keepAlive);
  }
});

test("response abort: queued bytes after abort are never decoded", async () => {
  const controller = new AbortController();
  const fixture = tracked([], { pull(stream) {
    stream.enqueue(Uint8Array.of(255));
    controller.abort();
  } });
  await assert.rejects(read(fixture, MAX_BYTES, controller.signal), { name: "AbortError" });
  assert.equal(fixture.counts.reads, 1);
  assert.equal(fixture.counts.cancels, 1);
  assert.equal(fixture.counts.releases, 1);
});

test("response abort: abort at end-of-body refuses successful completion", async () => {
  const controller = new AbortController();
  const fixture = tracked([encode("good")], { onRead(value) {
    if (value.done) controller.abort();
    return value;
  } });
  await assert.rejects(read(fixture, MAX_BYTES, controller.signal), { name: "AbortError" });
  assert.equal(fixture.counts.reads, 2);
  assert.equal(fixture.counts.cancels, 1);
  assert.equal(fixture.counts.releases, 1);
});

test("response HTTP: missing paper never reads or caches its error body", async () => {
  const fixture = tracked([new Uint8Array(MAX_BYTES + 1)], { status: 404 });
  const { session, requests } = sessionWith([fixture.response]);
  await assert.rejects(toolGetPaper(session, { slug: "missing" }), /no paper has the slug missing/);
  assert.equal(session.cache.size, 0);
  assert.equal(requests.length, 1);
  assert.deepEqual(fixture.counts, { reads: 0, cancels: 1, releases: 1, pulls: 0, sourceCancels: 1 });
});

test("response HTTP: server error body is cancelled before reads and a healthy call recovers", async () => {
  const bad = tracked([encode("private error")], { status: 500, headers: { "content-length": String(MAX_BYTES + 1) } });
  const { session, requests } = sessionWith([bad.response, new Response(indexText)]);
  await assert.rejects(toolSearchResearch(session, { query: "risk" }), /returned HTTP 500/);
  assert.equal(session.cache.size, 0);
  assert.equal(unpack(await toolSearchResearch(session, { query: "risk" })).matched, 1);
  assert.equal(requests.length, 2);
  assert.deepEqual(bad.counts, { reads: 0, cancels: 1, releases: 1, pulls: 0, sourceCancels: 1 });
});

test("response cache: malformed JSON is not cached and a later valid response is", async () => {
  const { session, requests } = sessionWith([new Response("{broken"), new Response(indexText)]);
  await assert.rejects(toolSearchResearch(session, { query: "risk" }), /did not return JSON/);
  assert.equal(session.cache.size, 0);
  assert.equal(unpack(await toolSearchResearch(session, { query: "risk" })).matched, 1);
  assert.equal(unpack(await toolListTopics(session)).papers, 1);
  assert.equal(requests.length, 2);
  assert.equal(session.cache.get("/research-index.json").text, indexText);
});

test("response cache: late malformed concurrent completion preserves newer valid entry", async () => {
  const started = deferred();
  const finish = deferred();
  let supplied = false;
  const bad = tracked([], { async pull(controller) {
    if (supplied) { controller.close(); return; }
    supplied = true;
    started.resolve();
    await finish.promise;
    controller.enqueue(encode("{broken"));
    controller.close();
  } });
  const { session, requests } = sessionWith([bad.response, new Response(indexText)]);
  const badResult = toolSearchResearch(session, { query: "risk" });
  const rejection = assert.rejects(badResult, /did not return JSON/);
  await started.promise;
  assert.equal(unpack(await toolSearchResearch(session, { query: "risk" })).matched, 1);
  const validEntry = session.cache.get("/research-index.json");
  finish.resolve();
  await rejection;
  assert.equal(session.cache.get("/research-index.json"), validEntry);
  assert.equal(unpack(await toolListTopics(session)).papers, 1);
  assert.equal(requests.length, 2);
});

test("response cache: invalid cached hit is evicted without suppressing later healthy fetch", async () => {
  const { session, requests } = sessionWith([new Response(indexText)], () => 1000);
  session.cache.set("/research-index.json", { at: 1000, text: "{broken" });
  await assert.rejects(toolListTopics(session), /did not return JSON/);
  assert.equal(session.cache.size, 0);
  assert.equal(requests.length, 0);
  assert.equal(unpack(await toolListTopics(session)).papers, 1);
  assert.equal(requests.length, 1);
});

test("response cache: clock rollback makes a cached entry stale", async () => {
  let clock = 1000;
  const { session, requests } = sessionWith([new Response(indexText), new Response(indexText)], () => clock);
  await toolListTopics(session);
  clock = 999;
  await toolListTopics(session);
  assert.equal(requests.length, 2);
  assert.equal(session.cache.get("/research-index.json").at, 999);
});

test("response cache: exactly ten minutes expires while the preceding millisecond hits", async () => {
  let clock = 1000;
  const { session, requests } = sessionWith([new Response(indexText), new Response(indexText)], () => clock);
  await toolListTopics(session);
  clock += TTL - 1;
  await toolListTopics(session);
  assert.equal(requests.length, 1);
  clock++;
  await toolListTopics(session);
  assert.equal(requests.length, 2);
});

test("response cache: nonfinite ages never produce cache hits", async () => {
  for (const clock of [NaN, Infinity, -Infinity]) {
    const { session, requests } = sessionWith([new Response(indexText), new Response(indexText)], () => clock);
    await toolListTopics(session);
    await toolListTopics(session);
    assert.equal(requests.length, 2);
  }
});

test("response transport: fetch rejection is sanitized with one dispatch and no retry", async () => {
  const { session, requests } = sessionWith([() => { throw new Error("credential-like secret"); }]);
  await assert.rejects(toolListTopics(session), (error) => {
    assert.match(error.message, /could not be reached/);
    assert.doesNotMatch(error.message, /credential-like secret/);
    return true;
  });
  assert.equal(session.cache.size, 0);
  assert.equal(requests.length, 1);
});

test("response success: all six tools preserve compact shapes and exact source limits", async () => {
  const sourceLimits = ["Supplied source limit.", "Paper observations only."];
  const envelope = (data) => ({ generated_at: "2026-10-02T00:00:00Z", data, limits: sourceLimits, canonical_human_page: BASE + "/record" });
  const markdown = "# Study\n## Method\n研究 € 😀\n### Data\nSupplied observations.\n## Claim boundary\nPaper only.\n";
  const record = { capital: { kind: "paper" }, source_note: "原文" };
  const sleeves = envelope({ rows: [] });
  const chain = envelope({ head: { seq: 3, digest: "supplied" } });
  const map = new Map([
    ["/research-index.json", indexText],
    ["/research/risk-study.md", markdown],
    ["/api/v1/trials/summary.json", JSON.stringify(envelope({ tried: 3, budget: 10 }))],
    ["/api/v1/record.json", JSON.stringify(record)],
    ["/api/v1/sleeves.json", JSON.stringify(sleeves)],
    ["/api/v1/chain/head.json", JSON.stringify(chain)],
  ]);
  const requests = [];
  const session = createSession({ base: BASE, fetchImpl: async (url, options) => {
    const path = new URL(url).pathname;
    requests.push({ path, ...options });
    assert.ok(map.has(path));
    const bytes = encode(map.get(path));
    return tracked([bytes.slice(0, 3), bytes.slice(3)]).response;
  } });
  const search = unpack(await toolSearchResearch(session, { query: "risk" }));
  assert.deepEqual(search.columns, ["slug", "title", "year", "url", "archival"]);
  assert.deepEqual(search.rows, [["risk-study", "Risk study", 2026, BASE + "/research/risk-study", false]]);
  assert.deepEqual(search.limits, RESEARCH_LIMITS);
  const topics = unpack(await toolListTopics(session));
  assert.deepEqual(topics.columns, ["slug", "label", "papers", "about"]);
  assert.deepEqual(topics.rows, [["risk", "Risk", 1, "Source-bound research."]]);
  assert.deepEqual(topics.limits, RESEARCH_LIMITS);
  const fullPaper = await toolGetPaper(session, { slug: "risk-study" });
  const paper = unpack(fullPaper);
  assert.equal(paper.text, markdown);
  assert.equal(paper.total_chars, markdown.length);
  assert.equal(paper.truncated, false);
  assert.equal(paper.citation, BASE + "/research/citations/risk-study.bib");
  assert.deepEqual(paper.limits, RESEARCH_LIMITS);
  assert.deepEqual(fullPaper.structuredContent, paper);
  const section = unpack(await toolGetPaper(session, { slug: "risk-study", section: "method" }));
  assert.equal(section.section, "Method");
  assert.match(section.text, /### Data/);
  assert.doesNotMatch(section.text, /## Claim boundary/);
  const trial = unpack(await toolTrialLedger(session));
  assert.deepEqual(trial.data, { tried: 3, budget: 10 });
  assert.deepEqual(trial.limits, sourceLimits);
  assert.equal(trial.page, BASE + "/record");
  assert.equal(trial.meaning, "How many distinct hypotheses were tried against the declared budget, and how many were killed or survived. A strategy's statistics mean little without this count.");
  const live = unpack(await toolLiveRecord(session));
  assert.deepEqual(live.record, record);
  assert.deepEqual(live.sleeves, { generated_at: sleeves.generated_at, data: sleeves.data, limits: sourceLimits, page: sleeves.canonical_human_page });
  assert.deepEqual(live.limits, [...RESEARCH_LIMITS, ...sourceLimits]);
  const head = unpack(await toolChainHead(session));
  assert.deepEqual(head.data, chain.data);
  assert.deepEqual(head.limits, sourceLimits);
  assert.equal(head.verify, BASE + "/verify");
  assert.equal(requests.length, 6);
  assert.ok(requests.every((request) => request.redirect === "error" && request.signal instanceof AbortSignal));
  assert.equal(hiddenRequests, 0);
});
