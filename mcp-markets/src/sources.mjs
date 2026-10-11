// Where the data comes from, and how it is fetched: SEC EDGAR, the US Treasury and FRED with no
// key, prices with the user's own Alpaca or Tiingo key. One session holds the cache and the SEC
// rate limit (SEC asks for at most 10 requests a second; this stays at 8).
import { AsyncLocalStorage } from "node:async_hooks";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";

import { BoundedCache } from "./bounded-cache.mjs";
import { fetchBoundedText, ResponseReadError } from "./bounded-response.mjs";

// SEC asks every client to identify itself with a contact; SEC_USER_AGENT replaces the default.
// Other hosts get the plain product name: Treasury's servers hold any request whose User-Agent
// contains a URL for about 18 seconds (measured 2026-10-09).
export const DEFAULT_USER_AGENT = "Canli Capital canli-markets-mcp (+https://canlicapital.com/developers)";
export const PLAIN_USER_AGENT = "canli-markets-mcp";
const TIMEOUT_MS = 20000;
const SEC_GAP_MS = 125;

export function createSession({ fetchImpl, env = process.env, now = () => Date.now(), sleep } = {}) {
  return {
    fetchImpl: fetchImpl ?? fetch,
    env,
    now,
    sleep: sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
    userAgent: String(env.SEC_USER_AGENT ?? "").trim() || DEFAULT_USER_AGENT,
    cache: new BoundedCache(),
    hashes: new Map(),
    secNext: 0,
  };
}

const isSec = (url) => /^https:\/\/(www|data|efts)\.sec\.gov\//.test(url);
// The OECD's data service throttles bursts of queries with HTTP 500s: its requests are spaced
// OECD_GAP_MS apart and retried after longer waits.
const isOecd = (url) => url.startsWith("https://sdmx.oecd.org/");
const OECD_GAP_MS = 1500;
const host = (url) => new URL(url).host;

// Spaces SEC requests SEC_GAP_MS apart across concurrent callers (and OECD requests OECD_GAP_MS).
async function secTurn(session, gap = SEC_GAP_MS, key = "secNext") {
  const t = session.now();
  const at = Math.max(t, session[key] ?? 0);
  session[key] = at + gap;
  if (at > t) await session.sleep(at - t);
}

// The message a failed request turns into. A URL carrying a key is never echoed back.
function fetchError(error, { url, secret, aborted, maxBytes }) {
  const where = secret ? host(url) : url;
  if (aborted) return new Error(`${where} did not answer within ${TIMEOUT_MS / 1000} s; retry in a moment.`);
  if (error instanceof ResponseReadError) {
    if (error.code === "HTTP" && error.status === 404) return new NotFound(`${where} was not found.`);
    if (error.code === "HTTP" && (error.status === 403 || error.status === 429) && isSec(url)) return new Error(`SEC refused the request (HTTP ${error.status}). SEC limits clients to 10 requests a second and asks for a contact in the User-Agent: set SEC_USER_AGENT to "Your Name you@example.com".`);
    if (error.code === "HTTP" && (error.status === 401 || error.status === 403)) return new Error(`${host(url)} refused the key (HTTP ${error.status}).`);
    if (error.code === "HTTP" && error.status >= 500) return new Error(`${where} returned HTTP ${error.status}; the service may be busy (some throttle bursts of queries), so retry in a minute.`);
    if (error.code === "HTTP") return new Error(`${where} returned HTTP ${error.status}.`);
    if (error.code === "TOO_LARGE") return new Error(`${where} is larger than ${Math.round(maxBytes / 1048576)} MB; not read.`);
  }
  return new Error(`${where} could not be reached (${error?.message ?? error}).`);
}

// Fetches text, cached for the session. `transform` (string to string) runs before caching, so a
// 2 MB filing is kept as its text, not its HTML; `parse` runs on every read, cached or not.
// Evidence: every document a tool call reads, with the SHA-256 of the exact bytes received and
// when, so any figure can be checked against the same document later. Collected per call.
export const evidenceScope = new AsyncLocalStorage();
const MAX_HASHES = 4096;
function witness(session, url, record) {
  if (record) evidenceScope.getStore()?.set(url, record);
}

// A read-only query some sources take only as a POST body (FINRA's query API) is cached and
// witnessed under "POST <url> <body>", so the evidence names the exact query.
export async function getText(session, url, { headers = {}, maxBytes = 16 * 1024 * 1024, transform, parse = (t) => t, secret = false, method = "GET", body } = {}) {
  const key = method === "GET" ? url : `${method} ${url} ${body ?? ""}`;
  const hit = session.cache.lookup(key, session.now());
  if (hit) { witness(session, key, session.hashes.get(key)); return parse(hit.text); }
  let text;
  // Server errors are often momentary (EDGAR full-text search answered 1 request in 12 with HTTP 500
  // on 2026-10-09): retry them, and dropped connections, twice with a short backoff.
  for (let attempt = 0; ; attempt++) {
    if (isSec(url)) await secTurn(session);
    if (isOecd(url)) await secTurn(session, OECD_GAP_MS, "oecdNext");
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    try {
      text = await fetchBoundedText(session.fetchImpl, url, { signal, maxBytes, method, body, headers: { "User-Agent": isSec(url) ? session.userAgent : PLAIN_USER_AGENT, ...headers } });
      break;
    } catch (error) {
      const transient = !signal.aborted && (error instanceof ResponseReadError ? error.code === "HTTP" && error.status >= 500 : true);
      if (transient && attempt < 2) { await session.sleep((isOecd(url) ? 4000 : 500) * 3 ** attempt); continue; }
      throw fetchError(error, { url, secret, aborted: signal.aborted, maxBytes });
    }
  }
  const record = { sha256: createHash("sha256").update(text).digest("hex"), bytes: Buffer.byteLength(text, "utf8"), retrieved_at: new Date(session.now()).toISOString() };
  session.hashes.delete(key);
  session.hashes.set(key, record);
  if (session.hashes.size > MAX_HASHES) session.hashes.delete(session.hashes.keys().next().value);
  witness(session, key, record);
  if (transform) text = transform(text);
  const value = parse(text);
  session.cache.set(key, { at: session.now(), text });
  return value;
}

export class NotFound extends Error {}

// A lookup table's own entry for a key from a request, never an inherited property ("constructor").
export const own = (map, key) => (Object.hasOwn(map, key) ? map[key] : undefined);

export async function getJson(session, url, opts = {}) {
  return getText(session, url, { ...opts, parse: (t) => { try { return JSON.parse(t); } catch { throw new Error(`${opts.secret ? host(url) : url} did not return JSON.`); } } });
}

// The one text file in a zip archive (SEC's fails-to-deliver files): the archive's bytes are
// witnessed and the unzipped text cached. Stored and deflated entries are read; nothing else.
export function unzipFirst(bytes, { maxText = 64 * 1024 * 1024 } = {}) {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // End of central directory: signature 0x06054b50 within the last 64 KB.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("not a zip archive");
  const cd = buf.readUInt32LE(eocd + 16);
  if (cd + 46 > buf.length || buf.readUInt32LE(cd) !== 0x02014b50) throw new Error("zip central directory not found");
  // Central directory header: method at +10, compressed size at +20, uncompressed at +24, local header offset at +42.
  const method = buf.readUInt16LE(cd + 10), compressed = buf.readUInt32LE(cd + 20), size = buf.readUInt32LE(cd + 24), local = buf.readUInt32LE(cd + 42);
  if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) throw new Error("zip entry not found");
  const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
  if (start + compressed > buf.length) throw new Error("zip entry runs past the archive");
  const data = buf.subarray(start, start + compressed);
  if (size > maxText) throw new Error(`zip entry is ${size} bytes, above ${maxText}`);
  const out = method === 0 ? data : method === 8 ? inflateRawSync(data, { maxOutputLength: maxText }) : null;
  if (!out) throw new Error(`zip compression method ${method} is not supported`);
  return out.toString("utf8");
}

export async function getZipText(session, url, { maxBytes = 16 * 1024 * 1024 } = {}) {
  const hit = session.cache.lookup(url, session.now());
  if (hit) { witness(session, url, session.hashes.get(url)); return hit.text; }
  let bytes;
  for (let attempt = 0; ; attempt++) {
    if (isSec(url)) await secTurn(session);
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    try {
      bytes = await fetchBoundedText(session.fetchImpl, url, { signal, maxBytes, as: "bytes", headers: { "User-Agent": isSec(url) ? session.userAgent : PLAIN_USER_AGENT } });
      break;
    } catch (error) {
      const transient = !signal.aborted && (error instanceof ResponseReadError ? error.code === "HTTP" && error.status >= 500 : true);
      if (transient && attempt < 2) { await session.sleep(500 * 3 ** attempt); continue; }
      throw fetchError(error, { url, aborted: signal.aborted, maxBytes });
    }
  }
  const record = { sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.byteLength, retrieved_at: new Date(session.now()).toISOString() };
  session.hashes.set(url, record);
  witness(session, url, record);
  const text = unzipFirst(bytes);
  session.cache.set(url, { at: session.now(), text });
  return text;
}

// A read-only JSON query sent as a POST body.
export async function postJson(session, url, payload, opts = {}) {
  return getJson(session, url, { ...opts, method: "POST", body: JSON.stringify(payload), headers: { "Content-Type": "application/json", Accept: "application/json", ...(opts.headers ?? {}) } });
}

// ---------------------------------------------------------------------------------------------
// SEC EDGAR
// ---------------------------------------------------------------------------------------------

export const pad10 = (cik) => String(Number(cik)).padStart(10, "0");
export const archiveBase = (cik, accession) => `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${String(accession).replace(/-/g, "")}`;

export async function tickerTable(session) {
  return getJson(session, "https://www.sec.gov/files/company_tickers.json");
}

// Names people use that are not the registered name: listed companies by ticker, and fund managers
// by the filer their 13Fs come from (checked on EDGAR 2026-10-11).
const KNOWN_AS = Object.freeze({
  google: "GOOGL", youtube: "GOOGL", facebook: "META", instagram: "META", whatsapp: "META", "p and g": "PG", bofa: "BAC", tsmc: "TSM",
  vanguard: { cik: 102909, name: "VANGUARD GROUP INC" }, fidelity: { cik: 315066, name: "FMR LLC" }, "fidelity investments": { cik: 315066, name: "FMR LLC" },
  citadel: { cik: 1423053, name: "CITADEL ADVISORS LLC" }, "de shaw": { cik: 1009207, name: "D. E. Shaw & Co., Inc." }, "d e shaw": { cik: 1009207, name: "D. E. Shaw & Co., Inc." },
  bridgewater: { cik: 1350694, name: "Bridgewater Associates, LP" }, renaissance: { cik: 1037389, name: "RENAISSANCE TECHNOLOGIES LLC" },
  "two sigma": { cik: 1179392, name: "TWO SIGMA INVESTMENTS, LP" }, millennium: { cik: 1273087, name: "MILLENNIUM MANAGEMENT LLC" },
  point72: { cik: 1603466, name: "Point72 Asset Management, L.P." }, elliott: { cik: 1791786, name: "Elliott Investment Management L.P." },
  "pershing square": { cik: 1336528, name: "Pershing Square Capital Management, L.P." }, "tiger global": { cik: 1167483, name: "TIGER GLOBAL MANAGEMENT LLC" },
  soros: { cik: 1029160, name: "SOROS FUND MANAGEMENT LLC" }, "ark invest": { cik: 1697748, name: "ARK Investment Management LLC" },
  baupost: { cik: 1061768, name: "BAUPOST GROUP LLC/MA" }, "lone pine": { cik: 1061165, name: "LONE PINE CAPITAL LLC" },
});
const SUFFIXES = new Set(["inc", "corp", "corporation", "co", "company", "companies", "plc", "ltd", "limited", "the", "holdings", "holding", "group", "sa", "nv", "ag", "se"]);
const knownAs = (name) => (Object.hasOwn(KNOWN_AS, name) ? KNOWN_AS[name] : null);
const nameWords = (s) => String(s).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w && !SUFFIXES.has(w));

// A listed company whose registered name starts with the words asked for. The SEC's ticker file
// lists the largest companies first and each company's common shares before its other classes, so
// "apple" is Apple Inc., not Apple Hospitality REIT, and "jp morgan" is JPMorgan Chase (JPM). A name
// found only inside another ("vanguard" in American Vanguard) is left to EDGAR's search.
export function listedByName(table, q) {
  const words = nameWords(q), joined = words.join("");
  if (!joined) return [];
  const known = knownAs(words.join(" "));
  if (known && typeof known !== "string") return [];
  const rows = Object.values(table).filter((row) => {
    if (known) return row.ticker === known;
    const title = nameWords(row.title);
    return words.every((w, i) => title[i] === w) || (joined.length >= 5 && title.join("").startsWith(joined));
  });
  const seen = new Set();
  return rows.filter((row) => !seen.has(row.cik_str) && seen.add(row.cik_str));
}

// A company or fund by ticker, CIK or name. A name is looked for among listed companies first, then
// in EDGAR's entity search, which also knows filers with no ticker (most fund managers).
export async function resolveEntity(session, query) {
  const q = String(query ?? "").trim();
  if (!q) throw new Error("Name a company: a ticker (AAPL), a CIK (320193) or a name (Apple).");
  if (/^\d{1,10}$/.test(q)) return { cik: Number(q), name: null, ticker: null, matched_by: "cik" };
  const table = await tickerTable(session);
  const want = q.toUpperCase().replace(/\./g, "-").replace(/^\$/, "");
  for (const row of Object.values(table)) if (row.ticker === want) return { cik: row.cik_str, name: row.title, ticker: row.ticker, matched_by: "ticker" };
  const filer = knownAs(nameWords(q).join(" "));
  if (filer && typeof filer !== "string") return { cik: filer.cik, name: filer.name, ticker: null, matched_by: "name" };
  const listed = listedByName(table, q);
  if (listed.length) {
    const [top, ...others] = listed;
    return {
      cik: top.cik_str, name: top.title, ticker: top.ticker, matched_by: "name",
      ...(others.length ? { other_matches: others.slice(0, 4).map((r) => ({ cik: r.cik_str, name: r.title, ticker: r.ticker })) } : {}),
    };
  }
  const found = await getJson(session, `https://efts.sec.gov/LATEST/search-index?keysTyped=${encodeURIComponent(q)}`);
  const hits = found?.hits?.hits ?? [];
  if (!hits.length) throw new NotFound(`No SEC filer matches "${q}". Try the ticker, the CIK, or the name as registered (for example "Berkshire Hathaway").`);
  const top = hits[0];
  // A company's common shares come first in the ticker file.
  const byCik = new Map();
  for (const r of Object.values(table)) if (!byCik.has(r.cik_str)) byCik.set(r.cik_str, r.ticker);
  return {
    cik: Number(top._id), name: top._source.entity, ticker: byCik.get(Number(top._id)) ?? null, matched_by: "name",
    ...(hits.length > 1 ? { other_matches: hits.slice(1, 5).map((h) => ({ cik: Number(h._id), name: h._source.entity })) } : {}),
  };
}

export async function submissions(session, cik) {
  return getJson(session, `https://data.sec.gov/submissions/CIK${pad10(cik)}.json`);
}

const FILING_FIELDS = ["accessionNumber", "filingDate", "reportDate", "form", "primaryDocument", "primaryDocDescription", "items"];
function filingRows(block) {
  const n = block?.accessionNumber?.length ?? 0;
  const out = [];
  for (let i = 0; i < n; i++) out.push(Object.fromEntries(FILING_FIELDS.map((f) => [f, block[f]?.[i] ?? null])));
  return out;
}

// Filings newest first: the recent block (at least a year, up to 1,000 filings), then older pages
// only while they may hold filings on or after `since`.
export async function filings(session, cik, { since } = {}) {
  const sub = await submissions(session, cik);
  let rows = filingRows(sub.filings?.recent);
  if (since) {
    for (const f of sub.filings?.files ?? []) {
      const oldest = rows.length ? rows[rows.length - 1].filingDate : null;
      if (oldest && oldest < since) break;
      if (f.filingTo && f.filingTo < since) break;
      rows = rows.concat(filingRows(await getJson(session, `https://data.sec.gov/submissions/${f.name}`)));
    }
  }
  return { sub, rows };
}

// The documents in a filing, with their SEC types (10-K, EX-99.1, ...), from the filing index page.
export async function filingDocuments(session, cik, accession) {
  const base = archiveBase(cik, accession);
  const acc = String(accession);
  const html = await getText(session, `${base}/${acc}-index.htm`, { maxBytes: 4 * 1024 * 1024 });
  const docs = [];
  for (const row of html.split(/<tr[\s>]/i).slice(1)) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => c[1]);
    if (cells.length < 4) continue;
    const link = cells[2].match(/href="([^"]+)"/i);
    if (!link) continue;
    const name = link[1].split("/").pop().replace(/^ix\?doc=.*\//, "");
    const strip = (s) => { let t = s, prev = null; while (prev !== t) { prev = t; t = t.replace(/<[^>]*>/g, ""); } return t.replace(/[<>]/g, " ").replace(/&nbsp;/g, " ").trim(); };
    docs.push({ name, description: strip(cells[1]) || null, type: strip(cells[3]) || null, size: Number(strip(cells[4] ?? "").replace(/\D/g, "")) || null, url: `${base}/${name}` });
  }
  return docs;
}

// ---------------------------------------------------------------------------------------------
// US Treasury and FRED
// ---------------------------------------------------------------------------------------------

export const TREASURY_CURVES = Object.freeze({
  nominal: "daily_treasury_yield_curve",
  real: "daily_treasury_real_yield_curve",
  bills: "daily_treasury_bill_rates",
});

export async function treasuryYear(session, year, curve) {
  const type = TREASURY_CURVES[curve];
  const url = `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${year}/all?type=${type}&field_tdr_date_value=${year}&page&_format=csv`;
  const text = await getText(session, url, { maxBytes: 4 * 1024 * 1024 });
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(",").map((h) => h.replace(/"/g, "").trim());
  const rows = lines.slice(1).map((l) => l.split(",").map((c) => c.replace(/"/g, "").trim())).filter((r) => r.length === header.length);
  // Dates come as MM/DD/YYYY, newest first.
  const iso = (d) => { const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? `${m[3]}-${m[1]}-${m[2]}` : d; };
  return { url, header, rows: rows.map((r) => [iso(r[0]), ...r.slice(1).map((c) => (c === "" || c === "N/A" ? null : Number(c)))]) };
}

export async function fredCsv(session, id, { start, end } = {}) {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(id)}${start ? `&cosd=${start}` : ""}${end ? `&coed=${end}` : ""}`;
  const text = await getText(session, url, { maxBytes: 8 * 1024 * 1024 });
  if (!/^observation_date,/i.test(text) && !/^DATE,/i.test(text)) throw new NotFound(`FRED has no series ${id}.`);
  const out = [];
  for (const line of text.trim().split(/\r?\n/).slice(1)) {
    const [d, v] = line.split(",");
    out.push([d, v === "" || v === "." ? null : Number(v)]);
  }
  return { url: `https://fred.stlouisfed.org/series/${encodeURIComponent(id)}`, rows: out };
}

export async function fredTitle(session, id) {
  try {
    const html = await getText(session, `https://fred.stlouisfed.org/series/${encodeURIComponent(id)}`, { maxBytes: 2 * 1024 * 1024, transform: (t) => (t.match(/<title>([^<]*)<\/title>/i)?.[1] ?? "").replace(/\s*\|\s*FRED\s*\|.*$/i, "").trim() });
    return html || null;
  } catch {
    return null;
  }
}
