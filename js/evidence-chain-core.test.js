import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { validateEvidenceChain } from "./evidence-chain-core.js";


const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const chain = readJson("../public/glassbox/transparency_log.json");
const anchors = readJson("../public/glassbox/ots/anchors.json");
const clone = (value) => structuredClone(value);

test("browser verifier checks the complete current chain and anchor manifest", async () => {
  const result = await validateEvidenceChain(chain, anchors);
  assert.deepEqual(result, {
    status: "PASS",
    entries: 509,
    first_date: "2026-06-27",
    last_date: "2026-08-26",
    head_seq: 508,
    head_chain_hash: "1b36908bed7139d2c2e6d77890f671f787a6da8f91d1a4c9cff04e31d63fefd5",
    signatures_verified: 509,
    links_verified: 509,
    first_disclosed_seq: 436,
    disclosed_entries: 73,
    opaque_historical_entries: 436,
    anchors: 52,
    bitcoin_confirmed_anchors: 51,
    calendar_pending_anchors: 1,
    payload_rehash: "REQUIRES_PUBLISHED_PYTHON_VERIFIER",
  });
});

test("a changed historical field breaks its chain hash", async () => {
  const mutated = clone(chain);
  mutated.entries[254].date = "2026-08-12";
  await assert.rejects(validateEvidenceChain(mutated, anchors), /Chain hash mismatch at 254/);
});

test("a rewritten predecessor breaks continuity", async () => {
  const mutated = clone(chain);
  mutated.entries[300].prev_chain_hash = "f".repeat(64);
  await assert.rejects(validateEvidenceChain(mutated, anchors), /Predecessor mismatch at 300/);
});

test("a changed signature fails closed", async () => {
  const mutated = clone(chain);
  mutated.entries[508].signature = `00${mutated.entries[508].signature.slice(2)}`;
  await assert.rejects(validateEvidenceChain(mutated, anchors), /Signature mismatch at 508/);
});

test("an anchor cannot point at another chain head", async () => {
  const mutated = clone(anchors);
  mutated.anchors[0].chain_hash = chain.entries[470].chain_hash;
  await assert.rejects(validateEvidenceChain(chain, mutated), /checkpoint mismatch/);
});
