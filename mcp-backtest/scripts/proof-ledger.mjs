// The published proof ledger's monthly run: add what these companies filed to the ledger, verify the
// whole file, and print the head. Usage: node proof-ledger.mjs companies.txt ledger.jsonl key.pem
import { readFileSync } from "node:fs";

import { createSession } from "canli-markets-mcp/src/sources.mjs";

import { proofFilings, verifyLedger } from "../src/proof.mjs";

const [listFile, ledger, keyFile] = process.argv.slice(2);
if (!listFile || !ledger || !keyFile) { process.stderr.write("usage: proof-ledger.mjs companies.txt ledger.jsonl key.pem\n"); process.exit(2); }
const companies = readFileSync(listFile, "utf8").split(/\r?\n/).map((l) => l.replace(/#.*/, "").trim()).filter(Boolean);
const r = await proofFilings(createSession(), { ledger_file: ledger, companies, key_file: keyFile });
process.stderr.write(`${r.plain_reading}\n${r.failed?.length ? `Could not read: ${r.failed.map((f) => f.company).join(", ")}\n` : ""}`);
const v = verifyLedger(ledger);
if (!v.valid) { process.stderr.write(`The ledger does not verify: ${v.problems.join(" ")}\n`); process.exit(1); }
process.stdout.write(`${JSON.stringify({ head: v.head, entries: v.entries, seals: v.seals, key_fingerprint: v.key_fingerprint, added: r.added, restatements_seen: r.restatements_seen, failed: r.failed?.length ?? 0 })}\n`);
