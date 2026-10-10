import test from "node:test";
import assert from "node:assert/strict";
import { crawlerFamily } from "./crawler-family.js";
import { createCompanyReferenceHandler } from "./company-release.js";

test("a User-Agent is named by its broad family", () => {
  const cases = {
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)": "google",
    "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)": "bing",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)": "openai",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)": "anthropic",
    "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)": "seo-tool",
    "Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)": "seo-tool",
    "Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)": "bytedance",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15": "browser",
    "python-requests/2.32.3": "other-bot",
    "": "none",
  };
  for (const [ua, family] of Object.entries(cases)) assert.equal(crawlerFamily(ua), family, ua);
  assert.equal(crawlerFamily(undefined), "none");
});

test("a sampled company request logs its client family, page kind and storage reads, never the User-Agent itself", async () => {
  const lines = [];
  const stats = { objectReads: 0, cacheHits: 0 };
  const release = { catalog: { stats: () => ({ ...stats }) }, company: async (_req, res) => { stats.objectReads += 1; stats.cacheHits += 2; res.statusCode = 200; res.end("ok"); } };
  const handler = createCompanyReferenceHandler({ loadRelease: async () => release, log: (line) => lines.push(line), sample: () => true });
  const res = { statusCode: 0, headers: {}, headersSent: false, setHeader(k, v) { this.headers[k] = v; }, end() { this.ended = true; } };
  const ua = "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)";
  await handler({ method: "GET", query: { path: "/companies/0000320193/Revenues" }, headers: { "user-agent": ua } }, res);
  assert.equal(lines.length, 1);
  const line = JSON.parse(lines[0]);
  assert.deepEqual({ ...line, ms: undefined }, { canli_crawl: 1, agent: "seo-tool", kind: "concept", status: 200, reads: 1, hits: 2, ms: undefined });
  assert.ok(!lines[0].includes(ua) && !/ahrefs|mozilla/i.test(lines[0]), "the User-Agent string is not logged");
  const quiet = createCompanyReferenceHandler({ loadRelease: async () => release, log: (line) => lines.push(line), sample: () => false });
  await quiet({ method: "GET", query: { path: "/companies/0000320193" }, headers: {} }, { ...res, setHeader() {}, end() {} });
  assert.equal(lines.length, 1, "an unsampled request logs nothing");
});
