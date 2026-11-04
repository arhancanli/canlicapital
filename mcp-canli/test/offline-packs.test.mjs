// CANLI_OFFLINE=packs: the network-free packs and the fundamentals pack, which reads only what was saved on this
// machine with fetch refused: a saved company answers, its receipt says no network was reached, and a company
// that was not saved says so. canli-mcp pack add keeps the list, readable only by its owner.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

import { packAdd, packList } from "../local/pack.mjs";
import { enabledPacks, offlineMode } from "../src/packs.mjs";
import { RECEIPT_KEY } from "../src/server.mjs";

const ENTRY = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/server.mjs");

test("the packs offline mode keeps the network-free packs and the fundamentals pack", () => {
  assert.deepEqual(enabledPacks({ CANLI_OFFLINE: "packs" }), ["quant", "validation", "fundamentals"]);
  assert.deepEqual(enabledPacks({ CANLI_OFFLINE: "1" }), ["quant", "validation"]);
  assert.deepEqual([offlineMode({ CANLI_OFFLINE: "packs" }), offlineMode({ CANLI_OFFLINE: "yes" }), offlineMode({})], ["packs", "strict", null]);
});

test("pack add keeps one entry a company, readable only by its owner", async () => {
  const home = mkdtempSync(path.join(tmpdir(), "pack-"));
  try {
    const call = async (name, args) => (name === "find_company" ? {} : { company: { cik: args.company === "MISSING" ? null : "0000123456", name: "Fixture Corp" }, snapshot: { fetched_at: "2026-09-19T09:30:25.021Z" } });
    await packAdd(home, call, ["FIX"]);
    const out = await packAdd(home, call, ["123456"]);
    assert.equal(out.in_pack, 1, "the same company once");
    assert.equal(packList(home).companies[0].query, "123456");
    assert.equal(statSync(path.join(home, "offline-pack.json")).mode & 0o777, 0o600);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("offline, a saved company answers with no network reached, and one not saved says so", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "offline-cache-"));
  mkdirSync(dir, { recursive: true });
  const facts = { cik: 123456, entityName: "Fixture Corp", facts: { "us-gaap": { Revenues: { label: "Revenues", units: { USD: [{ start: "2019-10-01", end: "2020-09-30", val: 110, accn: "0000123456-20-000020", fy: 2020, fp: "FY", form: "10-K", filed: "2020-10-29" }] } } } } };
  const raw = Buffer.from(JSON.stringify(facts)), sha = createHash("sha256").update(raw).digest("hex");
  const old = Date.parse("2026-01-01T00:00:00Z");
  const kept = (body) => JSON.stringify({ etag: null, at: old, body });
  writeFileSync(path.join(dir, "company-tickers.json"), kept({ schema: "canli.company-tickers.v1", count: 1, tickers: { FIX: "0000123456" } }));
  writeFileSync(path.join(dir, "company-0000123456.json"), kept({ schema: "canli.company-reference.v1", cik: "0000123456", name: "Fixture Corp", source_url: "https://data.sec.gov/api/xbrl/companyfacts/CIK0000123456.json", source_sha256: sha, source_snapshot: `/company-data/sources/${sha}.json.gz`, fetched_at: "2026-09-19T09:30:25.021Z" }));
  writeFileSync(path.join(dir, `${sha}.json.gz`), gzipSync(raw));
  const c = new Client({ name: "offline-test", version: "0" });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: [ENTRY], env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", CANLI_CACHE_DIR: dir, CANLI_OFFLINE: "packs" } }));
  try {
    const call = (name, args) => c.callTool({ name: "run_tool", arguments: { name, arguments: args } });
    const saved = await call("history", { company: "FIX", concept: "Revenues" });
    assert.notEqual(saved.isError, true, saved.content[0].text);
    assert.equal(JSON.parse(saved.content[0].text).rows[0][2], 110);
    assert.match(saved._meta[RECEIPT_KEY].network, /^none/);
    const missing = await call("history", { company: "0000999999", concept: "Revenues" });
    assert.equal(missing.isError, true);
    assert.match(missing.content[0].text, /Offline: only the companies saved with canli-mcp pack add are here/);
  } finally {
    await c.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
