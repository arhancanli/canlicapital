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
    entries: chain.entries.length,
    first_date: chain.entries[0].date,
    last_date: chain.entries.at(-1).date,
    head_seq: chain.entries.at(-1).seq,
    head_chain_hash: chain.entries.at(-1).chain_hash,
    signatures_verified: chain.entries.length,
    links_verified: chain.entries.length,
    first_disclosed_seq: chain.payload_disclosure.first_disclosed_seq,
    disclosed_entries: chain.payload_disclosure.disclosed_entries,
    opaque_historical_entries: chain.payload_disclosure.opaque_historical_entries,
    anchors: anchors.anchor_count,
    bitcoin_confirmed_anchors: anchors.bitcoin_confirmed_count,
    calendar_pending_anchors: anchors.calendar_pending_count,
    payload_rehash: "REQUIRES_PUBLISHED_PYTHON_VERIFIER",
  });
});

test("a changed historical field breaks its chain hash", async () => {
  const mutated = clone(chain);
  const sequence = Math.floor(mutated.entries.length / 2);
  mutated.entries[sequence].date = `${mutated.entries[sequence].date}T`;
  await assert.rejects(
    validateEvidenceChain(mutated, anchors),
    new RegExp(`Chain hash mismatch at ${sequence}`),
  );
});

test("a rewritten predecessor breaks continuity", async () => {
  const mutated = clone(chain);
  const sequence = Math.floor(mutated.entries.length * 0.6);
  mutated.entries[sequence].prev_chain_hash = "f".repeat(64);
  await assert.rejects(
    validateEvidenceChain(mutated, anchors),
    new RegExp(`Predecessor mismatch at ${sequence}`),
  );
});

test("a changed signature fails closed", async () => {
  const mutated = clone(chain);
  const sequence = mutated.entries.length - 1;
  mutated.entries[sequence].signature = `00${mutated.entries[sequence].signature.slice(2)}`;
  await assert.rejects(
    validateEvidenceChain(mutated, anchors),
    new RegExp(`Signature mismatch at ${sequence}`),
  );
});

test("an anchor cannot point at another chain head", async () => {
  const mutated = clone(anchors);
  const sequence = mutated.anchors[0].seq === 0 ? 1 : mutated.anchors[0].seq - 1;
  mutated.anchors[0].chain_hash = chain.entries[sequence].chain_hash;
  await assert.rejects(validateEvidenceChain(chain, mutated), /checkpoint mismatch/);
});
