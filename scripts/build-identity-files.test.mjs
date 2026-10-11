import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { identityFiles, securityExpiry } from "./build-identity-files.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const answers = JSON.parse(readFileSync(resolve(ROOT, "config", "home-answers.json"), "utf8"));
const files = identityFiles(answers);
const read = (path) => readFileSync(resolve(ROOT, path), "utf8");

test("the committed identity files are what the generator writes", () => {
  for (const [path, body] of Object.entries(files)) {
    assert.equal(read(path), body, `run node scripts/build-identity-files.mjs and commit ${path}`);
  }
});

test("every identity file describes Canli Capital the way the homepage does, and says it manages no money", () => {
  for (const [path, body] of Object.entries(files)) {
    if (path.endsWith("security.txt")) continue;
    assert.ok(body.includes(answers.definition), `${path} carries the homepage definition`);
    assert.match(body, /manages no money/, `${path} states the boundary`);
    assert.doesNotMatch(body, /\bquant fund\b|hedge fund/i, `${path} never calls the project a fund`);
  }
});

test("ai.json and identity.json carry the fields their schemas require", () => {
  const ai = JSON.parse(files["public/ai.json"]);
  for (const key of ["$schema", "name", "url", "permissions", "restrictions"]) assert.ok(ai[key], `ai.json ${key}`);
  assert.ok(ai.permissions.length > 0 && ai.permissions.every((p) => p.action));
  assert.ok(ai.restrictions.length > 0 && ai.restrictions.every((r) => r.action && ["must-not", "should-not"].includes(r.severity)));
  assert.match(ai.metadata.version, /^\d+\.\d+\.\d+$/);
  const identity = JSON.parse(files["public/identity.json"]);
  for (const key of ["$schema", "name", "url", "type", "description"]) assert.ok(identity[key], `identity.json ${key}`);
  assert.match(identity.foundingDate, /^\d{4}(-\d{2}-\d{2})?$/);
  assert.match(identity.location.addressCountry, /^[A-Z]{2}$/);
  assert.ok(identity.sameAs.every((url) => url.startsWith("https://")));
});

test("security.txt names a contact and has not expired (fails 30 days ahead: review it and move answers.reviewed)", () => {
  const body = files["public/.well-known/security.txt"];
  assert.match(body, /^Contact: https:\/\/github\.com\/arhancanli\/canlicapital\/security\/advisories\/new$/m);
  const expires = new Date(body.match(/^Expires: (.+)$/m)[1]);
  assert.equal(expires.toISOString(), securityExpiry(answers.reviewed).toISOString());
  const daysLeft = (expires - Date.now()) / 86_400_000;
  assert.ok(daysLeft > 30, `security.txt expires in ${Math.floor(daysLeft)} days`);
  assert.ok(daysLeft < 366, "RFC 9116: an expiry under a year away");
});

// The answer engines' crawlers, and the fetchers that open a page when a person asks an assistant
// to. INITE's AI-visibility check weighs exactly these seven and gives a path-scoped allow 70% of a
// full one, so each gets its own group with nothing disallowed. Googlebot and the rest keep the
// /company-data/ fence through the * group.
const RETRIEVAL_AGENTS = ["Bingbot", "OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "Perplexity-User", "Claude-SearchBot", "Claude-User"];

function robotsGroups(body) {
  const groups = [];
  let current = null;
  for (const raw of body.split("\n")) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const [field, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    if (/^user-agent$/i.test(field)) {
      if (!current || current.rules.length) groups.push((current = { agents: [], rules: [] }));
      current.agents.push(value.toLowerCase());
    } else if (/^(allow|disallow)$/i.test(field) && current) {
      current.rules.push({ type: field.toLowerCase(), path: value });
    }
  }
  return groups;
}

test("robots.txt lets the seven retrieval crawlers read everything and keeps /company-data/ fenced for the rest", () => {
  const groups = robotsGroups(read("public/robots.txt"));
  for (const agent of RETRIEVAL_AGENTS) {
    const own = groups.filter((g) => g.agents.includes(agent.toLowerCase()));
    assert.equal(own.length, 1, `${agent} has exactly one group of its own`);
    assert.deepEqual(own[0].rules, [{ type: "allow", path: "/" }], `${agent} is allowed everywhere`);
  }
  const star = groups.find((g) => g.agents.includes("*"));
  assert.ok(star.rules.some((r) => r.type === "disallow" && r.path === "/company-data/"));
  assert.match(read("public/robots.txt"), /^Sitemap: https:\/\/canlicapital\.com\/sitemap\.xml$/m);
});

test("search-marketing crawlers are kept off the company catalogue only; search engines and answer engines are not in that group", () => {
  const groups = robotsGroups(read("public/robots.txt"));
  const seo = groups.find((g) => g.agents.includes("ahrefsbot"));
  assert.ok(seo, "the search-marketing group exists");
  for (const agent of ["semrushbot", "mj12bot", "dotbot", "dataforseobot"]) assert.ok(seo.agents.includes(agent), agent);
  assert.deepEqual(seo.rules, [{ type: "disallow", path: "/companies/" }, { type: "disallow", path: "/company-data/" }]);
  for (const agent of ["*", "googlebot", ...RETRIEVAL_AGENTS.map((a) => a.toLowerCase())]) assert.ok(!seo.agents.includes(agent), `${agent} is not fenced off`);
});
