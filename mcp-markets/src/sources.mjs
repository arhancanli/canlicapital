// Where the data comes from, and how it is fetched: SEC EDGAR, the US Treasury and FRED with no
// key, prices with the user's own Alpaca or Tiingo key. One session holds the cache and the SEC
// rate limit (SEC asks for at most 10 requests a second; this stays at 8).
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
    secNext: 0,
  };
}

const isSec = (url) => /^https:\/\/(www|data|efts)\.sec\.gov\//.test(url);
const host = (url) => new URL(url).host;

// Spaces SEC requests SEC_GAP_MS apart across concurrent callers.
async function secTurn(session) {
  const t = session.now();
  const at = Math.max(t, session.secNext);
  session.secNext = at + SEC_GAP_MS;
  if (at > t) await session.sleep(at - t);
}

// Fetches text, cached for the session. `transform` (string to string) runs before caching, so a
// 2 MB filing is kept as its text, not its HTML; `parse` runs on every read, cached or not.
export async function getText(session, url, { headers = {}, maxBytes = 16 * 1024 * 1024, transform, parse = (t) => t, secret = false } = {}) {
  const hit = session.cache.lookup(url, session.now());
  if (hit) return parse(hit.text);
  if (isSec(url)) await secTurn(session);
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let text;
  try {
    text = await fetchBoundedText(session.fetchImpl, url, { signal, maxBytes, headers: { "User-Agent": isSec(url) ? session.userAgent : PLAIN_USER_AGENT, ...headers } });
  } catch (error) {
    // A URL carrying a key is never echoed back.
    const where = secret ? host(url) : url;
    if (signal.aborted) throw new Error(`${where} did not answer within ${TIMEOUT_MS / 1000} s; retry in a moment.`);
    if (error instanceof ResponseReadError) {
      if (error.code === "HTTP" && error.status === 404) throw new NotFound(`${where} was not found.`);
      if (error.code === "HTTP" && (error.status === 403 || error.status === 429) && isSec(url)) throw new Error(`SEC refused the request (HTTP ${error.status}). SEC limits clients to 10 requests a second and asks for a contact in the User-Agent: set SEC_USER_AGENT to "Your Name you@example.com".`);
      if (error.code === "HTTP" && (error.status === 401 || error.status === 403)) throw new Error(`${host(url)} refused the key (HTTP ${error.status}).`);
      if (error.code === "HTTP") throw new Error(`${where} returned HTTP ${error.status}.`);
      if (error.code === "TOO_LARGE") throw new Error(`${where} is larger than ${Math.round(maxBytes / 1048576)} MB; not read.`);
    }
    throw new Error(`${where} could not be reached (${error?.message ?? error}).`);
  }
  if (transform) text = transform(text);
  const value = parse(text);
  session.cache.set(url, { at: session.now(), text });
  return value;
}

export class NotFound extends Error {}

export async function getJson(session, url, opts = {}) {
  return getText(session, url, { ...opts, parse: (t) => { try { return JSON.parse(t); } catch { throw new Error(`${opts.secret ? host(url) : url} did not return JSON.`); } } });
}

// ---------------------------------------------------------------------------------------------
// SEC EDGAR
// ---------------------------------------------------------------------------------------------

export const pad10 = (cik) => String(Number(cik)).padStart(10, "0");
export const archiveBase = (cik, accession) => `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${String(accession).replace(/-/g, "")}`;

export async function tickerTable(session) {
  return getJson(session, "https://www.sec.gov/files/company_tickers.json");
}

// A company or fund by ticker, CIK or name. Names go to EDGAR's entity search, which also knows
// filers with no ticker (most fund managers).
export async function resolveEntity(session, query) {
  const q = String(query ?? "").trim();
  if (!q) throw new Error("Name a company: a ticker (AAPL), a CIK (320193) or a name (Apple).");
  if (/^\d{1,10}$/.test(q)) return { cik: Number(q), name: null, ticker: null, matched_by: "cik" };
  const table = await tickerTable(session);
  const want = q.toUpperCase().replace(/\./g, "-").replace(/^\$/, "");
  for (const row of Object.values(table)) if (row.ticker === want) return { cik: row.cik_str, name: row.title, ticker: row.ticker, matched_by: "ticker" };
  const found = await getJson(session, `https://efts.sec.gov/LATEST/search-index?keysTyped=${encodeURIComponent(q)}`);
  const hits = found?.hits?.hits ?? [];
  if (!hits.length) throw new NotFound(`No SEC filer matches "${q}". Try the ticker, the CIK, or the name as registered (for example "Berkshire Hathaway").`);
  const top = hits[0];
  const byCik = new Map(Object.values(table).map((r) => [r.cik_str, r.ticker]));
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
    const strip = (s) => s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
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
