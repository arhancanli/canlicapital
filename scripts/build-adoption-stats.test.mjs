import test from "node:test";
import assert from "node:assert/strict";
import { collect, PACKAGES, REPOSITORIES } from "./build-adoption-stats.mjs";
import { renderStats } from "./build-vision-and-stats.mjs";

const now = new Date("2026-10-06T12:00:00Z");
const ok = (body) => ({ ok: true, status: 200, json: async () => body });
function fakeFetch(url) {
  if (url.startsWith("https://registry.npmjs.org/")) return ok({ time: { created: "2026-09-26T10:00:00Z", "0.2.0": "2026-10-06T09:00:00Z" }, "dist-tags": { latest: "0.2.0" } });
  if (url.includes("/point/last-week/")) return ok({ downloads: 47 });
  if (url.includes("/point/last-month/")) return ok({ downloads: 247 });
  if (url.includes("/downloads/range/")) return ok({ downloads: [{ downloads: 200 }, { downloads: 50 }] });
  if (url.startsWith("https://api.github.com/repos/")) return ok({ stargazers_count: 3, forks_count: 1, open_issues_count: 2, pushed_at: "2026-10-06T00:00:00Z", html_url: "https://github.com/x" });
  if (url.endsWith("/validate/status")) return ok({ data: { usage: { validations_total: 48 } } });
  throw new Error(`unexpected ${url}`);
}

test("every source is read and summed from its public counter", async () => {
  const stats = await collect({ now, fetchImpl: async (url) => fakeFetch(url) });
  assert.equal(stats.npm.rows.length, PACKAGES.length);
  assert.deepEqual([stats.npm.rows[0].downloads_last_week, stats.npm.rows[0].downloads_last_month, stats.npm.rows[0].downloads_total], [47, 247, 250]);
  assert.equal(stats.github.rows.length, REPOSITORIES.length);
  assert.equal(stats.hosted_api.rows.validations_total, 48);
  assert.ok(!stats.npm.stale && !stats.github.stale && !stats.hosted_api.stale);
});

test("an unreachable source keeps its last values, marked stale, and never becomes zero", async () => {
  const previous = await collect({ now, fetchImpl: async (url) => fakeFetch(url) });
  const stats = await collect({ now: new Date("2026-10-07T12:00:00Z"), previous,
    fetchImpl: async (url) => (url.includes("npmjs") ? { ok: false, status: 503, json: async () => ({}) } : fakeFetch(url)) });
  assert.equal(stats.npm.stale, true);
  assert.deepEqual(stats.npm.rows, previous.npm.rows);
  assert.equal(stats.npm.fetched_at, previous.npm.fetched_at);
  assert.equal(stats.github.stale, false);
  assert.match(renderStats(stats), /the last successful read; npm was unreachable/);
});

test("with no previous values a failed source says so instead of inventing numbers", async () => {
  const stats = await collect({ now, fetchImpl: async () => { throw new Error("offline"); } });
  assert.equal(stats.npm.rows, null);
  assert.match(renderStats(stats), /npm could not be read for this build/);
});

test("a package too new for npm's download counter is listed with its version and no counts, never zeros", async () => {
  const young = (url) => url.startsWith("https://registry.npmjs.org/")
    ? ok({ time: { created: "2026-10-04T10:00:00Z", "0.1.0": "2026-10-04T10:00:00Z" }, "dist-tags": { latest: "0.1.0" } })
    : url.startsWith("https://api.npmjs.org/") ? { ok: false, status: 404, json: async () => ({ error: "package not found" }) } : fakeFetch(url);
  const stats = await collect({ now, fetchImpl: async (url) => young(url) });
  assert.equal(stats.npm.stale, false);
  assert.deepEqual([stats.npm.rows[0].latest_version, stats.npm.rows[0].downloads_last_month, stats.npm.rows[0].downloads_total], ["0.1.0", null, null]);
  assert.match(renderStats(stats), /npm has not started counting yet/);
  // a package older than a week whose counts fail is a real failure: the section keeps its last values
  const old = await collect({ now: new Date("2026-10-20T12:00:00Z"), fetchImpl: async (url) => young(url) });
  assert.equal(old.npm.stale, true);
});
