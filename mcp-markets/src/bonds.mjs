// bond_offerings: the bonds a company sold, tranche by tranche, from the SEC filings that priced them. The final
// term sheets (free writing prospectuses under Rule 433) give each tranche's amount, coupon, maturity, price,
// yield, spread over the benchmark Treasury or mid-swaps, and CUSIP; the fee tables filed in XBRL with final
// prospectus supplements (424B2 and 424B5, required since 2024 and 2025) confirm amounts and prices and catch
// deals priced with no term sheet. Every fixed-rate dollar tranche's yield is recomputed from its price, and
// its spread from the benchmark's yield, so a misread figure shows.
import { z } from "zod";

import { decodeEntities, htmlToText } from "./html.mjs";
import { getJson, getText, NotFound, resolveEntity } from "./sources.mjs";

const EFTS = "https://efts.sec.gov/LATEST/search-index";
const ARCHIVES = "https://www.sec.gov/Archives/edgar/data";

export const bondsInput = z.object({
  company: z.string().min(1).max(120).describe("Ticker, CIK or name. A financing arm files under its own name: pass Ford Motor Credit or Toyota Motor Credit, not the parent."),
  years: z.number().int().min(1).max(25).optional().describe("How far back to look; default 5."),
  deals: z.number().int().min(1).max(30).optional().describe("The most recent term sheets to read, newest first; default 10."),
}).strict();

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const iso = (y, mo, d) => (mo >= 1 && mo <= 12 && d >= 1 && d <= 31 ? `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null);
const round = (x, d) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);
const dayDiff = (a, b) => (Date.parse(a) - Date.parse(b)) / 86400000;

// "May 12, 2028", "12 May 2028", "2028-05-12" or "5/12/2028" as an ISO date; null when there is none.
export function isoDate(s) {
  const t = String(s ?? "");
  let m = /\b((?:19|20)\d\d)-(\d\d)-(\d\d)\b/.exec(t);
  if (m) return iso(m[1], Number(m[2]), Number(m[3]));
  m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+((?:19|20)\d\d)\b/i.exec(t);
  if (m) return iso(m[3], MONTHS[m[1].toLowerCase()], Number(m[2]));
  m = /\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?,?\s+((?:19|20)\d\d)\b/i.exec(t);
  if (m) return iso(m[3], MONTHS[m[2].toLowerCase()], Number(m[1]));
  m = /\b(\d{1,2})\/(\d{1,2})\/((?:19|20)\d\d)\b/.exec(t);
  return m ? iso(m[3], Number(m[1]), Number(m[2])) : null;
}

const pct = (s) => { const m = /(-?\d{1,3}(?:\.\d+)?)\s*%/.exec(String(s ?? "")); return m ? Number(m[1]) : null; };

const SYMBOLS = [["US$", "USD"], ["C$", "CAD"], ["A$", "AUD"], ["$", "USD"], ["€", "EUR"], ["£", "GBP"], ["¥", "JPY"]];
// An amount and its currency: "$1,500,000,000", "€750,000,000", "$750 million", "CHF 300,000,000".
export function money(s) {
  const t = String(s ?? "");
  const m = /(US\$|C\$|A\$|\$|€|£|¥|\b(?:USD|EUR|GBP|JPY|CHF|CAD|AUD)\b)\s*(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s*(billion|million|bn|mm)\b)?/i.exec(t);
  if (!m) return null;
  const scale = { billion: 1e9, bn: 1e9, million: 1e6, mm: 1e6 }[String(m[3] ?? "").toLowerCase()] ?? 1;
  const currency = SYMBOLS.find(([sym]) => sym === m[1])?.[1] ?? m[1].toUpperCase();
  const amount = Number(m[2].replace(/,/g, "")) * scale;
  return amount >= 1e5 ? { amount, currency } : null;
}

// A spread in basis points: "+60 basis points", "T + 40 bps", "25 bps", "0.25%".
export function spreadBp(s) {
  const t = String(s ?? "");
  let m = /([+-]?\s*\d+(?:\.\d+)?)\s*(?:bps?|basis points?)\b/i.exec(t);
  if (m) return Number(m[1].replace(/\s/g, ""));
  m = /\+\s*(\d+(?:\.\d+)?)\s*%/.exec(t) ?? /^\s*(\d\.\d+)\s*%/.exec(t);
  return m ? round(Number(m[1]) * 100, 2) : null;
}

// Term sheet labels, matched on the label cell lowercased, without its colon, asterisks or brackets ("(T+2)",
// "(Semi-Annual)"). Mid-swaps and floating-rate labels come first: they also hold "spread" and "yield".
const FIELDS = [
  ["swap_spread", /^(re-?offer |issue )?spread (to|over) (the )?mid-?swaps?( rate)?$/],
  ["swap_yield", /^mid-?swaps?( rate| yield)?$|^(re-?offer )?mid-?swaps? (yield|rate)$/],
  ["floating_spread", /^(re-?offer |issue )?spread (to|over) (the )?(index|base rate|compounded sofr|sofr|benchmark rate|floating rate index)$|^floating rate (spread|margin)$|^margin$/],
  ["floating_index", /^((floating rate )?index|base rate|interest rate basis|reference rate|benchmark rate)$/],
  ["benchmark_yield", /^(?:benchmark|reference|treasury benchmark)(?: [a-z/&]+){0,6}[ /]yield$/],
  ["spread", /^(re-?offer |issue )?spread( (to|over|vs\.?|versus) (the )?(benchmark( [a-z]+){0,3}|treasury|treasuries|ust|gilt|bund|government bond))?$|^treasury spread$/],
  ["benchmark", /^(benchmark|reference|treasury benchmark)( (treasury|security|bund|gilt|bond|government|of|canada|note|obligation))*$/],
  ["yield", /^(re-?offer |issue )?yield( to (maturity|par call|call|first call date|first par call date))?$/],
  ["title", /^(title( of (the )?(securities|notes|series|issue))?|securit(y|ies)( offered)?|description of (the )?(notes|securities)|notes( offered)?|series|issue)$/],
  ["principal", /^((aggregate )?principal amount( offered| of notes)?|size|(issue|offering|deal|tranche|reopening) (size|amount)|amount( offered)?|face amount)$/],
  ["maturity", /^((stated |final )?maturity( date)?)$/],
  ["coupon", /^(coupon( rate)?|interest rate|(initial )?fixed( rate)? coupon|annual interest rate|interest rate during (the )?(initial )?fixed rate period|initial interest rate)$/],
  ["reset_coupon", /^(subsequent fixed rate coupon|reset (coupon|rate)|interest rate (after|from) (the )?(first )?reset date)$/],
  ["floating", /^(floating rate coupon|interest rate during (the )?floating rate period|floating rate)$/],
  ["price", /^(price to (the )?public|public offering price|(issue|offering|re-?offer) price|price to investors)$/],
  ["trade_date", /^(trade|pricing) date$/],
  ["settlement", /^((expected )?settlement( date)?|original issue date|issue date|closing date)$/],
  ["cusip", /^cusip( number| no\.?)?s?( ?\/ ?(isin|common code)s?)*( numbers?)?$/],
  ["isin", /^(common codes? ?\/ ?)?isins?( numbers?)?( ?\/ ?common codes?)?$/],
  ["ratings", /^(expected |anticipated |long-term debt |credit |issue )?ratings?$/],
  ["currency", /^currency$/],
  ["issuer", /^issuer$/],
];
const DEAL_LEVEL = new Set(["trade_date", "settlement", "ratings", "currency", "issuer"]);
const fieldOf = (label) => {
  const l = String(label ?? "").toLowerCase().replace(/\([^)]*\)/g, " ").replace(/[*:†‡]/g, " ").replace(/\s+/g, " ").trim();
  return l.length <= 70 ? FIELDS.find(([, re]) => re.test(l))?.[0] ?? null : null;
};

const TITLE_RE = /\b(?:notes|bonds|debentures)\b[^.;]{0,40}?\bdue\s+(?:[a-z]+\.?\s+\d{1,2},?\s+)?(?:19|20)\d\d\b/i;
// Every title in a cell, with its short name in brackets, however the printer broke the lines:
// "4.600% Notes due 2029 (the "2029 Notes") 4.800% Notes due 2031 (the "2031 Notes") ...".
const TITLES = /(?:\d{1,2}(?:\.\d{1,4})?\s?%|fixed[- ]to[- ]floating[- ]rate|floating[- ]rate|fixed[- ]rate)[^()%]{0,60}?\b(?:notes|bonds|debentures)\b[^()%]{0,30}?\bdue\s+(?:[a-z]+\.?\s+\d{1,2},?\s+)?(?:19|20)\d\d\b(?:\s*\((?:the\s+)?["“'‘][^)]{1,160}\)?)?/gi;
const titlesIn = (text) => { const s = String(text).replace(/\s+/g, " "); const all = s.match(TITLES) ?? []; return all.length ? all : TITLE_RE.test(s) ? [s] : []; };
// Fixed-to-fixed notes reset their coupon (junior subordinated, hybrids): their yield runs to the first reset.
const kindOf = (t) => (/fixed[- ]to[- ]floating/i.test(t) ? "fixed-to-floating" : /floating/i.test(t) ? "floating" : /fixed[- ]to[- ]fixed|\breset\b/i.test(t) ? "fixed-reset" : "fixed");
const yearOf = (t) => { const all = String(t).match(/\b(?:19|20)\d\d\b/g); return all ? all.at(-1) : null; };

// A document's rows in order: each table row as its cells (empty spacer cells dropped, a cell's own lines kept),
// and text outside tables as one-cell rows.
export function termRows(html) {
  const rows = [];
  const loose = (s) => { for (const l of htmlToText(s).split("\n")) if (l.trim()) rows.push({ cells: [l.trim()], blankFirst: false }); };
  let last = 0;
  for (const t of html.matchAll(/<table\b[\s\S]*?<\/table>/gi)) {
    loose(html.slice(last, t.index));
    for (const r of t[0].matchAll(/<tr\b[\s\S]*?<\/tr>/gi)) {
      const raw = [...r[0].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => htmlToText(c[1]).replace(/ \| /g, " ").trim());
      // Printers set "$" and "%" in cells of their own.
      const cells = [];
      for (const c of raw) {
        if (!c) continue;
        if (/^[%)]$/.test(c) && cells.length) cells[cells.length - 1] += c;
        else if (cells.length && /^(US\$|C\$|A\$|\$|€|£|¥)$/.test(cells.at(-1))) cells[cells.length - 1] += c;
        else cells.push(c);
      }
      if (cells.length) rows.push({ cells, blankFirst: !raw[0] });
    }
    last = t.index + t[0].length;
  }
  loose(html.slice(last));
  return rows;
}

// A term sheet's tranches: blocks headed by each tranche's title (Apple), a column per tranche, or one cell
// holding every tranche's value after its short name ("2029 Notes: $3,500,000,000 2031 Notes: ...", Amazon).
export function parseTermSheet(html) {
  const deal = {}, tranches = [];
  let current = null;
  const lookup = (title) => {
    const kind = kindOf(title), year = yearOf(title), coupon = pct(title);
    const same = tranches.filter((t) => t.kind === kind && t.year === year && (t.coupon == null || coupon == null || t.coupon === coupon));
    return same.find((t) => t.coupon === coupon) ?? (same.length === 1 ? same[0] : null);
  };
  const tranche = (text) => {
    const raw = String(text).trim();
    // "$2,000,000,000 of 7.000% Notes due 2029 ("2029 Fixed Rate Notes")" is titled "7.000% Notes due 2029".
    const cut = raw.search(/\((?:the\s+)?["“'‘]/);
    const title = (cut >= 0 ? raw.slice(0, cut) : raw).trim().replace(/^(?:US\$|\$|€|£|¥)\s?[\d,.]+\s*(?:million|billion)?\s+(?:aggregate principal amount\s+)?of\s+(?:its\s+|the\s+)?/i, "").replace(/\s+/g, " ").slice(0, 120);
    const short = /\((?:the\s+)?["“'‘]([^"”'’]{2,40})["”'’]/.exec(raw)?.[1] ?? null;
    let t = lookup(title);
    if (!t) { t = { kind: kindOf(title), year: yearOf(title), coupon: pct(title), title: null, short: null, f: {} }; tranches.push(t); }
    if (TITLE_RE.test(title) && (!t.title || title.length > t.title.length)) { t.title = title; t.coupon ??= pct(title); }
    if (!t.title && !t.short) t.short = title;
    if (short) t.short = short;
    return t;
  };
  const shortOf = (t) => t.short ?? (t.kind === "floating" ? "Floating Rate Notes" : `${t.year} Notes`);
  const fresh = () => { const t = { kind: "fixed", year: null, coupon: null, title: null, short: null, f: {} }; tranches.push(t); return t; };
  // Values written after each tranche's short name, when every name in the group is found.
  // A single tranche's value can carry its name too ("2059 Junior Subordinated Notes: UST 4.375% ..."): it is cut.
  const keyed = (value, group) => {
    if (!group?.length) return null;
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const hits = [];
    for (const t of group) {
      const m = new RegExp(`(?:^|\\s)(?:the\\s+)?["“]?${esc(shortOf(t))}["”]?\\s*:`, "i").exec(value);
      if (m) hits.push({ t, at: m.index, end: m.index + m[0].length });
    }
    // Keyed only when a name opens the value; then each name takes its own value and no other tranche any.
    hits.sort((a, b) => a.at - b.at);
    if (!hits.length || hits[0].at > 1) return null;
    return hits.map((h, i) => [h.t, value.slice(h.end, hits[i + 1]?.at ?? value.length).trim()]);
  };
  // A field's value runs on in rows with an empty label cell, one tranche or one title to a row ("2029
  // Floating Rate Notes: November 3, 2029"): they join the field above, unless one is a tranche's own heading.
  const rows = [];
  for (const raw of termRows(html)) {
    // A tranche's name in a cell of its own ("2020 Notes:", "$1,500,000,000") is joined to its value.
    const at = raw.blankFirst ? 0 : 1, cells = [...raw.cells];
    if (cells.length > at + 1 && /^[^:]{2,60}:$/.test(cells[at])) cells.splice(at, cells.length - at, cells.slice(at).join(" "));
    const row = { ...raw, cells };
    const prev = rows.at(-1), text = row.cells[0];
    if (prev?.field && row.blankFirst && row.cells.length === 1 && (prev.field === "title" || !TITLE_RE.test(text) || /^[^:]{2,60}:/.test(text))) {
      if (prev.cells.length === 1) prev.cells.push(text); else prev.cells[prev.cells.length - 1] += `\n${text}`;
      continue;
    }
    rows.push({ ...row, cells: [...row.cells], field: fieldOf(text) });
  }
  for (const { cells, blankFirst, field: labelled } of rows) {
    let [label, ...values] = cells;
    let field = labelled;
    if (!field && cells.length === 1) {
      const m = /^([^:]{2,60}):\s*([\s\S]+)$/.exec(label);
      if (m && fieldOf(m[1])) { field = fieldOf(m[1]); values = [m[2]]; }
    }
    if (!field) {
      if (cells.length === 1 && label.length <= 160 && TITLE_RE.test(label) && !/\.\s+[A-Z]/.test(label)) current = [tranche(label)];
      else if (blankFirst && cells.length >= 2 && cells.every((c) => c.length <= 120 && /\b(notes|bonds|debentures)\b/i.test(c))) current = cells.map(tranche);
      continue;
    }
    if (!values.length) continue;
    if (field === "title") {
      const titles = values.length > 1 ? values : titlesIn(values[0]);
      if (titles.length) current = titles.map(tranche);
      continue;
    }
    const put = (t, x) => { t.f[field] ??= x; if (field === "principal" && /reopen/i.test(label)) t.f.reopening = true; };
    // A value per column when the columns are tranches; otherwise the cells are one value split by the printer.
    if (values.length > 1 && current?.length === values.length) { current.forEach((t, i) => put(t, values[i])); continue; }
    if (values.length > 1 && !current && ["principal", "maturity", "coupon", "price", "yield"].includes(field)) { current = values.map(() => fresh()); current.forEach((t, i) => put(t, values[i])); continue; }
    const v = values.join(" ");
    const split = keyed(v.replace(/\n/g, " "), current);
    if (split) { for (const [t, x] of split) put(t, x); continue; }
    if (DEAL_LEVEL.has(field)) { deal[field] ??= v; continue; }
    if (!current) current = [fresh()];
    if (current.length === 1 && current[0].f[field] != null && ["principal", "maturity", "coupon"].includes(field)) current = [fresh()];
    for (const t of current) put(t, v);
  }
  return { deal, tranches: tranches.filter((t) => t.f.principal || t.f.maturity || t.f.coupon) };
}

// A floating coupon's index and spread, from its own rows or its coupon's words: "Compounded SOFR ... plus a
// spread of 1.255%" is Compounded SOFR + 125.5 bp.
const INDEX = /(compounded sofr|term sofr|sofr|€str|estr|euribor|sonia|corra|tona|libor)/i;
function floatingTerms(f) {
  const text = [f.coupon, f.floating, f.floating_index].filter(Boolean).join(" ").replace(/\s+/g, " ");
  const index = INDEX.exec(text)?.[1] ?? null;
  const m = /(?:plus|\+)\s*(?:a\s+(?:spread|margin)\s+of\s+)?(\d+(?:\.\d+)?)\s*(%|bps?|basis points?)/i.exec(text);
  const bp = spreadBp(f.floating_spread) ?? (m ? (m[2] === "%" ? round(Number(m[1]) * 100, 2) : Number(m[1])) : null);
  return { index, bp, text: index ? `${index}${bp != null ? ` + ${bp} bp` : ""}` : null };
}

// What a fixed-reset note pays after its reset: "the treasury rate ... plus a spread of 1.250%" is Treasury + 125 bp.
function resetText(text) {
  const m = /(?:plus|\+)\s*(?:a\s+(?:spread|margin)\s+of\s+)?(\d+(?:\.\d+)?)\s*(%|bps?|basis points?)/i.exec(String(text ?? ""));
  if (!m) return null;
  const bp = m[2] === "%" ? round(Number(m[1]) * 100, 2) : Number(m[1]);
  return `then ${/treasury/i.test(text) ? "Treasury" : /sofr/i.test(text) ? "SOFR" : "the reset rate"} + ${bp} bp`;
}

// 30/360 days between two ISO dates, and a date moved by whole months.
function days360(a, b) {
  const [y1, m1, d1] = a.split("-").map(Number), [y2, m2, d2] = b.split("-").map(Number);
  return 360 * (y2 - y1) + 30 * (m2 - m1) + Math.min(d2, 30) - Math.min(d1, 30);
}
function addMonths(d, n) {
  const [y, m, day] = d.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

// The yield (percent) that prices a semiannual 30/360 bond at the given price per 100 on the settlement date,
// coupons counted back from maturity, a short first one paid for the days it covers; null when the bond has
// under a month to run.
export function yieldFromPrice(price, coupon, settle, maturity) {
  const dates = [];
  for (let k = 0; k < 400; k += 1) { const d = addMonths(maturity, -6 * k); if (d <= settle) break; dates.push(d); }
  if (!dates.length || days360(settle, maturity) < 30) return null;
  const first = dates.at(-1), part = Math.min(1, days360(settle, first) / 180);
  const pv = (y) => dates.reduce((s, d) => s + ((coupon / 2) * (d === first ? part : 1) + (d === maturity ? 100 : 0)) / (1 + y / 200) ** (days360(settle, d) / 180), 0);
  let lo = -5, hi = 50;
  for (let i = 0; i < 100; i += 1) { const mid = (lo + hi) / 2; if (pv(mid) > price) lo = mid; else hi = mid; }
  return round((lo + hi) / 2, 3);
}

// One tranche's figures from its term sheet text.
function figures(t, deal) {
  const f = t.f;
  const amt = money(f.principal);
  const floating = t.kind === "floating" || (t.kind === "fixed" && !pct(t.title ?? "") && INDEX.test(`${f.coupon ?? ""} ${f.floating_index ?? ""}`));
  const fl = floating || t.kind === "fixed-to-floating" ? floatingTerms(f) : null;
  const isin = /\b([A-Z]{2}[0-9A-Z]{9}[0-9])\b/.exec(`${f.isin ?? ""} ${f.cusip ?? ""}`)?.[1] ?? null;
  // A CUSIP is written "037833EY2" or "037833 EY2"; a US or Canadian ISIN holds it.
  const written = /\b([0-9][0-9A-Z]{5}) ?([0-9A-Z]{2}[0-9])\b/.exec(f.cusip ?? "");
  const cusip = written ? written[1] + written[2] : /^(US|CA)/.test(isin ?? "") ? isin.slice(2, 11) : null;
  const swaps = f.swap_spread != null;
  const settle = isoDate(f.settlement ?? deal.settlement), traded = isoDate(f.trade_date ?? deal.trade_date);
  const maturity = isoDate(f.maturity);
  const coupon = floating ? null : pct(f.coupon) ?? t.coupon;
  const price = pct(f.price);
  return {
    title: t.title ?? (coupon != null && maturity ? `${coupon.toFixed(3)}% Notes due ${maturity.slice(0, 4)}` : t.short),
    kind: floating ? "floating" : t.kind,
    currency: amt?.currency ?? (/^[A-Z]{3}$/.test(String(deal.currency ?? "").trim()) ? deal.currency.trim() : null) ?? "USD",
    amount: amt?.amount ?? null,
    gross_proceeds: amt && price ? Math.round((amt.amount * price) / 100) : null,
    reopening: f.reopening ?? null,
    coupon_pct: coupon,
    coupon_text: floating ? fl.text : t.kind === "fixed-to-floating" && fl?.text ? `then ${fl.text}` : t.kind === "fixed-reset" ? resetText(f.reset_coupon) : null,
    maturity, price_pct: price, yield_pct: pct(f.yield),
    // Euro and sterling bonds price over mid-swaps; the government bond spread beside it is the secondary quote.
    // A spread quoted over a curve and over the named bond ("+40 bps versus the GoC curve; +43.4 bps versus the
    // applicable Benchmark Bond") is taken over the bond, the benchmark this row names.
    spread_bp: floating ? (fl.bp ?? spreadBp(f.spread)) : swaps ? spreadBp(f.swap_spread) : spreadBp(/([+-]?\s*\d+(?:\.\d+)?\s*(?:bps?|basis points?))\s+(?:versus|vs\.?|over|to)\s+the\s+(?:applicable\s+)?benchmark/i.exec(f.spread ?? "")?.[1] ?? f.spread),
    benchmark: floating ? fl.index : swaps ? "mid-swaps" : f.benchmark ? f.benchmark.replace(/\s+/g, " ").slice(0, 80) : null,
    benchmark_yield_pct: floating ? null : swaps ? pct(f.swap_yield) : pct(f.benchmark_yield?.split("/").at(-1)),
    cusip, isin, traded, settle,
  };
}

// EDGAR full-text search for one company's filings of some forms in a window, every page up to `pages`.
async function search(session, { q, forms, cik, from, to, pages = 2 }) {
  const out = [];
  let total = 0;
  for (let page = 0; page < pages; page += 1) {
    const p = new URLSearchParams({ q, forms, ciks: String(cik).padStart(10, "0"), dateRange: "custom", startdt: from, enddt: to });
    if (page) p.set("from", String(page * 100));
    const r = await getJson(session, `${EFTS}?${p}`);
    total = r?.hits?.total?.value ?? 0;
    const hits = r?.hits?.hits ?? [];
    for (const h of hits) {
      const [acc, file] = String(h._id).split(":"), s = h._source ?? {};
      out.push({ acc, file, form: s.form, filed: s.file_date, type: String(s.file_type ?? "") });
    }
    if (hits.length < 100) break;
  }
  return { hits: out, total };
}

const docUrl = (cik, acc, file) => `${ARCHIVES}/${Number(cik)}/${acc.replace(/-/g, "")}/${file}`;

// The fee table's offering lines from its XBRL instance: title, type, amount and the price it implies.
export function feeTable(xml) {
  const lines = new Map(), doc = {};
  for (const m of String(xml).matchAll(/<ffd:([A-Za-z]+)\b([^>]*)>([^<]*)<\/ffd:\1>/g)) {
    const ctx = /contextRef="([^"]+)"/.exec(m[2])?.[1] ?? "";
    const value = decodeEntities(m[3]).trim();
    if (/^(OfferingSctyTp|OfferingSctyTitl|AmtSctiesRegd|MaxAggtOfferingPric|MaxOfferingPricPerScty)$/.test(m[1])) {
      const line = lines.get(ctx) ?? {};
      line[m[1]] = value;
      if (m[1] === "AmtSctiesRegd") line.unit = /unitRef="([^"]+)"/.exec(m[2])?.[1] ?? null;
      lines.set(ctx, line);
    } else doc[m[1]] = value;
  }
  const rows = [...lines.values()].filter((l) => l.OfferingSctyTitl).map((l) => {
    // "Debt Securities (4.500% Notes due 2029)" is the 4.500% Notes due 2029.
    let title = l.OfferingSctyTitl.replace(/\s+/g, " ").trim();
    const inner = /\(([^()]*\b(?:notes|bonds|debentures)\b[^()]*\bdue\b[^()]*)\)/i.exec(title);
    if (inner && /^(debt securities|debt|senior notes|notes)\b/i.test(title)) title = inner[1].trim();
    // Some filers count notes, not dollars: 750,000 notes of $1,000 offered for $748,957,500.
    const n = Number(l.AmtSctiesRegd), aggregate = Number(l.MaxAggtOfferingPric);
    let amount = null, price = null;
    if (n > 0 && aggregate > 0) {
      const r = aggregate / n;
      const per = r > 0.5 && r < 1.5 ? 1 : r > 500 && r < 1500 ? 1000 : r > 50 && r < 150 ? 100 : null;
      if (per) { amount = n * per; price = round((aggregate / amount) * 100, 3); }
    } else if (n >= 1e6) amount = n;
    const unit = String(l.unit ?? "").toUpperCase();
    return {
      type: l.OfferingSctyTp ?? null, title, amount, price_pct: price,
      currency: /^[A-Z]{3}$/.test(unit) ? unit : "USD",
      gross: Number.isFinite(aggregate) && aggregate > 0 ? aggregate : null,
    };
  });
  return { rows, final: doc.FnlPrspctsFlg === "true", form: doc.SubmissnTp ?? null };
}

const STRUCTURED = /linked|contingent|auto[- ]?call|buffer|barrier|digital|trigger|leveraged|accelerated|basket|participation|absolute return|dual directional|capped|warrant|\bunits?\b|index|equity|shares|stock/i;

export async function bondOfferings(session, args) {
  const a = bondsInput.parse(args);
  const years = a.years ?? 5, want = a.deals ?? 10;
  const e = await resolveEntity(session, a.company);
  const to = new Date(session.now()).toISOString().slice(0, 10);
  const from = `${Number(to.slice(0, 4)) - years}${to.slice(4)}`;
  const sources = [];

  // Term sheets: a benchmark Treasury or mid-swaps line marks a priced bond, not a structured note's terms.
  const found = await search(session, { q: "\"Benchmark Treasury\" OR \"Mid-Swap\" OR \"Mid-Swaps\" OR \"Pricing Term Sheet\"", forms: "FWP", cik: e.cik, from, to });
  const sheets = [...new Map(found.hits.map((h) => [h.acc, h])).values()].sort((x, y) => (x.filed < y.filed ? 1 : -1));
  const reading = sheets.slice(0, want);
  const tranches = [], byDate = new Map(), notRead = [], unread = sheets.slice(want), mismatched = [];
  let otherSheets = 0;
  const dealOn = (priced) => { const d = byDate.get(priced) ?? { priced, settled: null, issuer: null, ratings: null, documents: [] }; byDate.set(priced, d); return d; };
  for (const s of reading) {
    const url = docUrl(e.cik, s.acc, s.file);
    let html;
    try { html = await getText(session, url); } catch (err) { notRead.push(`${s.filed} term sheet ${url}: ${err.message}`); unread.push(s); continue; }
    sources.push(url);
    const { deal, tranches: ts } = parseTermSheet(html);
    // An equity or convertible deal's pricing term sheet has no notes in it.
    if (!ts.length) { otherSheets += 1; continue; }
    const rows = ts.map((t) => ({ ...figures(t, deal), from: "term sheet", term_sheet: url, fee_table: null }));
    // A tranche whose figures disagree with its own title (coupon, maturity year) or repeat another tranche's
    // CUSIP was given the wrong column or line: its figures are left out rather than shown wrong.
    const cusips = new Map();
    for (const r of rows) {
      const tc = pct(r.title), ty = yearOf(r.title);
      const clash = (tc != null && r.coupon_pct != null && Math.abs(tc - r.coupon_pct) > 0.0005) || (ty && r.maturity && r.maturity.slice(0, 4) !== ty) || (r.cusip && cusips.has(r.cusip) && cusips.get(r.cusip) !== r.title);
      if (r.cusip && !cusips.has(r.cusip)) cusips.set(r.cusip, r.title);
      if (!clash) continue;
      mismatched.push(`${r.title} (${s.filed}): its figures in the term sheet could not be told apart from another tranche's, so only its title is shown`);
      Object.assign(r, { amount: null, gross_proceeds: null, coupon_pct: r.kind === "floating" ? null : tc, maturity: ty, price_pct: null, yield_pct: null, spread_bp: null, benchmark: null, benchmark_yield_pct: null, cusip: null, isin: null, coupon_text: null, from: "term sheet title" });
    }
    const priced = rows.find((r) => r.traded)?.traded ?? s.filed;
    for (const r of rows) { r.priced = r.traded ?? priced; tranches.push(r); }
    // One deal per pricing day: some issuers file a term sheet for each tranche.
    const d = dealOn(priced);
    d.settled ??= rows.find((r) => r.settle)?.settle ?? null;
    d.issuer ??= deal.issuer ? deal.issuer.replace(/\s*\(the\s+["“]?issuer["”]?\)/i, "").replace(/\s+/g, " ").slice(0, 80) : null;
    d.ratings ??= deal.ratings ? deal.ratings.replace(/\s+/g, " ").slice(0, 160) : null;
    d.documents.push(url);
  }

  // Fee tables: final prospectus supplements' XBRL. One filed within five days after a deal's pricing confirms
  // its amounts and prices. One near no term sheet is a deal priced without one: read for companies that file
  // few prospectus supplements (not a bank's note factory), back to the oldest term sheet read.
  const fees = await search(session, { q: "\"Notes due\" OR \"Debentures due\" OR \"Bonds due\"", forms: "424B2,424B3,424B5", cik: e.cik, from, to, pages: 1 });
  const exhibits = [...new Map(fees.hits.filter((h) => /filing fees/i.test(h.type)).map((h) => [h.acc, h])).values()].sort((x, y) => (x.filed < y.filed ? 1 : -1));
  const within = (filed, day) => { const d = dayDiff(filed, day); return d >= 0 && d <= 5; };
  const dealsNear = (h) => [...byDate.values()].filter((d) => within(h.filed, d.priced));
  const unreadNear = (h) => unread.some((s) => within(h.filed, s.filed));
  const horizon = unread.length && reading.length ? reading.at(-1).filed : from;
  const few = fees.total <= 40;
  const chosen = exhibits.filter((h) => dealsNear(h).length || (few && !unreadNear(h) && h.filed >= horizon)).slice(0, want * 2);
  const feeGaps = [];
  let structured = 0, notDebt = 0, unstructured = 0;
  for (const h of chosen) {
    const url = docUrl(e.cik, h.acc, h.file.replace(/\.htm$/i, "_htm.xml"));
    let table;
    try { table = feeTable(await getText(session, url)); } catch (err) { if (err instanceof NotFound) unstructured += 1; else notRead.push(`${h.filed} fee table ${url}: ${err.message}`); continue; }
    if (!table.rows.length) { unstructured += 1; continue; }
    sources.push(url);
    const near = dealsNear(h).map((d) => d.priced);
    let used = false;
    for (const r of table.rows) {
      // Filers type notes "Debt" or "Other"; shares, warrants and units are not notes.
      if (r.type && !/debt/i.test(r.type) && !/\b(notes?|bonds?|debentures?|debt securities)\b/i.test(r.title)) { notDebt += 1; continue; }
      if (STRUCTURED.test(r.title)) { structured += 1; continue; }
      const kind = kindOf(r.title), year = yearOf(r.title), coupon = pct(r.title);
      const match = tranches.find((t) => t.from !== "fee table" && near.includes(t.priced) && t.kind === kind && t.maturity?.slice(0, 4) === year && (coupon == null || t.coupon_pct == null || t.coupon_pct === coupon));
      if (match) {
        match.from = "term sheet, fee table";
        match.fee_table = url;
        match.amount ??= r.amount;
        match.price_pct ??= r.price_pct;
        match.gross_proceeds ??= r.gross;
        // A foreign-currency deal's fee table states dollars at an exchange rate; a dollar deal's should agree.
        if (match.currency === "USD" && r.amount && match.amount && Math.abs(r.amount - match.amount) > 1) feeGaps.push(`${match.title} (${match.priced}): term sheet ${match.amount}, fee table ${r.amount}`);
        dealOn(match.priced).documents.includes(url) || dealOn(match.priced).documents.push(url);
        continue;
      }
      // Unmatched lines near a term sheet left unread belong to that deal.
      if (unreadNear(h)) continue;
      used = true;
      tranches.push({ title: r.title, kind, currency: r.currency, amount: r.amount, gross_proceeds: r.gross, reopening: null, coupon_pct: kind === "floating" ? null : coupon, coupon_text: null, maturity: year, price_pct: r.price_pct, yield_pct: null, spread_bp: null, benchmark: null, benchmark_yield_pct: null, cusip: null, isin: null, traded: null, settle: null, priced: h.filed, from: "fee table", term_sheet: null, fee_table: url });
    }
    if (used) dealOn(h.filed).documents.push(url);
  }
  if (!tranches.length) {
    if (notRead.length) throw new Error(`No term sheet could be read: ${notRead.slice(0, 3).join("; ")}`);
    const others = otherSheets ? ` (${otherSheets} pricing term sheet${otherSheets > 1 ? "s were" : " was"} for shares or convertibles, not notes)` : "";
    throw new NotFound(`No registered bond offerings found for ${e.name ?? `CIK ${e.cik}`} from ${from} to ${to}: no priced bond term sheet${others} and no debt in a final prospectus fee table. It may borrow privately (Rule 144A deals file no prospectus), through a financing arm that files under its own name, or not at all.`);
  }
  const deals = [...byDate.values()].filter((d) => d.documents.length);

  // Checks: the yield a fixed-rate dollar tranche's price implies, and the benchmark yield plus spread.
  const checks = { yields_checked: 0, yield_gaps: [], spreads_checked: 0, spread_gaps: [], fee_table_gaps: feeGaps, figures_left_out: mismatched };
  for (const t of tranches) {
    t.tenor_years = t.maturity?.length === 10 && (t.settle ?? t.priced) ? round(dayDiff(t.maturity, t.settle ?? t.priced) / 365.25, 1) : null;
    if (t.kind === "fixed" && t.currency === "USD" && t.coupon_pct != null && t.price_pct && t.yield_pct != null && t.maturity?.length === 10 && t.settle) {
      const y = yieldFromPrice(t.price_pct, t.coupon_pct, t.settle, t.maturity);
      if (y != null) {
        checks.yields_checked += 1;
        if (Math.abs(y - t.yield_pct) > 0.03) checks.yield_gaps.push(`${t.title} (${t.priced}): stated ${t.yield_pct}%, ${y}% from its price`);
      }
    }
    if (t.kind !== "floating" && t.yield_pct != null && t.benchmark_yield_pct != null && t.spread_bp != null) {
      checks.spreads_checked += 1;
      const gap = t.yield_pct - (t.benchmark_yield_pct + t.spread_bp / 100);
      if (Math.abs(gap) > 0.011) checks.spread_gaps.push(`${t.title} (${t.priced}): ${t.benchmark_yield_pct}% + ${t.spread_bp} bp is not the stated ${t.yield_pct}%`);
    }
  }
  tranches.sort((x, y) => (x.priced === y.priced ? String(x.maturity).localeCompare(String(y.maturity)) : x.priced < y.priced ? 1 : -1));
  deals.sort((x, y) => (x.priced < y.priced ? 1 : -1));

  // Each year's borrowing by currency: amounts, and amount-weighted coupon, tenor and spread.
  const years_ = new Map();
  for (const t of tranches) {
    const k = `${t.priced.slice(0, 4)}|${t.currency}`;
    const y = years_.get(k) ?? { year: Number(t.priced.slice(0, 4)), currency: t.currency, deals: new Set(), tranches: 0, amount: 0, c: [0, 0], n: [0, 0], s: [0, 0] };
    y.deals.add(t.priced); y.tranches += 1;
    if (t.amount) {
      y.amount += t.amount;
      if (t.coupon_pct != null) { y.c[0] += t.coupon_pct * t.amount; y.c[1] += t.amount; }
      if (t.tenor_years != null) { y.n[0] += t.tenor_years * t.amount; y.n[1] += t.amount; }
      if (t.spread_bp != null && t.kind !== "floating") { y.s[0] += t.spread_bp * t.amount; y.s[1] += t.amount; }
    }
    years_.set(k, y);
  }
  const avg = ([s, w], d) => (w ? round(s / w, d) : null);
  const COLS = ["priced", "security", "kind", "currency", "amount", "gross_proceeds", "reopening", "coupon_pct", "coupon", "maturity", "tenor_years", "price_pct", "yield_pct", "spread_bp", "benchmark", "benchmark_yield_pct", "cusip", "isin", "from"];
  const amounts = (priced) => {
    const out = {};
    for (const t of tranches) if (t.priced === priced && t.amount) out[t.currency] = (out[t.currency] ?? 0) + t.amount;
    return out;
  };
  return {
    company: { name: e.name, cik: e.cik, ticker: e.ticker },
    window: { from, to },
    offerings: {
      note: "One row per tranche, newest first. reopening marks more of an existing series sold, the amount being the addition. spread_bp is over the benchmark named: a Treasury for most dollar bonds, mid-swaps for euro bonds, the index for floating notes. A row from a fee table alone is dated the day its prospectus was filed, has its maturity as a year and its amounts in dollars (a foreign-currency deal's at the exchange rate used for the fee).",
      columns: COLS,
      rows: tranches.map((t) => [t.priced, t.title, t.kind, t.currency, t.amount, t.gross_proceeds, t.reopening, t.coupon_pct, t.coupon_text, t.maturity, t.tenor_years, t.price_pct, t.yield_pct, t.spread_bp, t.benchmark, t.benchmark_yield_pct, t.cusip, t.isin, t.from]),
    },
    deals: {
      columns: ["priced", "settled", "issuer", "tranches", "amounts", "ratings", "documents"],
      rows: deals.map((d) => [d.priced, d.settled, d.issuer, tranches.filter((t) => t.priced === d.priced).length, amounts(d.priced), d.ratings, d.documents]),
      note: "ratings are as the term sheet stated them on the day of pricing.",
    },
    by_year: {
      columns: ["year", "currency", "deals", "tranches", "amount", "avg_coupon_pct", "avg_tenor_years", "avg_spread_bp"],
      rows: [...years_.values()].sort((x, y) => y.year - x.year || x.currency.localeCompare(y.currency)).map((y) => [y.year, y.currency, y.deals.size, y.tranches, y.amount, avg(y.c, 3), avg(y.n, 1), avg(y.s, 1)]),
      note: "Averages are weighted by amount.",
    },
    checks: {
      ...checks,
      reading: "Each fixed-rate dollar tranche's yield is recomputed from its price (semiannual, 30/360, coupons counted back from maturity), and the benchmark yield plus the spread is compared with the yield stated. A gap means a figure was misread or the first coupon period is irregular.",
    },
    term_sheets: { found: sheets.length, read: reading.length, ...(otherSheets ? { for_shares_or_convertibles: otherSheets } : {}) },
    ...(notRead.length ? { not_read: notRead } : {}),
    ...(structured || notDebt || unstructured ? { skipped: { structured_notes: structured, lines_not_notes: notDebt, fee_tables_without_xbrl: unstructured } } : {}),
    source: "SEC EDGAR: full-text search for term sheets (FWP) and final prospectus supplements (424B2, 424B3, 424B5), then each document; deals.documents lists them",
    sources: [`${EFTS} (forms FWP, 424B2, 424B3 and 424B5 for CIK ${e.cik})`, ...sources],
    limits: [
      "Registered offerings only: Rule 144A and other private placements file no prospectus, so most high-yield and many foreign issuers' bonds are missing. A financing arm (Ford Motor Credit, Toyota Motor Credit, John Deere Capital) files under its own name.",
      "Term sheets are read from their text; fee tables are XBRL only from 2024 (large filers) and 2025 (all others), so earlier deals with no term sheet are not found.",
      "Terms at pricing, as filed: later reopenings, exchanges, redemptions and ratings changes are not followed. debt_profile has what the company owes now.",
      "Not investment advice.",
    ],
  };
}
