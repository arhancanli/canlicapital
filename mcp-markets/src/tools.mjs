// The tools: company profiles, filings and their sections, full-text search, insider trades,
// fund holdings, Treasury yields, economic series and prices. Every result names its source URL,
// so an answer can be checked against the filing or table it came from.
import { z } from "zod";

import { parse13F, parseForm4 } from "./forms.mjs";
import { findSections, htmlToText, resolveSection } from "./html.mjs";
import { archiveBase, filingDocuments, filings, fredCsv, fredTitle, getJson, getText, NotFound, resolveEntity, submissions, treasuryYear, TREASURY_CURVES } from "./sources.mjs";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date as YYYY-MM-DD");
const COMPANY = z.string().min(1).max(120).describe("Ticker (AAPL), CIK (320193) or name (Apple).");
const today = (session) => new Date(session.now()).toISOString().slice(0, 10);
const daysAgo = (session, n) => new Date(session.now() - n * 86400000).toISOString().slice(0, 10);
const round = (x, d = 4) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);

export const SEC_LIMITS = Object.freeze([
  "From SEC EDGAR as filed; Canli Capital does not edit or verify the filers' statements.",
  "Not investment advice.",
]);

function entityOut(e, sub) {
  return { cik: e.cik, name: sub?.name ?? e.name, ticker: sub?.tickers?.[0] ?? e.ticker, ...(e.matched_by === "name" ? { matched_by: "name", ...(e.other_matches ? { other_matches: e.other_matches } : {}) } : {}) };
}

// ---------------------------------------------------------------------------------------------
// company_profile
// ---------------------------------------------------------------------------------------------
export const profileInput = z.object({ company: COMPANY }).strict();
export async function companyProfile(session, args) {
  const { company } = profileInput.parse(args);
  const e = await resolveEntity(session, company);
  const sub = await submissions(session, e.cik);
  const recent = sub.filings?.recent ?? {};
  const latest = (form) => { const i = (recent.form ?? []).indexOf(form); return i < 0 ? null : { filed: recent.filingDate[i], period: recent.reportDate[i] || null, accession: recent.accessionNumber[i], url: `${archiveBase(e.cik, recent.accessionNumber[i])}/${String(recent.primaryDocument[i]).replace(/^xsl[^/]*\//, "")}` }; };
  const addr = sub.addresses?.business ?? {};
  return {
    ...entityOut(e, sub),
    tickers: sub.tickers ?? [], exchanges: sub.exchanges ?? [], entity_type: sub.entityType || null,
    sic: sub.sic || null, industry: sub.sicDescription || null, filer_category: sub.category || null,
    fiscal_year_end: sub.fiscalYearEnd ? `${sub.fiscalYearEnd.slice(0, 2)}-${sub.fiscalYearEnd.slice(2)}` : null,
    state_of_incorporation: sub.stateOfIncorporation || null,
    business_address: [addr.street1, addr.street2, addr.city, addr.stateOrCountry, addr.zipCode].filter(Boolean).join(", ") || null,
    phone: sub.phone || null, website: sub.website || null, ein: sub.ein || null,
    former_names: (sub.formerNames ?? []).map((f) => ({ name: f.name, until: f.to?.slice(0, 10) ?? null })),
    latest_10k: latest("10-K"), latest_10q: latest("10-Q"), latest_8k: latest("8-K"), latest_13f: latest("13F-HR"),
    insider_filings: Boolean(sub.insiderTransactionForIssuerExists),
    source: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${e.cik}`,
    limits: SEC_LIMITS,
  };
}

// ---------------------------------------------------------------------------------------------
// list_filings
// ---------------------------------------------------------------------------------------------
export const listInput = z.object({
  company: COMPANY,
  forms: z.array(z.string().min(1).max(20)).max(20).optional().describe("Form types, for example [\"10-K\", \"8-K\"]; amendments (10-K/A) are included. Default: all."),
  since: DATE.optional().describe("Filed on or after this date."),
  until: DATE.optional().describe("Filed on or before this date."),
  limit: z.number().int().min(1).max(200).optional().describe("Most filings, newest first; default 20."),
}).strict();
export async function listFilings(session, args) {
  const { company, forms, since, until, limit = 20 } = listInput.parse(args);
  const e = await resolveEntity(session, company);
  const { sub, rows } = await filings(session, e.cik, { since });
  const want = forms?.map((f) => f.toUpperCase());
  const picked = rows.filter((r) => (!want || want.some((f) => r.form === f || r.form === `${f}/A`)) && (!since || r.filingDate >= since) && (!until || r.filingDate <= until));
  return {
    ...entityOut(e, sub),
    matched: picked.length,
    columns: ["filed", "form", "period", "accession", "description", "items", "url"],
    rows: picked.slice(0, limit).map((r) => [r.filingDate, r.form, r.reportDate || null, r.accessionNumber, r.primaryDocDescription || null, r.items || null, `${archiveBase(e.cik, r.accessionNumber)}/${r.primaryDocument}`]),
    next: "read_filing with an accession (or a form for the latest) returns the text; for a 10-K or 10-Q, section picks one item such as \"risk factors\" or \"md&a\".",
    limits: SEC_LIMITS,
  };
}

// ---------------------------------------------------------------------------------------------
// read_filing
// ---------------------------------------------------------------------------------------------
export const readInput = z.object({
  company: COMPANY.optional(),
  accession: z.string().regex(/^\d{10}-\d{2}-\d{6}$/, "an accession number such as 0000320193-25-000079").optional().describe("The filing; from list_filings or search_filings."),
  form: z.string().min(1).max(20).optional().describe("Without accession: read the company's latest filing of this form; default 10-K."),
  filed_before: DATE.optional().describe("Without accession: the latest filing of the form filed on or before this date."),
  section: z.string().min(1).max(80).optional().describe("10-K or 10-Q item: \"risk factors\", \"md&a\", \"business\", \"market risk\", \"legal proceedings\", \"1A\", \"7\"; the result lists every item found."),
  document: z.string().min(1).max(120).optional().describe("Another document in the filing, by file name or type, for example \"EX-99.1\" (an 8-K's press release)."),
  find: z.string().min(2).max(120).optional().describe("Words to find in the filing (or section), for example \"employees\" or \"share repurchase\": returns the matching passages with their offsets instead of the text from the start. Quote a phrase to match it exactly."),
  offset: z.number().int().min(0).optional().describe("Character offset to continue from; the previous result's next_offset, or a find match's offset."),
  max_chars: z.number().int().min(500).max(100000).optional().describe("Most characters to return; default 15000."),
}).strict();

export async function readFiling(session, args) {
  const a = readInput.parse(args);
  if (!a.company && !a.accession) throw new Error("read_filing needs company (to read its latest filing of a form) or accession.");
  const maxChars = a.max_chars ?? 15000;
  let cik, filing, ent = null, sub = null;
  if (a.company) {
    ent = await resolveEntity(session, a.company);
    cik = ent.cik;
  }
  if (a.accession) {
    if (!cik) cik = Number(a.accession.slice(0, 10));
    // The accession's year bounds how far back to look.
    const yy = Number(a.accession.slice(11, 13));
    let found;
    try { found = await filings(session, cik, { since: `${yy > 90 ? 1900 + yy : 2000 + yy}-01-01` }); } catch (err) {
      if (err instanceof NotFound && !a.company) throw new NotFound(`Accession ${a.accession} begins with the CIK of the filing agent that submitted it, not the company; pass company as well (the ticker is enough).`);
      throw err;
    }
    const { rows, sub: s } = found;
    sub = s;
    filing = rows.find((r) => r.accessionNumber === a.accession);
    if (!filing && !a.company) throw new NotFound(`Accession ${a.accession} is not in the filings of CIK ${cik} (a filing agent's CIK leads some accession numbers); pass company as well.`);
    if (!filing) throw new NotFound(`${a.accession} is not a filing of ${a.company}.`);
  } else {
    const form = (a.form ?? "10-K").toUpperCase();
    const since = a.filed_before ? `${Number(a.filed_before.slice(0, 4)) - 2}-01-01` : undefined;
    const { rows, sub: s } = await filings(session, cik, { since });
    sub = s;
    filing = rows.find((r) => r.form === form && (!a.filed_before || r.filingDate <= a.filed_before));
    if (!filing) throw new NotFound(`${sub.name} has no ${form}${a.filed_before ? ` filed on or before ${a.filed_before}` : " in its recent filings"} on EDGAR; list_filings shows what it has filed.`);
  }
  const base = archiveBase(cik, filing.accessionNumber);
  let docs = null;
  let docName = filing.primaryDocument.replace(/^xsl[^/]*\//, "");
  if (a.document) {
    docs = await filingDocuments(session, cik, filing.accessionNumber);
    const want = a.document.toLowerCase();
    const d = docs.find((x) => x.name.toLowerCase() === want) ?? docs.find((x) => (x.type ?? "").toLowerCase() === want) ?? docs.find((x) => (x.type ?? "").toLowerCase().startsWith(want));
    if (!d) throw new NotFound(`No document "${a.document}" in ${filing.accessionNumber}; it holds ${docs.map((x) => `${x.name} (${x.type})`).join(", ")}.`);
    docName = d.name;
  }
  const url = `${base}/${docName}`;
  const isText = /\.(htm|html|xml|txt)$/i.test(docName);
  if (!isText) throw new Error(`${docName} is not a text document; read it at ${url}.`);
  const text = await getText(session, url, { maxBytes: 24 * 1024 * 1024, transform: (t) => (/\.txt$/i.test(docName) ? t : htmlToText(t)) });
  const formOf = filing.form.replace(/\/A$/, "");
  let body = text, chosen = null, sections = null;
  if (/^10-[KQ]/.test(formOf) && !a.document) {
    const found = findSections(text, formOf);
    sections = found.sections.map((s) => [s.key, s.title.slice(0, 90), s.chars]);
    if (a.section) {
      const s = resolveSection(a.section, formOf, found.sections);
      if (!s) throw new NotFound(`No item matching "${a.section}" in this ${formOf}; its items are ${found.sections.map((x) => `${x.key} ${x.title.slice(0, 40)}`).join("; ")}.`);
      chosen = { item: s.key, title: s.title };
      body = found.lines.slice(s.line, s.end).join("\n");
    }
  } else if (a.section) {
    throw new Error(`section applies to the primary document of a 10-K or 10-Q; this is ${formOf}${a.document ? ` (${a.document})` : ""}.`);
  }
  // find: passages containing every word (or the quoted phrase), each with its offset, so a long
  // filing is searched in one call instead of paged through.
  let matches = null;
  if (a.find) {
    const phrase = a.find.match(/^"(.+)"$/)?.[1];
    const terms = phrase ? [phrase.toLowerCase()] : a.find.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
    const lower = body.toLowerCase();
    const paras = [];
    let at = 0;
    for (const para of body.split("\n")) { paras.push([at, para]); at += para.length + 1; }
    matches = [];
    let chars = 0, covered = 0;
    for (let i = 0; i < paras.length && matches.length < 12; i++) {
      // A passage is a paragraph with its neighbours, so a heading and its first lines match
      // together; passages never overlap.
      const from = Math.max(covered, paras[Math.max(0, i - 1)][0]), to = i + 1 < paras.length ? paras[i + 1][0] + paras[i + 1][1].length : body.length;
      const own = paras[i][1].toLowerCase();
      if (!terms.some((t) => own.includes(t))) continue;
      const window = lower.slice(from, to);
      if (!terms.every((t) => window.includes(t))) continue;
      let text = body.slice(from, to);
      if (text.length > 1500) { const k = own.indexOf(terms.find((t) => own.includes(t))); text = body.slice(Math.max(from, paras[i][0] + k - 600), paras[i][0] + k + 900); }
      if (chars + text.length > maxChars) break;
      chars += text.length;
      matches.push({ offset: from, text });
      covered = to + 1;
    }
  }
  const offset = a.offset ?? 0;
  const slice = matches ? "" : body.slice(offset, offset + maxChars);
  const end = offset + slice.length;
  // An 8-K's primary document is usually a cover; its substance is in the exhibits.
  if (!docs && formOf === "8-K") docs = await filingDocuments(session, cik, filing.accessionNumber).catch(() => null);
  return {
    company: { cik, name: sub?.name ?? ent?.name ?? null, ticker: sub?.tickers?.[0] ?? ent?.ticker ?? null },
    filing: { form: filing.form, filed: filing.filingDate, period: filing.reportDate || null, accession: filing.accessionNumber, ...(filing.items ? { items: filing.items } : {}) },
    document: docName,
    ...(chosen ? { section: chosen } : {}),
    ...(sections && !chosen ? { sections: { columns: ["item", "title", "chars"], rows: sections } } : {}),
    ...(docs ? { documents: { columns: ["name", "type", "description"], rows: docs.filter((d) => /\.(htm|html|txt|xml)$/i.test(d.name)).slice(0, 40).map((d) => [d.name, d.type, d.description]) } } : {}),
    total_chars: body.length,
    ...(matches ? { find: a.find, matches: matches.length ? matches : "no passage contains every word; try fewer or other words, or read without find" } : { offset, ...(end < body.length ? { next_offset: end, more: `${body.length - end} more characters: pass offset ${end}, or use find to jump to the words you need` } : {}), text: slice }),
    url,
    limits: SEC_LIMITS,
  };
}

// ---------------------------------------------------------------------------------------------
// search_filings
// ---------------------------------------------------------------------------------------------
export const searchInput = z.object({
  query: z.string().min(1).max(300).describe("Words to find in filing text; put a phrase in double quotes, for example \"\\\"supply chain\\\" tariffs\"."),
  forms: z.array(z.string().min(1).max(20)).max(20).optional().describe("Form types, for example [\"10-K\"]. Default: all."),
  company: COMPANY.optional().describe("Only this filer's documents."),
  since: DATE.optional(), until: DATE.optional(),
  limit: z.number().int().min(1).max(100).optional().describe("Most documents; default 10."),
}).strict();
export async function searchFilings(session, args) {
  const a = searchInput.parse(args);
  const p = new URLSearchParams({ q: a.query });
  if (a.forms) p.set("forms", a.forms.map((f) => f.toUpperCase()).join(","));
  let ent = null;
  if (a.company) { ent = await resolveEntity(session, a.company); p.set("ciks", String(ent.cik).padStart(10, "0")); }
  if (a.since || a.until) { p.set("dateRange", "custom"); p.set("startdt", a.since ?? "2001-01-01"); p.set("enddt", a.until ?? today(session)); }
  const url = `https://efts.sec.gov/LATEST/search-index?${p}`;
  const r = await getJson(session, url);
  const hits = r?.hits?.hits ?? [];
  const limit = a.limit ?? 10;
  return {
    query: a.query, total: r?.hits?.total?.value ?? hits.length, ...(r?.hits?.total?.relation === "gte" ? { total_is_lower_bound: true } : {}),
    columns: ["filed", "form", "filer", "period", "accession", "document", "url"],
    rows: hits.slice(0, limit).map((h) => {
      const [adsh, file] = h._id.split(":");
      const cik = Number((h._source.ciks ?? [])[0]);
      return [h._source.file_date, h._source.form ?? h._source.root_forms?.[0] ?? null, (h._source.display_names ?? [])[0]?.replace(/\s+/g, " ") ?? null, h._source.period_ending ?? null, adsh, file, `${archiveBase(cik, adsh)}/${file}`];
    }),
    next: "read_filing with company and accession (and document for an exhibit) returns the text.",
    source: `https://efts.sec.gov/LATEST/search-index (EDGAR full-text search, filings from 2001)`,
    limits: SEC_LIMITS,
  };
}

// ---------------------------------------------------------------------------------------------
// insider_trades
// ---------------------------------------------------------------------------------------------
export const insiderInput = z.object({
  company: COMPANY,
  since: DATE.optional().describe("Filed on or after; default 90 days ago."),
  until: DATE.optional().describe("Filed on or before; default today."),
  codes: z.array(z.string().regex(/^[A-Z]$/)).max(20).optional().describe("Transaction codes to keep, for example [\"P\", \"S\"] for open-market purchases and sales. Default: all."),
  max_filings: z.number().int().min(1).max(100).optional().describe("Most Form 4 filings to read, newest first; default 40."),
}).strict();
export async function insiderTrades(session, args) {
  const a = insiderInput.parse(args);
  const since = a.since ?? daysAgo(session, 90), until = a.until ?? today(session);
  const e = await resolveEntity(session, a.company);
  const { sub, rows } = await filings(session, e.cik, { since });
  const f4 = rows.filter((r) => (r.form === "4" || r.form === "4/A") && r.filingDate >= since && r.filingDate <= until);
  const take = f4.slice(0, a.max_filings ?? 40);
  const parsed = await Promise.all(take.map(async (r) => {
    const url = `${archiveBase(e.cik, r.accessionNumber)}/${r.primaryDocument.replace(/^xsl[^/]*\//, "")}`;
    try { return { r, url, doc: parseForm4(await getText(session, url, { maxBytes: 4 * 1024 * 1024 })) }; } catch (err) { return { r, url, error: String(err.message ?? err) }; }
  }));
  const keep = a.codes ? new Set(a.codes) : null;
  const out = [];
  const errors = [];
  for (const p of parsed) {
    if (p.error) { errors.push([p.r.accessionNumber, p.error]); continue; }
    const who = p.doc.owners.map((o) => o.name).join("; ");
    const role = [...new Set(p.doc.owners.flatMap((o) => o.roles))].join("; ");
    for (const t of p.doc.rows) {
      if (keep && !keep.has(t.code)) continue;
      out.push([t.date, who, role, t.code, t.meaning, t.acquired_or_disposed, t.shares, t.price, t.value, t.owned_after, t.direct ? "direct" : "indirect", t.kind, Boolean(t.plan_10b5_1), p.r.form === "4/A", p.r.filingDate, p.r.accessionNumber]);
    }
  }
  const sum = (code) => out.filter((r) => r[3] === code && r[11] === "stock");
  const agg = (rs) => ({ transactions: rs.length, shares: round(rs.reduce((s, r) => s + (r[6] ?? 0), 0), 2), value: round(rs.reduce((s, r) => s + (r[8] ?? 0), 0), 2), insiders: new Set(rs.map((r) => r[1])).size });
  return {
    ...entityOut(e, sub),
    window: { since, until },
    form4_filings: { in_window: f4.length, read: take.length, ...(f4.length > take.length ? { not_read: f4.length - take.length, hint: "raise max_filings or narrow the dates" } : {}) },
    summary: { open_market_purchases: agg(sum("P")), open_market_sales: agg(sum("S")), tax_withholding: agg(sum("F")), option_exercises: agg(sum("M")), grants: agg(sum("A")) },
    columns: ["date", "insider", "role", "code", "meaning", "acq_disp", "shares", "price", "value", "owned_after", "ownership", "kind", "plan_10b5_1", "amendment", "filed", "accession"],
    rows: out.sort((x, y) => (y[0] ?? "").localeCompare(x[0] ?? "")),
    ...(errors.length ? { unreadable: errors } : {}),
    meaning: "Only code P (purchase) and S (sale) are open-market decisions; A, M, F and G are grants, exercises, tax withholding and gifts. A sale under a 10b5-1 plan was scheduled in advance.",
    source: `https://www.sec.gov/cgi-bin/own-disp?action=getissuer&CIK=${String(e.cik).padStart(10, "0")}`,
    limits: [...SEC_LIMITS, "Form 4 is due within two business days of a trade; earlier trades may still be unreported, and Form 5 (annual) filings are not read."],
  };
}

// ---------------------------------------------------------------------------------------------
// fund_holdings (13F)
// ---------------------------------------------------------------------------------------------
export const holdingsInput = z.object({
  manager: z.string().min(1).max(120).describe("The 13F filer: name (\"Berkshire Hathaway\", \"Bridgewater Associates\"), ticker or CIK."),
  period: DATE.optional().describe("Quarter end, for example 2026-06-30; default the latest filed."),
  top: z.number().int().min(1).max(500).optional().describe("Most positions to list, by value; default 25."),
  compare: z.boolean().optional().describe("Also compare with the previous quarter's filing; default true."),
}).strict();

function aggregate(rows) {
  const by = new Map();
  for (const r of rows) {
    const k = `${r.cusip}|${r.put_call ?? ""}|${r.share_type ?? ""}`;
    const g = by.get(k) ?? { issuer: r.issuer, class: r.class, cusip: r.cusip, put_call: r.put_call, share_type: r.share_type, value: 0, shares: 0 };
    g.value += r.value ?? 0; g.shares += r.shares ?? 0;
    by.set(k, g);
  }
  return [...by.values()].sort((a, b) => b.value - a.value);
}

async function load13F(session, cik, filing) {
  const docs = await filingDocuments(session, cik, filing.accessionNumber);
  const table = docs.find((d) => /information table/i.test(d.type ?? "") && /\.xml$/i.test(d.name)) ?? docs.find((d) => /\.xml$/i.test(d.name) && !/primary_doc/i.test(d.name));
  if (!table) throw new NotFound(`13F ${filing.accessionNumber} has no information table document.`);
  const rows = parse13F(await getText(session, table.url, { maxBytes: 32 * 1024 * 1024 }));
  let cover = null;
  try {
    const xml = await getText(session, `${archiveBase(cik, filing.accessionNumber)}/primary_doc.xml`, { maxBytes: 2 * 1024 * 1024 });
    const n = (tag) => { const m = xml.match(new RegExp(`<(?:\\w+:)?${tag}>([^<]*)<`)); return m ? Number(m[1]) : null; };
    cover = { entries: n("tableEntryTotal"), value: n("tableValueTotal") };
  } catch { /* the cover page is a cross-check only */ }
  return { rows, url: table.url, cover };
}

export async function fundHoldings(session, args) {
  const a = holdingsInput.parse(args);
  const e = await resolveEntity(session, a.manager);
  const { sub, rows } = await filings(session, e.cik, { since: a.period ? `${Number(a.period.slice(0, 4)) - 1}-01-01` : undefined });
  const all13 = rows.filter((r) => r.form === "13F-HR");
  if (!all13.length) throw new NotFound(`${sub.name} has filed no 13F-HR (only managers of $100 million or more in US-listed equities file them).`);
  const i = a.period ? all13.findIndex((r) => r.reportDate === a.period) : 0;
  if (i < 0) throw new NotFound(`${sub.name} has no 13F-HR for the quarter ending ${a.period}; it has ${all13.slice(0, 8).map((r) => r.reportDate).join(", ")}.`);
  const cur = all13[i];
  const h = await load13F(session, e.cik, cur);
  const pos = aggregate(h.rows);
  const total = pos.reduce((s, p) => s + p.value, 0);
  const top = a.top ?? 25;
  const out = {
    manager: entityOut(e, sub),
    period: cur.reportDate, filed: cur.filingDate, accession: cur.accessionNumber,
    total_value: total, positions: pos.length, rows_in_table: h.rows.length,
    ...(h.cover ? { matches_cover_page: h.cover.value === Math.round(h.rows.reduce((s, r) => s + (r.value ?? 0), 0)) && h.cover.entries === h.rows.length, cover_page: h.cover } : {}),
    columns: ["issuer", "class", "cusip", "put_call", "value", "shares", "weight"],
    rows: pos.slice(0, top).map((p) => [p.issuer, p.class, p.cusip, p.put_call, p.value, p.shares, round(p.value / total, 4)]),
  };
  if (a.compare !== false && all13[i + 1]) {
    const prev = all13[i + 1];
    const ph = await load13F(session, e.cik, prev);
    const pp = new Map(aggregate(ph.rows).map((p) => [`${p.cusip}|${p.put_call ?? ""}|${p.share_type ?? ""}`, p]));
    const cc = new Map(pos.map((p) => [`${p.cusip}|${p.put_call ?? ""}|${p.share_type ?? ""}`, p]));
    const changes = [];
    for (const [k, p] of cc) {
      const q = pp.get(k);
      if (!q) changes.push(["new", p.issuer, p.cusip, p.put_call, 0, p.shares, p.value]);
      else if (p.shares !== q.shares) changes.push([p.shares > q.shares ? "added" : "reduced", p.issuer, p.cusip, p.put_call, q.shares, p.shares, p.value]);
    }
    for (const [k, q] of pp) if (!cc.has(k)) changes.push(["exited", q.issuer, q.cusip, q.put_call, q.shares, 0, 0]);
    const order = { new: 0, exited: 1, added: 2, reduced: 3 };
    changes.sort((x, y) => order[x[0]] - order[y[0]] || y[6] - x[6]);
    out.changes_since = { period: prev.reportDate, accession: prev.accessionNumber, columns: ["change", "issuer", "cusip", "put_call", "shares_before", "shares_now", "value_now"], rows: changes.slice(0, Math.max(top, 25)), counts: Object.fromEntries(Object.keys(order).map((k) => [k, changes.filter((c) => c[0] === k).length])) };
  }
  out.source = h.url;
  out.limits = [...SEC_LIMITS, "A 13F lists long positions in US-listed equities and options at quarter end, filed up to 45 days later; it omits shorts, cash, most non-US holdings and positions granted confidential treatment. Values are in dollars as filed; amendments (13F-HR/A) are not merged."];
  return out;
}

// ---------------------------------------------------------------------------------------------
// treasury_yields
// ---------------------------------------------------------------------------------------------
export const treasuryInput = z.object({
  curve: z.enum(["nominal", "real", "bills"]).optional().describe("nominal (par yield curve, 1 month to 30 years; default), real (TIPS), or bills."),
  date: DATE.optional().describe("One day (the latest on or before it). Default: the latest published."),
  start: DATE.optional().describe("A range instead of one day: first date."),
  end: DATE.optional().describe("Last date of the range; default today."),
}).strict();
export async function treasuryYields(session, args) {
  const a = treasuryInput.parse(args);
  const curve = a.curve ?? "nominal";
  const ranged = Boolean(a.start);
  const last = (a.end ?? a.date ?? today(session));
  const first = a.start ?? `${Number(last.slice(0, 4)) - (a.date ? 1 : 0)}-01-01`;
  const years = [];
  for (let y = Number(last.slice(0, 4)); y >= Number(first.slice(0, 4)); y--) years.push(y);
  if (years.length > 40) throw new Error("treasury_yields reads at most 40 years at once.");
  let header = null, rows = [], url = null;
  for (const y of years) {
    let t;
    try { t = await treasuryYear(session, y, curve); } catch (err) { if (err instanceof NotFound) continue; throw err; }
    header = header ?? t.header; url = url ?? t.url;
    rows = rows.concat(t.rows.filter((r) => r[0] >= first && r[0] <= last));
    if (!ranged && rows.length) break;
  }
  if (!rows.length) throw new NotFound(`No ${curve} Treasury rates between ${first} and ${last}.`);
  rows.sort((x, y) => x[0].localeCompare(y[0]));
  const cols = ["date", ...header.slice(1)];
  const base = { curve, units: "percent a year", columns: cols, source: url, limits: ["U.S. Department of the Treasury daily rates, as published; par yields on a bond-equivalent basis.", "Not investment advice."] };
  if (!ranged) return { ...base, date: rows[rows.length - 1][0], rows: [rows[rows.length - 1]] };
  return { ...base, start: rows[0][0], end: rows[rows.length - 1][0], count: rows.length, rows: rows.slice(-2000), ...(rows.length > 2000 ? { truncated_to_last: 2000 } : {}) };
}

// ---------------------------------------------------------------------------------------------
// economic_series (FRED)
// ---------------------------------------------------------------------------------------------
// Common series by the words people use; any FRED id also works.
export const COMMON_SERIES = Object.freeze([
  ["CPIAUCSL", "cpi consumer price index inflation all items"], ["CPILFESL", "core cpi inflation excluding food energy"], ["PCEPI", "pce price index inflation"], ["PCEPILFE", "core pce inflation"],
  ["UNRATE", "unemployment rate"], ["PAYEMS", "nonfarm payrolls jobs employment"], ["ICSA", "initial jobless claims unemployment insurance"], ["JTSJOL", "job openings jolts"],
  ["GDP", "gdp gross domestic product nominal"], ["GDPC1", "real gdp gross domestic product"], ["A191RL1Q225SBEA", "real gdp growth rate quarterly annualized"],
  ["FEDFUNDS", "federal funds rate effective monthly"], ["DFF", "federal funds rate effective daily"], ["SOFR", "sofr secured overnight financing rate"], ["DFEDTARU", "fed funds target upper"],
  ["DGS3MO", "3 month treasury yield"], ["DGS2", "2 year treasury yield"], ["DGS5", "5 year treasury yield"], ["DGS10", "10 year treasury yield"], ["DGS30", "30 year treasury yield"],
  ["T10Y2Y", "10 year minus 2 year treasury spread yield curve"], ["T10Y3M", "10 year minus 3 month spread yield curve"], ["DFII10", "10 year real yield tips"], ["T10YIE", "10 year breakeven inflation"],
  ["BAMLH0A0HYM2", "high yield credit spread option adjusted"], ["BAMLC0A0CM", "investment grade corporate credit spread"], ["MORTGAGE30US", "30 year mortgage rate"],
  ["VIXCLS", "vix volatility index"], ["DCOILWTICO", "wti crude oil price"], ["DCOILBRENTEU", "brent crude oil price"], ["GOLDAMGBD228NLBM", "gold price london"],
  ["DTWEXBGS", "dollar index broad trade weighted usd"], ["DEXUSEU", "euro dollar exchange rate eur usd"], ["DEXJPUS", "yen dollar exchange rate usd jpy"], ["DEXCHUS", "yuan dollar exchange rate usd cny"],
  ["M2SL", "m2 money supply"], ["WALCL", "fed balance sheet total assets"], ["RRPONTSYD", "overnight reverse repo"],
  ["INDPRO", "industrial production"], ["RSAFS", "retail sales"], ["HOUST", "housing starts"], ["CSUSHPINSA", "case shiller home price index"], ["UMCSENT", "consumer sentiment michigan"],
  ["USREC", "us recession indicator nber"], ["RECPROUSM156N", "recession probability smoothed"], ["SP500", "s&p 500 index level"], ["NASDAQCOM", "nasdaq composite index"],
]);
function resolveSeries(q) {
  const s = String(q).trim();
  if (/^[A-Z0-9_]{2,40}$/.test(s)) return { id: s };
  const words = s.toLowerCase().match(/[a-z0-9&]+/g) ?? [];
  const scored = COMMON_SERIES.map(([id, text]) => [id, words.filter((w) => text.split(" ").includes(w)).length / words.length]).sort((a, b) => b[1] - a[1]);
  if (!scored.length || scored[0][1] < 0.5) throw new NotFound(`No common series matches "${q}"; pass a FRED series id (find it at fred.stlouisfed.org). Common: ${COMMON_SERIES.slice(0, 12).map((c) => c[0]).join(", ")}.`);
  return { id: scored[0][0], matched_from: s };
}
export const fredInput = z.object({
  series: z.string().min(1).max(80).describe("A FRED series id (DGS10, CPIAUCSL, UNRATE) or plain words (\"core inflation\", \"10 year treasury yield\")."),
  start: DATE.optional(), end: DATE.optional(),
  transform: z.enum(["level", "change", "pct_change", "yoy"]).optional().describe("level (default), change from the previous observation, pct_change (fraction), or yoy (fraction against the value a year earlier)."),
  last: z.number().int().min(1).max(100000).optional().describe("Only the most recent n observations."),
}).strict();
export async function economicSeries(session, args) {
  const a = fredInput.parse(args);
  const { id, matched_from: matched } = resolveSeries(a.series);
  // yoy needs a year before start.
  const fetchStart = a.start && a.transform === "yoy" ? `${Number(a.start.slice(0, 4)) - 1}${a.start.slice(4)}` : a.start;
  const [data, title] = await Promise.all([fredCsv(session, id, { start: fetchStart, end: a.end }), fredTitle(session, id)]);
  let rows = data.rows.filter((r) => r[1] != null);
  const tf = a.transform ?? "level";
  if (tf === "change" || tf === "pct_change") rows = rows.slice(1).map((r, i) => [r[0], tf === "change" ? round(r[1] - rows[i][1], 6) : round(r[1] / rows[i][1] - 1, 6)]);
  else if (tf === "yoy") {
    const byDate = new Map(rows.map((r) => [r[0], r[1]]));
    rows = rows.map((r) => { const d = `${Number(r[0].slice(0, 4)) - 1}${r[0].slice(4)}`; const p = byDate.get(d); return p == null ? null : [r[0], round(r[1] / p - 1, 6)]; }).filter(Boolean);
  }
  if (a.start) rows = rows.filter((r) => r[0] >= a.start);
  if (a.last) rows = rows.slice(-a.last);
  const cap = 5000;
  const cut = rows.length > cap;
  if (cut) rows = rows.slice(-cap);
  return {
    series: id, ...(matched ? { matched_from: matched } : {}), title, transform: tf, count: rows.length,
    latest: rows.length ? { date: rows[rows.length - 1][0], value: rows[rows.length - 1][1] } : null,
    dates: rows.map((r) => r[0]), values: rows.map((r) => r[1]),
    ...(cut ? { truncated_to_last: cap } : {}),
    source: data.url,
    limits: ["Federal Reserve Bank of St. Louis (FRED) as published; recent values of many series are revised later.", "Some series are copyrighted by their sources; see the source page before republishing.", "Not investment advice."],
  };
}

// ---------------------------------------------------------------------------------------------
// price_history (the user's Alpaca or Tiingo key)
// ---------------------------------------------------------------------------------------------
export const priceInput = z.object({
  symbol: z.string().regex(/^[A-Za-z0-9.\-/^]{1,15}$/, "a ticker such as AAPL or BRK.B").describe("Ticker, for example AAPL."),
  start: DATE.optional().describe("First date; default one year ago."),
  end: DATE.optional().describe("Last date; default today."),
  interval: z.enum(["1Day", "1Week", "1Month", "1Hour"]).optional().describe("Bar size; default 1Day (1Hour needs Alpaca)."),
  adjusted: z.boolean().optional().describe("Split- and dividend-adjusted; default true."),
}).strict();

function priceProvider(env) {
  const alpacaId = env.ALPACA_API_KEY_ID ?? env.APCA_API_KEY_ID ?? env.ALPACA_PAPER_KEY_ID;
  const alpacaSecret = env.ALPACA_API_SECRET_KEY ?? env.APCA_API_SECRET_KEY ?? env.ALPACA_PAPER_SECRET_KEY;
  if (alpacaId && alpacaSecret) return { name: "alpaca", id: alpacaId, secret: alpacaSecret, feed: env.ALPACA_DATA_FEED ?? "iex" };
  if (env.TIINGO_API_KEY) return { name: "tiingo", key: env.TIINGO_API_KEY };
  if (/^(0|false|no)$/i.test(String(env.CANLI_KEYLESS_PRICES ?? ""))) return null;
  return { name: "yahoo" };
}

// Yahoo Finance's public chart endpoint: no key, unofficial, for personal use under Yahoo's terms.
// "close" there is split-adjusted; "adjclose" also adjusts for dividends, and open, high and low are
// scaled by the same ratio when adjusted bars are asked for.
async function yahooBars(session, symbol, { start, end, interval, adjusted }) {
  const sym = symbol.replace(/\./g, "-");
  const iv = { "1Day": "1d", "1Week": "1wk", "1Month": "1mo", "1Hour": "1h" }[interval];
  const p1 = Math.floor(Date.parse(`${start}T00:00:00Z`) / 1000), p2 = Math.floor(Date.parse(`${end}T23:59:59Z`) / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?period1=${p1}&period2=${p2}&interval=${iv}&events=div%2Csplit&includeAdjustedClose=true`;
  let r;
  try { r = await getJson(session, url); } catch (err) { if (err instanceof NotFound) throw new NotFound(`Yahoo Finance has no prices for ${symbol}.`); throw err; }
  const res = r?.chart?.result?.[0];
  if (!res || !res.timestamp) throw new NotFound(`Yahoo Finance has no ${interval} bars for ${symbol} between ${start} and ${end}${r?.chart?.error?.description ? ` (${r.chart.error.description})` : ""}.`);
  const q = res.indicators.quote[0], adj = res.indicators.adjclose?.[0]?.adjclose, off = (res.meta.gmtoffset ?? 0) * 1000;
  const stamp = (t) => new Date(t * 1000 + off).toISOString().slice(0, interval === "1Hour" ? 16 : 10);
  const bars = [];
  res.timestamp.forEach((t, i) => {
    if (q.close[i] == null) return;
    const k = adjusted && adj && adj[i] != null && q.close[i] ? adj[i] / q.close[i] : 1;
    const f = (v) => (v == null ? null : round(v * k, 4));
    bars.push([stamp(t), f(q.open[i]), f(q.high[i]), f(q.low[i]), f(q.close[i]), q.volume[i]]);
  });
  const ev = res.events ?? {};
  const dividends = Object.values(ev.dividends ?? {}).sort((a, b) => a.date - b.date).map((d) => [stamp(d.date).slice(0, 10), d.amount]);
  const splits = Object.values(ev.splits ?? {}).sort((a, b) => a.date - b.date).map((d) => [stamp(d.date).slice(0, 10), `${d.numerator}:${d.denominator}`]);
  return { bars, dividends, splits, currency: res.meta.currency ?? null, exchange: res.meta.fullExchangeName ?? res.meta.exchangeName ?? null };
}
export async function priceHistory(session, args) {
  const a = priceInput.parse(args);
  const p = priceProvider(session.env);
  if (!p) throw new Error("Keyless prices are off (CANLI_KEYLESS_PRICES=0). Set ALPACA_API_KEY_ID and ALPACA_API_SECRET_KEY (a free Alpaca account; paper keys work) or TIINGO_API_KEY, or pass prices to the analysis tools as a CSV file.");
  const symbol = a.symbol.toUpperCase();
  const start = a.start ?? daysAgo(session, 365), end = a.end ?? today(session);
  const interval = a.interval ?? "1Day", adjusted = a.adjusted !== false;
  let bars = [];
  let source, extra = {};
  if (p.name === "yahoo") {
    const y = await yahooBars(session, symbol, { start, end, interval, adjusted });
    bars = y.bars;
    extra = { currency: y.currency, exchange: y.exchange, dividends: y.dividends, splits: y.splits };
    source = "Yahoo Finance chart data (no key)";
  } else if (p.name === "alpaca") {
    let token = null, pages = 0;
    do {
      const q = new URLSearchParams({ symbols: symbol, timeframe: interval, start, end, adjustment: adjusted ? "all" : "raw", feed: p.feed, limit: "10000", sort: "asc" });
      if (token) q.set("page_token", token);
      const r = await getJson(session, `https://data.alpaca.markets/v2/stocks/bars?${q}`, { headers: { "APCA-API-KEY-ID": p.id, "APCA-API-SECRET-KEY": p.secret }, secret: true });
      for (const b of r.bars?.[symbol] ?? []) bars.push([b.t.slice(0, interval === "1Hour" ? 16 : 10), b.o, b.h, b.l, b.c, b.v]);
      token = r.next_page_token;
    } while (token && ++pages < 20);
    source = `Alpaca market data (${p.feed} feed)`;
  } else {
    if (interval === "1Hour") throw new Error("1Hour bars need Alpaca; Tiingo's end-of-day prices are daily.");
    const freq = { "1Day": "daily", "1Week": "weekly", "1Month": "monthly" }[interval];
    const q = new URLSearchParams({ startDate: start, endDate: end, resampleFreq: freq });
    const r = await getJson(session, `https://api.tiingo.com/tiingo/daily/${encodeURIComponent(symbol)}/prices?${q}`, { headers: { Authorization: `Token ${p.key}` }, secret: true });
    for (const b of r ?? []) bars.push(adjusted ? [b.date.slice(0, 10), b.adjOpen, b.adjHigh, b.adjLow, b.adjClose, b.adjVolume] : [b.date.slice(0, 10), b.open, b.high, b.low, b.close, b.volume]);
    source = "Tiingo end-of-day prices";
  }
  if (!bars.length) throw new NotFound(`${source} returned no ${interval} bars for ${symbol} between ${start} and ${end}.`);
  return {
    symbol, interval, adjusted, start: bars[0][0], end: bars[bars.length - 1][0], count: bars.length,
    dates: bars.map((b) => b[0]), open: bars.map((b) => b[1]), high: bars.map((b) => b[2]), low: bars.map((b) => b[3]), close: bars.map((b) => b[4]), volume: bars.map((b) => b[5]),
    ...extra,
    source,
    limits: [
      p.name === "yahoo" ? "Yahoo Finance's public chart data: unofficial, for personal use under Yahoo's terms, and it can change or stop without notice. Set ALPACA_API_KEY_ID/ALPACA_API_SECRET_KEY or TIINGO_API_KEY to use your own account instead, or CANLI_KEYLESS_PRICES=0 to turn it off."
        : p.name === "alpaca" && p.feed === "iex" ? "Alpaca's free IEX feed: prices are IEX trades, so volume is IEX volume only (a few percent of the consolidated tape)." : `${source} under your own account's terms.`,
      "Not investment advice.",
    ],
  };
}
