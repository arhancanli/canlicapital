#!/usr/bin/env node
// scripts/grant-contributor-access.mjs
//
// Grants or removes contributor access for one validation API key, named the way the Contributor
// access issue form names it: by its fingerprint, the hex SHA-256 of the key (exactly the key_hash
// the store keeps; printf '%s' "$CANLI_KEY" | shasum -a 256 prints it and GET /api/v1/keys/me
// returns it), or by its label, which must then be carried by exactly one active key. Give both
// and they must agree. The key itself is never needed, read or printed.
//
//   node scripts/grant-contributor-access.mjs grant --fingerprint <sha256> --github <login> [--note <text>]
//   node scripts/grant-contributor-access.mjs grant --label <label> --github <login> [--note <text>]
//   node scripts/grant-contributor-access.mjs revoke --fingerprint <sha256>
//   node scripts/grant-contributor-access.mjs revoke --label <label>
//
// --key-hash is accepted as another name for --fingerprint. The grant runs the SECURITY DEFINER
// functions of supabase/migrations/20261005_contributor_access.sql as the service role, so
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the environment; neither is ever
// printed.
//
// Before granting, check that the GitHub account that opened the issue is the author of a merged
// pull request, and record that pull request in --note. A label only shows which key carries it,
// not who holds that key, so prefer the fingerprint. A grant sets the key's daily limit to
// LIMITS.contributor_validations_per_key_per_day; granting again replaces the login, note and
// limit. Revoking removes the tier; the key keeps working at the standard limit.
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { LIMITS } from "../api/_lib/limits.js";
import { createStore } from "../api/_lib/store.js";

export const USAGE = [
  "Usage:",
  "  node scripts/grant-contributor-access.mjs grant (--fingerprint <sha256> | --label <label>) --github <login> [--note <text>]",
  "  node scripts/grant-contributor-access.mjs revoke (--fingerprint <sha256> | --label <label>)",
  "The fingerprint is the key's hex SHA-256 (the stored key_hash), never the key. Giving both",
  "--fingerprint and --label requires them to agree. Set SUPABASE_URL and",
  "SUPABASE_SERVICE_ROLE_KEY in the environment.",
].join("\n");

const FINGERPRINT = /^[0-9a-fA-F]{64}$/;
// The same rule as the key_tiers.github_login check constraint.
const GITHUB_LOGIN = /^[A-Za-z0-9-]{1,39}$/;
// Labels are stored as at most 64 characters (api/v1/keys.js); control characters never match one.
const LABEL = /^[^\u0000-\u001f\u007f]{1,64}$/;
const MAX_NOTE_CHARS = 500;
const API_KEY = /ck_live_/;
const OPTIONS = new Map([["--fingerprint", "fingerprint"], ["--key-hash", "fingerprint"], ["--label", "label"], ["--github", "github"], ["--note", "note"]]);

export const REFUSALS = Object.freeze({
  unknown_key: "No key matches. Ask the holder to check the fingerprint or label.",
  ambiguous_label: "More than one active key carries that label. Ask the holder for the key's fingerprint.",
  label_mismatch: "The key with that fingerprint does not carry that label. Ask the holder which is right.",
  revoked_key: "That key is revoked. Ask the holder to name an active key.",
  no_key_named: "Name the key with --fingerprint or --label.",
  no_tier: "That key had no contributor access to remove.",
});

export class UsageError extends Error {}

// No message here repeats an argument back: a key pasted in the wrong place must not be printed.
export function parseArgs(argv) {
  const [action, ...rest] = argv;
  if (action !== "grant" && action !== "revoke") throw new UsageError("Choose grant or revoke.");
  if (argv.some((arg) => API_KEY.test(String(arg)))) throw new UsageError("An argument contains an API key. It was not printed or sent. Ask its holder to name the key by fingerprint or label, and to revoke the exposed key.");
  const options = {};
  for (let i = 0; i < rest.length; i += 2) {
    const name = OPTIONS.get(rest[i]);
    if (!name || rest[i + 1] === undefined || name in options) throw new UsageError("Unexpected, repeated or incomplete option.");
    options[name] = rest[i + 1];
  }
  if (options.fingerprint !== undefined && !FINGERPRINT.test(options.fingerprint)) throw new UsageError("--fingerprint must be the key's 64-character hex SHA-256.");
  if (options.label !== undefined && !LABEL.test(options.label)) throw new UsageError("--label must be the key's label: 1 to 64 characters.");
  if (options.fingerprint === undefined && options.label === undefined) throw new UsageError("Name the key with --fingerprint or --label.");
  const key = { keyHash: options.fingerprint?.toLowerCase() ?? null, label: options.label ?? null };
  if (action === "revoke") {
    if (options.github !== undefined || options.note !== undefined) throw new UsageError("revoke takes only --fingerprint or --label.");
    return { action, ...key };
  }
  if (!GITHUB_LOGIN.test(options.github ?? "")) throw new UsageError("--github must be the contributor's GitHub login.");
  const note = options.note ?? null;
  if (note !== null && note.length > MAX_NOTE_CHARS) throw new UsageError(`The note is at most ${MAX_NOTE_CHARS} characters.`);
  return { action, ...key, githubLogin: options.github, note };
}

export async function main(argv, { env = process.env, fetchImpl = globalThis.fetch, out = console.log, err = console.error } = {}) {
  let request;
  try { request = parseArgs(argv); } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    err(`${e.message}\n${USAGE}`);
    return 2;
  }
  let store;
  try { store = createStore({ url: env.SUPABASE_URL, serviceKey: env.SUPABASE_SERVICE_ROLE_KEY, fetchImpl }); } catch {
    err("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (the service role) in the environment.");
    return 2;
  }
  try {
    if (request.action === "grant") {
      const result = await store.grantKeyTier({ keyHash: request.keyHash, label: request.label, tier: "contributor", dailyLimit: LIMITS.contributor_validations_per_key_per_day, githubLogin: request.githubLogin, note: request.note });
      out(JSON.stringify(result, null, 2));
      if (!result.granted) { err(`Not granted: ${REFUSALS[result.reason] ?? result.reason}`); return 1; }
      if (result.matched_by === "label") err("Matched by label. A label does not prove who holds the key; the fingerprint above is the key that was granted.");
      return 0;
    }
    const result = await store.revokeKeyTier({ keyHash: request.keyHash, label: request.label });
    out(JSON.stringify(result, null, 2));
    if (result.revoked) return 0;
    err(`Nothing removed: ${REFUSALS[result.reason] ?? result.reason}`);
    return result.reason === "no_tier" ? 0 : 1;
  } catch (e) {
    // A StoreError carries PostgREST's own message (a check constraint, a missing function); it
    // never contains the service role key, which only travels in request headers.
    err(`The store did not complete the ${request.action}: ${e.status ? `HTTP ${e.status} ` : ""}${e.detail ?? e.message}`);
    return 1;
  }
}

let isEntry = false;
try { isEntry = Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { /* Imported by a test. */ }
if (isEntry) process.exitCode = await main(process.argv.slice(2));
