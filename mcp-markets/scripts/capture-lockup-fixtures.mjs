// Captures what lockup_calendar reads (node scripts/capture-lockup-fixtures.mjs): the filing lists, EDGAR full-text
// searches and final prospectuses of the companies and the window the tests use, once against EDGAR with the tests'
// clock (test/replay.mjs's NOW). Every response goes into test/fixtures/manifest.json as l###.gz under the exact URL
// asked for. A prospectus runs to several megabytes, so each filing document is kept as the text the tool reads: the
// cover (its first 21,000 characters) and the blocks around every lock-up passage, period, release schedule and
// waiver, one line of text to a <div>. The calls are then replayed from the fixtures alone and must answer exactly as
// they did from the whole documents. Responses already captured are not fetched again, except documents, which the
// capture reads whole.
import { isDeepStrictEqual } from "node:util";
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";

import { htmlToText } from "../src/html.mjs";
import { lockupCalendar } from "../src/lockups.mjs";
import { createSession, PLAIN_USER_AGENT } from "../src/sources.mjs";
import { NOW } from "../test/replay.mjs";

const DIR = new URL("../test/fixtures/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", DIR), "utf8"));
let n = Math.max(0, ...Object.values(manifest).map((f) => Number(/^l(\d+)/.exec(f)?.[1] ?? 0)));

const KEEP = /lock[- ]?up|locked[- ]up|stand[- ]?off|restricted period|Date Available|Earliest Date|Date of Availability|blackout|waive|released|(?:release|announcement)\s+of\s+(?:our\s+|its\s+)?(?:[\w-]+\s+){0,5}?(?:earnings|results)|earnings (?:release|announcement)|closing (?:sale )?price|prior written consent|\b(?:days?|months?|years?)\s+(?:after|from|following)\s+(?:the\s+)?(?:date of|closing|completion|consummation|pricing|first|commencement|listing|effective)/i;
const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export function kept(html) {
  const blocks = String(html).split(/(?<=<\/(?:p|div|tr|table|li|h[1-6])>)/i);
  const texts = blocks.map((b) => htmlToText(b));
  const keep = new Uint8Array(blocks.length);
  let chars = 0;
  for (let i = 0; i < blocks.length && chars < 21000; i += 1) { keep[i] = 1; chars += texts[i].length + 1; }
  texts.forEach((t, i) => {
    if (KEEP.test(t)) for (let j = Math.max(0, i - 4); j <= Math.min(blocks.length - 1, i + 4); j += 1) keep[j] = 1;
    if (/Date Available for|Earliest Date|Date of Availability/i.test(t)) for (let j = i; j <= Math.min(blocks.length - 1, i + 160); j += 1) keep[j] = 1;
  });
  const lines = texts.filter((t, i) => keep[i] && t).flatMap((t) => t.split("\n"));
  return `<html><body>\n${lines.map((l) => `<div>${escape(l)}</div>`).join("\n")}\n</body></html>\n`;
}
const isDocument = (url) => /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/\d+\/\d{18}\/[^/]+\.htm$/i.test(url) && !/-index\.htm$/i.test(url);

const stored = (url) => gunzipSync(readFileSync(new URL(manifest[url], DIR))).toString("utf8");
async function recording(url, init = {}) {
  if (manifest[url] && !isDocument(url)) return new Response(stored(url), { status: 200 });
  await new Promise((r) => setTimeout(r, 300));
  const res = await fetch(url, { ...init, headers: { "User-Agent": PLAIN_USER_AGENT, ...(init.headers ?? {}) } });
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (res.ok && !manifest[url]) {
    const file = `l${String(++n).padStart(3, "0")}.gz`;
    writeFileSync(new URL(file, DIR), gzipSync(isDocument(url) ? Buffer.from(kept(Buffer.from(bytes).toString("utf8"))) : bytes, { level: 9 }));
    manifest[url] = file;
  }
  // The capture itself reads the whole document.
  return new Response(bytes, { status: res.status });
}
const replaying = async (url) => (manifest[url] ? new Response(stored(url), { status: 200 }) : new Response(`not captured: ${url}`, { status: 404 }));

const calls = [
  { company: "2021728" },
  { company: "1853868" },
  { company: "2077709" },
  { company: "2088896" },
  { days: 5, limit: 10 },
];
// The clock stands still at NOW, so the session's own SEC spacing would add up; recording() spaces live requests.
const live = createSession({ fetchImpl: recording, now: () => NOW, env: {}, sleep: async () => {} });
const answers = [];
for (const args of calls) {
  try { const r = await lockupCalendar(live, args); answers.push(r); console.log(JSON.stringify(args), r.reading.slice(0, 220)); } catch (err) { answers.push(err.message); console.log(JSON.stringify(args), err.message.slice(0, 160)); }
}
writeFileSync(new URL("manifest.json", DIR), `${JSON.stringify(manifest, null, 1)}\n`);
console.log(`manifest: ${Object.keys(manifest).length} responses`);
const again = createSession({ fetchImpl: replaying, now: () => NOW, env: {}, sleep: async () => {} });
let same = true;
for (const [i, args] of calls.entries()) {
  let r;
  try { r = await lockupCalendar(again, args); } catch (err) { r = err.message; }
  if (!isDeepStrictEqual(r, answers[i])) { same = false; console.log("DIFFERS from the whole documents:", JSON.stringify(args), JSON.stringify(r).slice(0, 400)); }
}
console.log(same ? "replayed from the kept text: every answer is the same" : "some answers differ");
process.exitCode = same ? 0 : 1;
