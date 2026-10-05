// The maintainer's contributor-access script: the key named by fingerprint or label only, the
// limit from LIMITS, the service role from the environment, and nothing secret ever printed.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { hashKey } from "../api/_lib/auth.js";
import { LIMITS } from "../api/_lib/limits.js";
import { main, parseArgs, REFUSALS, UsageError } from "./grant-contributor-access.mjs";

const SERVICE_KEY = "service-role-secret-0123456789";
const ENV = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY };
const API_KEY = "ck_live_" + "x".repeat(43);
// The fingerprint a contributor posts: printf '%s' "$CANLI_KEY" | shasum -a 256.
const FINGERPRINT = hashKey(API_KEY);

function fakeStore(respond) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ path: new URL(url).pathname, body: JSON.parse(init.body), headers: init.headers });
    const { status = 200, body } = respond(new URL(url).pathname, JSON.parse(init.body));
    return { ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
  };
  return { calls, fetchImpl };
}

async function run(argv, respond = () => ({ body: null }), env = ENV) {
  const store = fakeStore(respond);
  const out = [];
  const err = [];
  const code = await main(argv, { env, fetchImpl: store.fetchImpl, out: (s) => out.push(s), err: (s) => err.push(s) });
  return { code, calls: store.calls, out: out.join("\n"), err: err.join("\n") };
}

test("parseArgs names the key by fingerprint, label or both, lower-cases the fingerprint and takes a login and note", () => {
  assert.deepEqual(parseArgs(["grant", "--fingerprint", FINGERPRINT.toUpperCase(), "--github", "octo-cat", "--note", "PR #412"]), { action: "grant", keyHash: FINGERPRINT, label: null, githubLogin: "octo-cat", note: "PR #412" });
  assert.deepEqual(parseArgs(["grant", "--label", "octo-runner", "--github", "octo-cat"]), { action: "grant", keyHash: null, label: "octo-runner", githubLogin: "octo-cat", note: null });
  assert.deepEqual(parseArgs(["grant", "--key-hash", FINGERPRINT, "--label", "octo-runner", "--github", "octo-cat"]), { action: "grant", keyHash: FINGERPRINT, label: "octo-runner", githubLogin: "octo-cat", note: null });
  assert.deepEqual(parseArgs(["revoke", "--fingerprint", FINGERPRINT]), { action: "revoke", keyHash: FINGERPRINT, label: null });
  assert.deepEqual(parseArgs(["revoke", "--label", "octo-runner"]), { action: "revoke", keyHash: null, label: "octo-runner" });
});

test("parseArgs refuses bad input without repeating it", () => {
  for (const argv of [
    [], ["grant"], ["delete", "--fingerprint", FINGERPRINT], ["grant", "--github", "octo-cat"],
    ["grant", "--fingerprint", "abc", "--github", "octo-cat"], ["grant", "--fingerprint", API_KEY, "--github", "octo-cat"],
    ["grant", "--label", API_KEY, "--github", "octo-cat"], ["grant", "--label", "", "--github", "octo-cat"], ["grant", "--label", "l".repeat(65), "--github", "octo-cat"],
    ["grant", "--fingerprint", FINGERPRINT], ["grant", "--fingerprint", FINGERPRINT, "--github", "not a login"], ["grant", "--fingerprint", FINGERPRINT, "--github", "x".repeat(40)],
    ["grant", "--fingerprint", FINGERPRINT, "--github", "octo-cat", "--note"], ["grant", "--fingerprint", FINGERPRINT, "--fingerprint", FINGERPRINT, "--github", "octo-cat"],
    ["grant", "--fingerprint", FINGERPRINT, "--key-hash", FINGERPRINT, "--github", "octo-cat"],
    ["grant", "--fingerprint", FINGERPRINT, "--github", "octo-cat", API_KEY, "x"], ["grant", "--fingerprint", FINGERPRINT, "--github", "octo-cat", "--note", `my key is ${API_KEY}`],
    ["grant", "--fingerprint", FINGERPRINT, "--github", "octo-cat", "--note", "n".repeat(501)], ["revoke", "--fingerprint", FINGERPRINT, "--github", "octo-cat"], ["revoke"],
  ]) {
    assert.throws(() => parseArgs(argv), (e) => e instanceof UsageError && !e.message.includes(API_KEY) && !e.message.includes("not a login"), JSON.stringify(argv));
  }
});

test("grant sends the fingerprint or label, the contributor tier, LIMITS' contributor figure, the login and the note, as the service role", async () => {
  const result = { granted: true, matched_by: "fingerprint", fingerprint: FINGERPRINT, label: "octo-runner", tier: "contributor", daily_limit: LIMITS.contributor_validations_per_key_per_day, github_login: "octo-cat", granted_at: "2026-10-05T12:00:00+00:00", note: "PR #412" };
  const { code, calls, out, err } = await run(["grant", "--fingerprint", FINGERPRINT, "--github", "octo-cat", "--note", "PR #412"], () => ({ body: result }));
  assert.equal(code, 0, err);
  assert.deepEqual(calls.map((c) => c.path), ["/rest/v1/rpc/grant_key_tier"]);
  assert.deepEqual(calls[0].body, { p_tier: "contributor", p_daily_limit: LIMITS.contributor_validations_per_key_per_day, p_github_login: "octo-cat", p_key_hash: FINGERPRINT, p_label: null, p_note: "PR #412" });
  assert.equal(calls[0].headers.Authorization, `Bearer ${SERVICE_KEY}`);
  assert.deepEqual(JSON.parse(out), result);
  assert.equal(err, "");
  assert.ok(!out.includes(SERVICE_KEY) && !err.includes(SERVICE_KEY));
});

test("a grant matched by label says a label does not prove who holds the key", async () => {
  const { code, calls, err } = await run(["grant", "--label", "octo-runner", "--github", "octo-cat"], () => ({ body: { granted: true, matched_by: "label", fingerprint: FINGERPRINT, label: "octo-runner", tier: "contributor", daily_limit: LIMITS.contributor_validations_per_key_per_day } }));
  assert.equal(code, 0);
  assert.deepEqual(calls[0].body, { p_tier: "contributor", p_daily_limit: LIMITS.contributor_validations_per_key_per_day, p_github_login: "octo-cat", p_key_hash: null, p_label: "octo-runner", p_note: null });
  assert.match(err, /Matched by label/);
});

test("every refusal exits 1 with its own explanation", async () => {
  for (const reason of ["unknown_key", "ambiguous_label", "label_mismatch", "revoked_key"]) {
    const { code, err } = await run(["grant", "--label", "octo-runner", "--github", "octo-cat"], () => ({ body: { granted: false, reason } }));
    assert.equal(code, 1, reason);
    assert.equal(err, `Not granted: ${REFUSALS[reason]}`);
  }
});

test("revoke sends only the fingerprint or label; removing nothing is reported and still exits 0", async () => {
  let response = { revoked: true, matched_by: "fingerprint", fingerprint: FINGERPRINT, label: null };
  const respond = (path, body) => { assert.equal(path, "/rest/v1/rpc/revoke_key_tier"); assert.deepEqual(body, { p_key_hash: FINGERPRINT, p_label: null }); return { body: response }; };
  let outcome = await run(["revoke", "--fingerprint", FINGERPRINT], respond);
  assert.equal(outcome.code, 0);
  assert.deepEqual(JSON.parse(outcome.out), response);
  response = { revoked: false, reason: "no_tier", matched_by: "fingerprint", fingerprint: FINGERPRINT, label: null };
  outcome = await run(["revoke", "--fingerprint", FINGERPRINT], respond);
  assert.equal(outcome.code, 0);
  assert.match(outcome.err, /Nothing removed: That key had no contributor access/);
  response = { revoked: false, reason: "unknown_key", matched_by: "fingerprint", fingerprint: null, label: null };
  outcome = await run(["revoke", "--fingerprint", FINGERPRINT], respond);
  assert.equal(outcome.code, 1);
});

test("usage errors and a missing service role exit 2 before any request", async () => {
  let outcome = await run(["grant", "--fingerprint", API_KEY, "--github", "octo-cat"]);
  assert.equal(outcome.code, 2);
  assert.equal(outcome.calls.length, 0);
  assert.ok(!outcome.err.includes(API_KEY), "a pasted key is never printed");
  outcome = await run(["grant", "--fingerprint", FINGERPRINT, "--github", "octo-cat"], undefined, { SUPABASE_URL: "https://example.supabase.co" });
  assert.equal(outcome.code, 2);
  assert.equal(outcome.calls.length, 0);
  assert.match(outcome.err, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("a store refusal exits 1 with the store's reason and never the service role key", async () => {
  const { code, err, out } = await run(["grant", "--fingerprint", FINGERPRINT, "--github", "octo-cat"], () => ({ status: 404, body: { code: "PGRST202", message: "Could not find the function public.grant_key_tier" } }));
  assert.equal(code, 1);
  assert.match(err, /HTTP 404/);
  assert.match(err, /grant_key_tier/);
  assert.ok(!err.includes(SERVICE_KEY) && !out.includes(SERVICE_KEY));
});

test("run as a command, a usage error exits 2 and prints the usage, never the pasted key", () => {
  const script = fileURLToPath(new URL("./grant-contributor-access.mjs", import.meta.url));
  const child = spawnSync(process.execPath, [script, "grant", "--fingerprint", API_KEY], { encoding: "utf8", env: { PATH: process.env.PATH } });
  assert.equal(child.status, 2);
  assert.match(child.stderr, /Usage:/);
  assert.ok(!child.stderr.includes(API_KEY) && !child.stdout.includes(API_KEY));
});
