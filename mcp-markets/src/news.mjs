// News about a company or a topic from the GDELT Project's index of world news (open, no key):
// the articles, newest first, with their outlet and country, and the daily average tone of the
// coverage (GDELT scores each article's wording from about -10, very negative, to +10). GDELT asks
// for no more than one request every five seconds, so the tone series waits its turn.
import { z } from "zod";

import { getJson, resolveEntity } from "./sources.mjs";

const API = "https://api.gdeltproject.org/api/v2/doc/doc";
const GAP_MS = 5500;

export const newsInput = z.object({
  query: z.string().min(2).max(200).optional().describe("Words or a \"quoted phrase\" to find, e.g. \"\\\"rate cut\\\" Fed\". With company, they narrow its news."),
  company: z.string().min(1).max(120).optional().describe("Ticker, CIK or name: its news, searched by the company's name."),
  days: z.number().int().min(1).max(90).optional().describe("How far back; default 7."),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Instead of days: the first day (GDELT's search covers about the last three months)."),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("With start: the last day (default start)."),
  limit: z.number().int().min(1).max(75).optional().describe("Most articles; default 25."),
  language: z.string().regex(/^[a-z]{3,20}$/).optional().describe("Source language, e.g. english (default) or any; others by name (german, japanese...)."),
  tone: z.boolean().optional().describe("Add the daily average tone of the coverage (one more request, about five seconds). Default true."),
}).strict();

// A company's legal name as people write it: "NVIDIA CORP" -> "NVIDIA", "Apple Inc." -> "Apple".
export function plainName(name) {
  return String(name).replace(/\s*\/[A-Z]{2,3}\/?\s*$/, "").replace(/\s*&\s*co\.?$/i, "").replace(/[,.]?\s+(inc|corp|corporation|co|company|ltd|plc|holdings|group|incorporated|lp|llc|sa|nv|ag|se)\.?$/i, "").replace(/[,.]?\s+(inc|corp|corporation|co|ltd|plc)\.?$/i, "").trim()
    .replace(/\b([A-Z])([A-Z]+)\b/g, (w) => (w.length > 4 ? w[0] + w.slice(1).toLowerCase() : w));
}

const stamp = (s) => (/^\d{8}T\d{6}Z$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z` : s);

let lastCall = 0;
async function gdelt(session, params, attempts = 2) {
  const url = `${API}?${new URLSearchParams({ ...params, format: "json" })}`;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    // Past the limit, back off further each time (GDELT counts requests per address).
    const wait = lastCall + GAP_MS * (1 + attempt) - session.now();
    if (wait > 0) await session.sleep(wait);
    lastCall = session.now();
    // GDELT often takes 15 s or more to answer a search; 25 s lets a slow answer arrive.
    try { return { url, body: await getJson(session, url, { maxBytes: 4 * 1024 * 1024, timeoutMs: 25000, retries: 0 }) }; } catch (err) {
      // Over the rate GDELT answers with a sentence instead of JSON: wait and ask again.
      if (attempt < attempts - 1 && /did not return JSON|429|could not be reached/.test(String(err.message))) continue;
      throw err;
    }
  }
  throw new Error("GDELT did not answer");
}

// GDELT's own refusal, said plainly.
function refused(err) {
  return /429/.test(String(err?.message)) ? new Error("GDELT is limiting requests from this address (HTTP 429); it allows about one every five seconds. Ask again in a minute.") : err;
}

// attempts: GDELT requests to try before giving up, each after a longer wait (GDELT counts requests
// per address and often refuses one in a burst); explain_move asks once, to stay quick.
export async function news(session, args, { attempts = 3 } = {}) {
  const a = newsInput.parse(args);
  if (!a.query && !a.company) throw new Error("news needs query or company.");
  let who = null;
  if (a.company) {
    const e = await resolveEntity(session, a.company);
    who = { cik: e.cik, name: e.name, ticker: e.ticker ?? null, searched_as: plainName(e.name ?? a.company) };
  }
  const lang = a.language ?? "english";
  const q = [who ? `"${who.searched_as}"` : null, a.query ?? null, lang === "any" ? null : `sourcelang:${lang}`].filter(Boolean).join(" ");
  if (a.end && !a.start) throw new Error("end needs start.");
  const compact = (d, t) => `${d.replace(/-/g, "")}${t}`;
  const when = a.start ? { startdatetime: compact(a.start, "000000"), enddatetime: compact(a.end ?? a.start, "235959") } : { timespan: `${a.days ?? 7}d` };
  const list = await gdelt(session, { query: q, mode: "artlist", maxrecords: String(a.limit ?? 25), ...when, sort: "datedesc" }, attempts).catch((err) => { throw refused(err); });
  const articles = (list.body.articles ?? []).map((x) => [stamp(x.seendate), x.title?.replace(/\s+([.,:;?!])/g, "$1").trim() ?? null, x.domain ?? null, x.sourcecountry ?? null, x.language ?? null, x.url]);
  const out = {
    ...(who ? { company: who } : {}), query: q, ...(a.start ? { start: a.start, end: a.end ?? a.start } : { days: a.days ?? 7 }),
    articles: { columns: ["seen", "title", "outlet", "country", "language", "url"], rows: articles },
    sources: [list.url],
  };
  if (a.tone ?? true) {
    // The articles stand on their own: a refused tone request leaves a note, not an error.
    const t = await gdelt(session, { query: q, mode: "timelinetone", ...when }, attempts).catch((err) => ({ error: String(err.message) }));
    if (t.error) { out.tone = { note: `GDELT did not return the tone series (${t.error.slice(0, 120)}); ask again in a minute.` }; return finish(out); }
    const series = t.body.timeline?.[0]?.data ?? [];
    const rows = series.map((d) => [stamp(d.date).slice(0, 10), Math.round(d.value * 1000) / 1000]);
    const mean = (xs) => (xs.length ? Math.round((xs.reduce((s, x) => s + x[1], 0) / xs.length) * 1000) / 1000 : null);
    const half = Math.floor(rows.length / 2);
    out.tone = { columns: ["date", "average_tone"], rows, mean: mean(rows), first_half: mean(rows.slice(0, half)), second_half: mean(rows.slice(half)) };
    out.sources.push(t.url);
  }
  return finish(out);
}

function finish(out) {
  out.meaning = "Articles GDELT saw in the window, newest first. average_tone is GDELT's score of the coverage's wording that day (about -10 very negative to +10 very positive; most news sits between -5 and +3): read changes in it, not its level.";
  out.limits = ["GDELT indexes what it crawls: coverage, duplicates and paywalled outlets vary, and an article's title is the outlet's.", "Tone is a word count, not a judgement of the news for the company or its stock.", "Not investment advice."];
  return out;
}
