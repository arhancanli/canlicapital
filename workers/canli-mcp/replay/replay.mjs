#!/usr/bin/env node
// workers/canli-mcp/replay/replay.mjs
//
// The gate before the hosted canli-mcp moves to Cloudflare: the recorded calls in calls.json, sent to a candidate
// endpoint and, with --against, to the server it would replace. A call passes when the candidate answers it at all
// (no timeout, no HTTP or JSON-RPC failure, no Cloudflare error page such as 1102 for the CPU limit) and, with a
// reference, answers it the same way: a tool that declines on the reference (prices are off on both hosted
// servers) must decline here too, and one that answers must answer. The switch waits until every call passes.
//
//   node replay/replay.mjs <candidate-url> [--against <reference-url>] [--calls file] [--out file] [--gap ms]
//
// One call at a time, at least --gap ms apart on each endpoint (the hosted servers take 60 a minute from a caller);
// a 429 is waited out as its Retry-After asks, three times at most. Exits 1 when any call fails the gate.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const PROTOCOL = "2025-06-18";

// The JSON-RPC answer to request `id` from a JSON body or an event stream.
function answerOf(contentType, text, id) {
  if (/text\/event-stream/i.test(contentType)) {
    const messages = text.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => {
      try {
        return JSON.parse(l.slice(5));
      } catch {
        return null;
      }
    });
    return messages.find((m) => m && m.id === id) ?? null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// One call, classified: answered (with the tool's own isError flag) or failed, and why. canli-mcp shows the model
// find_tool, describe_tool and run_tool, so a recorded call goes through run_tool as {name, arguments}.
export async function callOnce(url, call, { id = 1, timeoutMs = 120_000, retries = 3, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), fetchImpl = fetch } = {}) {
  const params = { name: "run_tool", arguments: { name: call.name, arguments: call.arguments ?? {} } };
  const body = JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params });
  for (let attempt = 0; ; attempt++) {
    const started = Date.now();
    let res;
    let text;
    try {
      res = await fetchImpl(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": PROTOCOL }, body, signal: AbortSignal.timeout(timeoutMs) });
      text = await res.text();
    } catch (error) {
      return { name: call.name, ms: Date.now() - started, failed: error.name === "TimeoutError" ? `no answer in ${timeoutMs / 1000} s` : `${error.name}: ${error.message}` };
    }
    const ms = Date.now() - started;
    if (res.status === 429 && attempt < retries) {
      await sleep(1000 * Math.min(60, Number(res.headers.get("Retry-After")) || 5));
      continue;
    }
    // Cloudflare's own failures come as "error code: 1102" in plain text or "Error 1102" on an HTML page.
    const cloudflare = /(?:error code:?|\berror)\s*(1\d{3})\b/i.exec(text)?.[1] ?? (/exceeded resource limits/i.test(text) ? "1102" : null);
    const start = text.replace(/\s+/g, " ").slice(0, 200);
    if (cloudflare) return { name: call.name, ms, http: res.status, failed: `Cloudflare error ${cloudflare}${cloudflare === "1102" ? " (CPU limit)" : ""}`, body: start };
    if (res.status !== 200) return { name: call.name, ms, http: res.status, failed: `HTTP ${res.status}`, body: start };
    const answer = answerOf(res.headers.get("Content-Type") ?? "", text, id);
    if (!answer) return { name: call.name, ms, http: 200, failed: "no JSON-RPC answer in the response" };
    if (answer.error) return { name: call.name, ms, http: 200, failed: `JSON-RPC error ${answer.error.code}: ${String(answer.error.message).slice(0, 120)}` };
    const words = (answer.result?.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
    return { name: call.name, ms, http: 200, isError: answer.result?.isError === true, bytes: Buffer.byteLength(text), text: words.slice(0, 160), cache: res.headers.get("X-Canli-Cache") ?? undefined };
  }
}

const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] : null;
};

// The gate over two runs of the same calls (the reference may be missing).
export function judge(candidate, reference = null) {
  const rows = candidate.map((c, i) => {
    const r = reference?.[i];
    let problem = c.failed ?? null;
    if (!problem && r && !r.failed && r.isError !== c.isError) problem = c.isError ? "declines here but answers on the reference" : "answers here but declines on the reference";
    return { name: c.name, problem, ms: c.ms, referenceMs: r?.ms ?? null, referenceFailed: r?.failed ?? null };
  });
  const answered = candidate.filter((c) => !c.failed);
  // The Worker's X-Canli-Cache: the copies of public data the answers found in the edge cache, fresh or stale,
  // and the reads that found none.
  const counted = answered.map((c) => /hit=(\d+) stale=(\d+) miss=(\d+)/.exec(c.cache ?? "")).filter(Boolean);
  const total = (i) => counted.reduce((t, m) => t + Number(m[i]), 0);
  const cache = counted.length ? { hit: total(1), stale: total(2), miss: total(3) } : null;
  return {
    calls: candidate.length,
    passed: rows.filter((r) => !r.problem).length,
    failed: rows.filter((r) => r.problem).map(({ name, problem }) => ({ name, problem })),
    ms: { p50: percentile(answered.map((c) => c.ms), 50), p95: percentile(answered.map((c) => c.ms), 95) },
    referenceMs: reference ? { p50: percentile(reference.filter((c) => !c.failed).map((c) => c.ms), 50), p95: percentile(reference.filter((c) => !c.failed).map((c) => c.ms), 95) } : null,
    bytes: answered.reduce((t, c) => t + c.bytes, 0),
    cache,
    ok: rows.every((r) => !r.problem),
  };
}

async function main(argv) {
  const opt = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
  const candidateUrl = argv.find((a) => /^https?:\/\//.test(a) && argv[argv.indexOf(a) - 1] !== "--against");
  if (!candidateUrl) throw new Error("Give the candidate endpoint, such as https://canli-mcp.arhancanli.workers.dev");
  const referenceUrl = opt("--against", null);
  const calls = JSON.parse(readFileSync(opt("--calls", fileURLToPath(new URL("./calls.json", import.meta.url))), "utf8"));
  const gap = Number(opt("--gap", 1100));
  const candidate = [];
  const reference = referenceUrl ? [] : null;
  for (const [i, call] of calls.entries()) {
    const started = Date.now();
    candidate.push(await callOnce(candidateUrl, call, { id: i + 1 }));
    if (reference) reference.push(await callOnce(referenceUrl, call, { id: i + 1 }));
    const left = gap - (Date.now() - started);
    if (left > 0) await new Promise((r) => setTimeout(r, left));
    process.stderr.write(`${i + 1}/${calls.length} ${call.name}: ${candidate.at(-1).failed ?? (candidate.at(-1).isError ? "declined" : "answered")}\n`);
  }
  const verdict = judge(candidate, reference);
  const report = { candidate: candidateUrl, reference: referenceUrl, at: new Date().toISOString(), ...verdict, runs: { candidate, reference } };
  const out = opt("--out", null);
  if (out) writeFileSync(out, `${JSON.stringify(report, null, 1)}\n`);
  console.log(JSON.stringify({ ...verdict, failed: verdict.failed.slice(0, 30) }, null, 1));
  process.exitCode = verdict.ok ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main(process.argv.slice(2));
