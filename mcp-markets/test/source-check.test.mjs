// source_check: each document read again past every cache and said to be the same, changed or unreachable; only
// documents from the sources this pack reads are fetched (every address in src/ is on the list); an address with a
// key, a query sent as a POST, or one with no hash recorded is named and not fetched.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { gzipSync } from "node:zlib";

import { HOSTS, sourceCheck } from "../src/source-check.mjs";
import { createSession, getText } from "../src/sources.mjs";

const sha = (t) => createHash("sha256").update(t).digest("hex");
const SRC = new URL("../src/", import.meta.url);

test("every address the pack reads is a host source_check may read again", () => {
  const hosts = new Set();
  for (const f of readdirSync(SRC).filter((f) => f.endsWith(".mjs"))) for (const m of readFileSync(new URL(f, SRC), "utf8").matchAll(/https:\/\/([a-z0-9.-]+)/gi)) hosts.add(m[1].toLowerCase());
  // JSON-RPC endpoints take queries as POST bodies, which the evidence names and nothing fetches again.
  const missing = [...hosts].filter((h) => !HOSTS.has(h) && !/-rpc\.publicnode\.com$/.test(h) && !/(^|\.)example\.(com|test|org)$/.test(h));
  assert.deepEqual(missing, []);
});

test("each document read again: same, changed, unreachable, or named and not fetched", async () => {
  const pages = new Map([["https://www.sec.gov/a.htm", "filing text"], ["https://www.sec.gov/b.htm", "new text"]]);
  const snapshot = JSON.stringify({ facts: { revenue: 1 } });
  const fetched = [];
  const fetchImpl = async (url) => {
    fetched.push(url);
    if (url.endsWith(".json.gz")) return new Response(gzipSync(snapshot));
    if (pages.has(url)) return new Response(pages.get(url));
    return new Response("down", { status: 500 });
  };
  const session = createSession({ fetchImpl, env: {}, now: () => Date.parse("2026-11-04T09:00:00Z"), sleep: async () => {} });
  // Read once, so a copy is cached: the check must read past it.
  await getText(session, "https://www.sec.gov/b.htm");
  pages.set("https://www.sec.gov/b.htm", "newer text");
  const snap = `https://canlicapital.com/company-data/sources/${"a".repeat(64)}.json.gz`;
  const out = await sourceCheck(session, { sources: [
    { url: "https://www.sec.gov/a.htm", sha256_16: sha("filing text").slice(0, 16), retrieved_at: "2026-11-01T00:00:00Z" },
    { url: "https://www.sec.gov/b.htm", sha256_16: sha("new text").slice(0, 16) },
    { url: snap, sha256: sha(snapshot) },
    { url: "https://www.sec.gov/gone.htm", sha256_16: "0123456789abcdef" },
    { url: "https://attacker.example/x", sha256_16: "0123456789abcdef" },
    { url: "https://api.tiingo.com/daily?token=secret", sha256_16: "0123456789abcdef" },
    { url: "POST https://api.finra.org/data {\"q\":1}", sha256_16: "0123456789abcdef" },
    { url: "http://www.sec.gov/a.htm", sha256_16: "0123456789abcdef" },
    { url: "https://www.sec.gov/c.htm" },
  ] });
  assert.deepEqual(out.rows.map((r) => r[3].split(":")[0]), ["same", "changed", "same", "unreachable", "not checked", "not checked", "not checked", "not checked", "not checked"]);
  assert.deepEqual([out.same, out.changed, out.not_checked], [2, 1, 6]);
  assert.match(out.rows[4][3], /attacker\.example is not a source this server reads/);
  assert.match(out.rows[5][3], /carries a key/);
  assert.equal(out.rows[1][2], sha("newer text").slice(0, 16), "read past the cached copy");
  assert.match(out.reading, /1 of the documents changed/);
  assert.ok(!fetched.some((u) => /attacker|tiingo|http:\/\/|POST/.test(u)), "nothing outside the sources is fetched");
});
