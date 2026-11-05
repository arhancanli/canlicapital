// fed_speeches: what the Federal Reserve Board says, from its own feeds: the latest speeches and testimony by its
// members and its monetary policy releases, with speaker, title, date, venue and link; one member's; or one speech
// read, its paragraphs on monetary policy (inflation, the policy rate, the labor market, the balance sheet) quoted as
// given (the Board's speeches are works of the US government). No key.
import { z } from "zod";

import { decodeEntities } from "./html.mjs";
import { getText, NotFound } from "./sources.mjs";

const FED = "https://www.federalreserve.gov";
const FEEDS = { speech: `${FED}/feeds/speeches.xml`, testimony: `${FED}/feeds/testimony.xml`, policy: `${FED}/feeds/press_monetary.xml` };
const POLICY = /\b(inflation|price stability|policy rate|federal funds|interest rates?|labor market|employment|unemployment|rate (?:cut|cuts|hike|hikes|increase|increases|reduction)s?|tighten\w*|eas(?:e|ing)|neutral|balance sheet|tariffs?|outlook|FOMC)\b/i;

export const speechesInput = z.object({
  speaker: z.string().min(2).max(40).optional().describe("A Board member by surname (Powell, Waller, Bowman...): that member's speeches and testimony."),
  kind: z.enum(["speech", "testimony", "policy"]).optional().describe("speech, testimony or policy (the FOMC's statements, minutes and other monetary policy releases); default all three."),
  limit: z.number().int().min(1).max(45).optional().describe("Most items listed, newest first; default 15."),
  read: z.string().url().max(300).optional().describe("A speech or testimony page on federalreserve.gov (a link from the list): its paragraphs on monetary policy, quoted."),
}).strict();

// The feeds escape their entities twice ("T&amp;uuml;rkiye"), so text is decoded twice.
const text = (html) => decodeEntities(decodeEntities(String(html ?? "").replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, " "))).replace(/\s+/g, " ").trim();

// A feed's items: title, link, date (UTC), description (the venue for a speech), and the speaker the title begins with.
export function feedItems(xml, kind) {
  return [...String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, it]) => {
    const get = (k) => text(new RegExp(`<${k}>([\\s\\S]*?)</${k}>`).exec(it)?.[1]);
    const title = get("title"), date = Date.parse(get("pubDate"));
    const speaker = kind === "policy" ? null : /^([A-Z][A-Za-z.'-]+(?: [A-Z][A-Za-z.'-]+)?),\s/.exec(title)?.[1] ?? null;
    const about = get("description").replace(/^(Speech|Testimony)\s+/, "");
    return { kind, date: Number.isFinite(date) ? new Date(date).toISOString().slice(0, 10) : null, speaker, title: speaker ? title.slice(speaker.length + 1).trim() : title, venue: about && about !== title ? about : null, link: get("link") };
  });
}

// A speech's page: its header (date, speaker, venue) and its paragraphs.
export function speechPage(html) {
  const article = /<div[^>]*id="article"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/.exec(html)?.[1] ?? "";
  const paragraphs = [...article.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => text(m[1])).filter(Boolean);
  const title = text(/<h3[^>]*class="title"[^>]*>([\s\S]*?)<\/h3>/.exec(html)?.[1] ?? /<title>([\s\S]*?)<\/title>/.exec(html)?.[1]);
  return { title, paragraphs };
}

export async function fedSpeeches(session, args) {
  const a = speechesInput.parse(args);
  if (a.read) {
    const url = new URL(a.read);
    if (url.hostname !== "www.federalreserve.gov" || !/^\/newsevents\/(speech|testimony)\//.test(url.pathname)) throw new NotFound("read takes a speech or testimony page on www.federalreserve.gov, a link from this tool's list.");
    const page = speechPage(await getText(session, url.href, { maxBytes: 4 * 1024 * 1024 }));
    if (!page.paragraphs.length) throw new NotFound(`${url.href} held no speech text.`);
    const [date, speaker, venue, ...body] = page.paragraphs;
    const policy = body.filter((p) => POLICY.test(p) && p.length > 80 && !/^\d+\.\s/.test(p));
    return {
      title: page.title, date, speaker, venue, paragraphs: body.length, policy_paragraphs: policy.length,
      columns: ["passage"], rows: policy.slice(0, 12).map((p) => [p.length > 900 ? `${p.slice(0, 897)}...` : p]),
      reading: "The speech's paragraphs on monetary policy and the economy, quoted as given, in order; footnotes and the rest of the speech are at the link.",
      source: url.href,
      limits: ["A member speaks for themself, not for the Committee, unless the speech says otherwise.", "Not investment advice."],
    };
  }
  const kinds = a.kind ? [a.kind] : Object.keys(FEEDS);
  const lists = await Promise.allSettled(kinds.map((k) => getText(session, FEEDS[k]).then((x) => feedItems(x, k))));
  let items = lists.flatMap((l) => (l.status === "fulfilled" ? l.value : [])).sort((x, y) => String(y.date).localeCompare(String(x.date)));
  if (!items.length) throw new NotFound("The Federal Reserve's feeds answered with no items.");
  if (a.speaker) {
    const who = a.speaker.trim().toLowerCase();
    items = items.filter((i) => i.speaker && i.speaker.toLowerCase().split(/\s+/).includes(who.split(/\s+/).at(-1)));
    if (!items.length) throw new NotFound(`No recent speech or testimony by ${a.speaker} in the Federal Reserve's feeds (they hold the latest fifteen of each).`);
  }
  const shown = items.slice(0, a.limit ?? 15);
  const latest = shown[0];
  return {
    summary: [`The latest from the Federal Reserve Board: ${latest.speaker ? `${latest.speaker}, ` : ""}"${latest.title}" (${latest.kind}, ${latest.date}).`],
    columns: ["date", "kind", "speaker", "title", "venue", "link"], rows: shown.map((i) => [i.date, i.kind, i.speaker, i.title, i.venue, i.link]),
    reading: "The Board's latest speeches, testimony and monetary policy releases, newest first; read a speech with read: <link> for its passages on policy.",
    source: kinds.map((k) => FEEDS[k]).join(", "),
    limits: [
      ...lists.flatMap((l, i) => (l.status === "rejected" ? [`The ${kinds[i]} feed could not be read (${l.reason?.message}).`] : [])),
      "The feeds hold the Board's members and releases only, not the regional Federal Reserve Bank presidents, and the latest fifteen of each.",
      "Not investment advice.",
    ],
  };
}

// central_bank_speeches: the latest speeches by central bankers everywhere, from the BIS's collection (its feed of
// the latest fifty): speaker, role and bank, title, date and link; one bank's or one speaker's; or one speech read, a few
// of its passages on policy quoted briefly with the source, as the BIS allows.
const BIS_FEED = "https://www.bis.org/doclist/cbspeeches.rss";
const BANKS = { ecb: "European Central Bank", boe: "Bank of England", boj: "Bank of Japan", fed: "Federal Reserve", "federal reserve": "Federal Reserve", rba: "Reserve Bank of Australia", boc: "Bank of Canada", snb: "Swiss National Bank", rbi: "Reserve Bank of India", pboc: "People's Bank of China", bundesbank: "Deutsche Bundesbank", "banque de france": "Bank of France", riksbank: "Sveriges Riksbank", "norges bank": "Norges Bank", rbnz: "Reserve Bank of New Zealand" };

export const cbSpeechesInput = z.object({
  bank: z.string().min(2).max(60).optional().describe("A central bank by name or short name (ECB, Bank of England, Bundesbank, BoJ, RBA...): its speakers' speeches."),
  speaker: z.string().min(2).max(40).optional().describe("A speaker by surname (Lagarde, Bailey, Nagel...)."),
  limit: z.number().int().min(1).max(50).optional().describe("Most speeches listed, newest first; default 15."),
  read: z.string().url().max(300).optional().describe("A speech page on bis.org (a link from the list): its paragraphs on monetary policy, quoted."),
}).strict();

// A BIS item's description: "Speech by Dr Joachim Nagel, President of the Deutsche Bundesbank, at the ...".
export function bisSpeaker(description) {
  const m = /^(.*?)\bby (?:(?:Mr|Ms|Mrs|Miss|Dr|Prof|Professor|Sir|Dame|Lord|Lady)\.?\s+)*([^,]+?),\s+(.+?)(?:,\s+(?:at|on|in|before|to|for|during|via)\b|\.\s*$|$)/.exec(String(description ?? ""));
  return m ? { form: m[1].trim() || null, speaker: m[2].trim(), role: m[3].trim().replace(/[.,]$/, "") } : { form: null, speaker: null, role: null };
}

export function bisItems(xml) {
  return [...String(xml).matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)].map(([, it]) => {
    const get = (k) => text(new RegExp(`<${k}[^>]*>([\\s\\S]*?)</${k}>`).exec(it)?.[1]);
    const description = get("description"), who = bisSpeaker(description);
    return { date: (get("dc:date") || get("cb:occurrenceDate")).slice(0, 10) || null, speaker: who.speaker, role: who.role, title: get("title"), link: get("link") };
  });
}

export async function centralBankSpeeches(session, args) {
  const a = cbSpeechesInput.parse(args);
  if (a.read) {
    const url = new URL(a.read);
    if (url.hostname !== "www.bis.org" || !/^\/speeches\//.test(url.pathname)) throw new NotFound("read takes a speech page on www.bis.org, a link from this tool's list.");
    const html = await getText(session, url.href, { maxBytes: 4 * 1024 * 1024 });
    const meta = (name) => text(new RegExp(`<meta name="${name}" content="([^"]*)"`).exec(html)?.[1]);
    const body = /<div class="text__component">([\s\S]*?)<\/div>/.exec(html)?.[1] ?? "";
    const paragraphs = [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => text(m[1])).filter(Boolean);
    if (!paragraphs.length) throw new NotFound(`${url.href} held no speech text on the page (the BIS gives some as a PDF only).`);
    const policy = paragraphs.filter((p) => POLICY.test(p) && p.length > 80);
    return {
      title: meta("citation_title") || null, speaker: meta("citation_author") || null, about: meta("description") || null,
      paragraphs: paragraphs.length, policy_paragraphs: policy.length,
      columns: ["passage"], rows: policy.slice(0, 5).map((p) => [p.length > 400 ? `${p.slice(0, 397)}...` : p]),
      reading: "Brief excerpts of the speech's passages on monetary policy and the economy, in order, as the BIS allows with the source stated; the speech is at the link.",
      source: url.href,
      limits: ["A speaker speaks for themself unless the speech says otherwise; the BIS collects the speeches, the central banks publish them.", "Not investment advice."],
    };
  }
  let items = bisItems(await getText(session, BIS_FEED)).sort((x, y) => String(y.date).localeCompare(String(x.date)));
  if (!items.length) throw new NotFound("The BIS's feed of central bankers' speeches answered with no items.");
  if (a.bank) {
    const want = (BANKS[a.bank.trim().toLowerCase()] ?? a.bank).toLowerCase();
    items = items.filter((i) => (i.role ?? "").toLowerCase().includes(want));
  }
  if (a.speaker) items = items.filter((i) => (i.speaker ?? "").toLowerCase().split(/\s+/).includes(a.speaker.trim().toLowerCase().split(/\s+/).at(-1)));
  if (!items.length) throw new NotFound(`None of the BIS's latest fifty speeches is by ${[a.speaker, a.bank].filter(Boolean).join(" of ")}.`);
  const shown = items.slice(0, a.limit ?? 15);
  return {
    summary: [`The latest central bank speech the BIS lists: ${shown[0].speaker ?? "a speaker"}${shown[0].role ? ` (${shown[0].role})` : ""}, "${shown[0].title}" (${shown[0].date}).`],
    columns: ["date", "speaker", "role", "title", "link"], rows: shown.map((i) => [i.date, i.speaker, i.role, i.title, i.link]),
    reading: "Central bankers' speeches as the BIS collects them, newest first; read one with read: <link>.",
    source: BIS_FEED,
    limits: ["The BIS's feed holds the latest fifty speeches from central banks everywhere; a bank's own site has more.", "Not investment advice."],
  };
}
