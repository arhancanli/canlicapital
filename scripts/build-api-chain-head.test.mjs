// The homepage and /open used to download the full signed transparency chain
// (5.7 MB decoded) just to read four fields off its head. They now read
// public/api/v1/chain/head.json instead, built by build-api.mjs from the same
// log. This test is the guarantee that swap can never silently drift: every
// field the two pages actually render must equal the value on the full log,
// byte for byte, not just structurally.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));

const log = readJson("../public/glassbox/transparency_log.json");
const artifact = readJson("../public/api/v1/chain/head.json");

test("chain/head carries the four fields js/home.js and js/open.js read, equal to the log", () => {
  const head = log.head ?? log.entries.at(-1);
  assert.equal(artifact.data.head.seq, head.seq);
  assert.equal(artifact.data.head.chain_hash, head.chain_hash);
  assert.equal(artifact.data.head.generated_at, head.generated_at);
  assert.equal(artifact.data.entry_count, log.entry_count);
});

test("chain/head also carries the fields js/open.js reads for the rest of the evidence console", () => {
  assert.equal(artifact.data.distinct_days, log.distinct_days);
  assert.equal(artifact.data.public_key_ed25519_hex, log.public_key_ed25519_hex);
  assert.equal(artifact.data.verify, log.verify);
});

test("entry_count is derived from the log, never a typed literal", () => {
  assert.equal(artifact.data.entry_count, log.entries.length);
});
