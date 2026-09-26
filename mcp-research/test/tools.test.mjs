// canli-research-mcp against a fake canlicapital.com: no test touches the network.
import assert from "node:assert/strict";
import test from "node:test";

import {
  RESEARCH_LIMITS,
  createSession,
  toolChainHead,
  toolGetPaper,
  toolListTopics,
  toolLiveRecord,
  toolSearchResearch,
  toolTrialLedger,
} from "../src/server.mjs";

const INDEX = {
  count: 3,
  topics: [{ slug: "killed-candidates", label: "Killed candidates", count: 2, blurb: "Rejected candidates." }],
  papers: [
    { slug: "alphamax-equity-momentum-lineage", title: "AlphaMax equity momentum", description: "Signal and trial lineage.", publication_year: "2026", path: "/research/alphamax-equity-momentum-lineage" },
    { slug: "crash-risk-review", title: "Crash risk review", description: "Momentum crashes in the literature.", publication_year: "2026", path: "/research/crash-risk-review" },
    { slug: "value-quality", title: "Value and quality", description: "No overlap here.", publication_year: "2025", path: "/research/value-quality" },
  ],
  archival_papers: [{ title: "Clustered Insider Purchases", path: "/publication/equity-insider-activity/v0.1.0" }],
};
const PAPER = "# Title\n\nIntro.\n\n## Method\n\nMethod text.\n\n## Claim boundary\n\nWhat it does not establish.\n";
const ENVELOPE = (data, limits) => ({ schema: "canli.api.v1", generated_at: "2026-09-26T00:00:00Z", canonical_human_page: "https://canlicapital.com/trials", limits, data });

function site(overrides = {}) {
  const files = {
    "/research-index.json": JSON.stringify(INDEX),
    "/research/alphamax-equity-momentum-lineage.md": PAPER,
    "/api/v1/trials/summary.json": JSON.stringify(ENVELOPE({ distinct_hypothesis_identities: 349, identity_budget: 400 }, ["Counts, not returns."])),
    "/api/v1/record.json": JSON.stringify({ schema: "canli.paper-evidence.v0", capital: { kind: "paper" } }),
    "/api/v1/sleeves.json": JSON.stringify(ENVELOPE({ sleeves: [] }, ["Equity figures are paper-account balances."])),
    "/api/v1/chain/head.json": JSON.stringify(ENVELOPE({ seq: 1214 }, ["The chain does not prove any figure is correct."])),
    ...overrides,
  };
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ path: new URL(url).pathname, redirect: init?.redirect });
    const body = files[new URL(url).pathname];
    return body === undefined ? new Response("not found", { status: 404 }) : new Response(body, { status: 200 });
  };
  return { session: createSession({ base: "https://canlicapital.com", fetchImpl }), calls };
}

const read = (result) => JSON.parse(result.content[0].text);

test("search ranks title matches first, finds archival publications by title, and caps the list", async () => {
  const { session } = site();
  const out = read(await toolSearchResearch(session, { query: "momentum" }));
  assert.deepEqual(out.rows.map((r) => r[0]), ["alphamax-equity-momentum-lineage", "crash-risk-review"]);
  assert.deepEqual(out.columns, ["slug", "title", "year", "url", "archival"]);
  const archival = read(await toolSearchResearch(session, { query: "insider" }));
  assert.deepEqual(archival.rows, [[null, "Clustered Insider Purchases", null, "https://canlicapital.com/publication/equity-insider-activity/v0.1.0", true]]);
  assert.equal(read(await toolSearchResearch(session, { query: "momentum", limit: 1 })).rows.length, 1);
  assert.deepEqual(out.limits, RESEARCH_LIMITS);
});

test("the index is fetched once per session; later calls read the cache", async () => {
  const { session, calls } = site();
  await toolSearchResearch(session, { query: "momentum" });
  await toolSearchResearch(session, { query: "value" });
  await toolListTopics(session);
  assert.equal(calls.filter((c) => c.path === "/research-index.json").length, 1);
  assert.ok(calls.every((c) => c.redirect === "error"));
});

test("get_paper returns the text with its headings, one section on request, and a truncation flag", async () => {
  const { session } = site();
  const whole = read(await toolGetPaper(session, { slug: "alphamax-equity-momentum-lineage" }));
  assert.deepEqual(whole.headings, ["Method", "Claim boundary"]);
  assert.equal(whole.text, PAPER);
  assert.equal(whole.truncated, false);
  const part = read(await toolGetPaper(session, { slug: "alphamax-equity-momentum-lineage", section: "claim" }));
  assert.equal(part.section, "Claim boundary");
  assert.equal(part.text, "## Claim boundary\n\nWhat it does not establish.\n");
  const short = read(await toolGetPaper(session, { slug: "alphamax-equity-momentum-lineage", max_chars: 500 }));
  assert.equal(short.truncated, false);
  const { session: big } = site({ "/research/long.md": `# Long\n\n${"x".repeat(2000)}` });
  const cut = read(await toolGetPaper(big, { slug: "long", max_chars: 500 }));
  assert.equal(cut.truncated, true);
  assert.equal(cut.text.length, 500);
  assert.equal(cut.total_chars, 2008);
});

test("get_paper refuses a path, an unknown section and a missing paper", async () => {
  const { session, calls } = site();
  await assert.rejects(toolGetPaper(session, { slug: "../api/v1/keys" }), /get_paper/);
  await assert.rejects(toolGetPaper(session, { slug: "a/b" }), /get_paper/);
  assert.equal(calls.length, 0, "an invalid slug never reaches the network");
  await assert.rejects(toolGetPaper(session, { slug: "alphamax-equity-momentum-lineage", section: "nonexistent" }), /no heading/);
  await assert.rejects(toolGetPaper(session, { slug: "no-such-paper" }), /not found/);
});

test("the ledger, the live record and the chain head carry their sources' own limits", async () => {
  const { session } = site();
  const ledger = read(await toolTrialLedger(session));
  assert.equal(ledger.data.identity_budget, 400);
  assert.deepEqual(ledger.limits, ["Counts, not returns."]);
  const live = read(await toolLiveRecord(session));
  assert.equal(live.record.capital.kind, "paper");
  assert.ok(live.limits.includes("Equity figures are paper-account balances."));
  assert.ok(live.limits.includes(RESEARCH_LIMITS[1]));
  const chain = read(await toolChainHead(session));
  assert.deepEqual(chain.limits, ["The chain does not prove any figure is correct."]);
  assert.equal(chain.verify, "https://canlicapital.com/verify");
});

test("an unreachable site is a clear error, never a stack trace", async () => {
  const session = createSession({ base: "https://canlicapital.com", fetchImpl: async () => { throw new Error("ECONNRESET secret-detail"); } });
  await assert.rejects(toolTrialLedger(session), (e) => /could not be reached/.test(e.message) && !e.message.includes("secret-detail"));
});
