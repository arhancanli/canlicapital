// A foreign company's US-listed share is often a depositary share standing for several ordinary shares,
// its accounts are often in IFRS and its figures often not in dollars. Reading a price against such a
// filing needs all three: one TSM share is five ordinary shares, with accounts in New Taiwan dollars.
import { archiveBase, getText } from "./sources.mjs";
import { priceHistory } from "./tools.mjs";

const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twenty: 20, thirty: 30, fifty: 50, hundred: 100 };
const NUM = "(\\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|fifty|hundred)";
const SHARE = "(?:\\(\\d+\\)\\s*)?(?:class\\s+[a-z]\\s+|series\\s+[a-z]\\s+|fully[- ]paid\\s+|underlying\\s+|new\\s+|existing\\s+)?(?:ordinary|common|equity|preferred|preference|b\\s|a\\s|shares?)";
const ADS = "(?:ads|adss|adr|adrs|american depositary (?:share|receipt)s?|depositary (?:share|receipt)s?)";
const PATTERNS = [
  new RegExp(`\\b(?:each|one|every|per|an?)\\s+${ADS}\\b[^.;]{0,70}?\\brepresent\\w*\\s+(?:the\\s+right\\s+to\\s+receive\\s+)?${NUM}\\s+${SHARE}`, "gi"),
  new RegExp(`\\b${ADS}\\s*(?:\\([^)]{0,40}\\))?,?\\s*(?:each|which each|each of which)\\s+(?:of which\\s+)?represent\\w*\\s+(?:the\\s+right\\s+to\\s+receive\\s+)?${NUM}\\s+${SHARE}`, "gi"),
  new RegExp(`${NUM}\\s+${SHARE}[^.;]{0,20}?\\b(?:per|for each|for every|to one|to each)\\s+${ADS}`, "gi"),
];

const plain = (html) => String(html).replace(/<[^>]+>/g, " ").replace(/&#160;|&nbsp;/g, " ").replace(/&#8217;|&rsquo;/g, "'").replace(/\s+/g, " ");

// Ordinary shares per depositary share from an annual report's text: the commonest statement of it,
// null when the report names depositary shares and no clear ratio. A report that names none has none.
export function ratioFromText(html) {
  const text = plain(html);
  const named = (text.match(/American Depositary/gi) ?? []).length;
  if (named < 3) return { shares_per_listed_share: 1, basis: "the annual report names no depositary shares" };
  const votes = new Map();
  for (const p of PATTERNS) for (const m of text.matchAll(p)) {
    const n = WORDS[m[1].toLowerCase()] ?? Number(m[1]);
    if (n > 0) votes.set(n, (votes.get(n) ?? 0) + 1);
  }
  const [top, next] = [...votes].sort((x, y) => y[1] - x[1]);
  if (!top || (next && next[1] === top[1])) return null;
  return { shares_per_listed_share: top[0], basis: "as the annual report states it" };
}

// One listed share in ordinary shares, read once a session from the latest 20-F. Companies filing 10-Ks
// or 40-Fs list their shares themselves. null: the report's text gave no clear ratio.
export async function listedShareRatio(session, cik, sub) {
  session.adsRatios ??= new Map();
  if (session.adsRatios.has(cik)) return session.adsRatios.get(cik);
  const rec = sub?.filings?.recent ?? {};
  const at = (rec.form ?? []).findIndex((f) => /^(10-K|20-F|40-F)$/.test(f));
  let out = { shares_per_listed_share: 1, basis: "files US or Canadian annual reports, with its own shares listed" };
  if (rec.form?.[at] === "20-F") {
    const url = `${archiveBase(cik, rec.accessionNumber[at])}/${rec.primaryDocument[at]}`;
    try {
      out = ratioFromText(await getText(session, url, { maxBytes: 96 * 1024 * 1024, timeoutMs: 60000 }));
      if (out) out.source = url;
    } catch { out = null; }
  }
  session.adsRatios.set(cik, out);
  return out;
}

// Which accounts a filer's XBRL facts hold: the taxonomy of its latest balance sheet and that sheet's
// currency. A filer that moved from US GAAP to IFRS (Toyota, 2021) is read under IFRS.
export function factBook(cf) {
  const newest = (name) => {
    let best = null;
    for (const [unit, rows] of Object.entries(cf?.facts?.[name]?.Assets?.units ?? {})) for (const r of rows) if (!best || r.filed > best.filed || (r.filed === best.filed && r.end > best.end)) best = { ...r, unit };
    return best;
  };
  const g = newest("us-gaap"), i = newest("ifrs-full");
  const useIfrs = i && (!g || i.filed >= g.filed);
  const chosen = useIfrs ? i : g;
  return { taxonomy: useIfrs ? "ifrs-full" : "us-gaap", facts: cf?.facts?.[useIfrs ? "ifrs-full" : "us-gaap"] ?? {}, currency: chosen?.unit ?? "USD" };
}

// Dollars per unit of a currency, the latest close. null when no price source is available (the hosted
// server has none).
export async function usdPer(session, currency) {
  if (currency === "USD") return { rate: 1, pair: null, date: null };
  try {
    const today = new Date(session.now()).toISOString().slice(0, 10);
    const start = new Date(session.now() - 12 * 86400000).toISOString().slice(0, 10);
    const p = await priceHistory(session, { symbol: `${currency}USD=X`, start, end: today });
    const rate = p?.close?.at(-1);
    return rate > 0 ? { rate, pair: `${currency}USD`, date: p.dates?.at(-1) ?? null, source: p.source } : null;
  } catch { return null; }
}

// What a listed price says about the company: its market value, and the price of one ordinary share,
// to set against per-share figures. Shares are the filing's ordinary shares; both are null when the
// ratio could not be read, rather than off by the ratio.
export async function marketValue(session, cik, sub, price, shares, { book = null, implied = null } = {}) {
  const ratio = await listedShareRatio(session, cik, sub);
  if (!ratio) return { market_cap: null, price_per_share: null, ratio: null, note: "This company lists depositary shares, and its annual report gave no clear ratio of ordinary shares to each, so market value is not computed." };
  const per = price / ratio.shares_per_listed_share;
  // A 20-F's cover page can count one class of several (Alibaba's tagged count is a tenth of its shares).
  // Profit over earnings per share gives the real count: well apart, that one is used and named.
  const abroad = (sub?.filings?.recent?.form ?? []).includes("20-F");
  const counted = abroad ? implied ?? (book ? sharesFromEarnings(book) : null) : null;
  if (abroad && counted && (!shares || Math.max(counted / shares, shares / counted) > 1.5)) {
    return { market_cap: per * counted, price_per_share: per, ratio, shares_used: Math.round(counted), note: `The filing's cover page tags ${shares ? shares.toLocaleString("en-US") : "no"} shares, far from the ${Math.round(counted).toLocaleString("en-US")} that its profit over earnings per share implies, so that count is used.` };
  }
  return { market_cap: shares ? per * shares : null, price_per_share: per, ratio };
}

// Shares implied by the latest annual profit and earnings per share.
export function sharesFromEarnings(book) {
  const annualRows = (tag, unit) => (book.facts[tag]?.units?.[unit] ?? []).filter((x) => /^(10-K|20-F|40-F)/.test(x.form ?? "") && x.start && (Date.parse(x.end) - Date.parse(x.start)) / 86400000 > 330);
  const latest = (tags, unit) => { for (const t of tags) { const rows = annualRows(t, unit); if (rows.length) return rows.reduce((b, x) => (x.end > b.end || (x.end === b.end && x.filed > b.filed) ? x : b)); } return null; };
  const ifrs = book.taxonomy === "ifrs-full";
  const profit = latest(ifrs ? ["ProfitLossAttributableToOwnersOfParent"] : ["NetIncomeLoss"], book.currency);
  const eps = latest(ifrs ? ["DilutedEarningsLossPerShare", "BasicEarningsLossPerShare"] : ["EarningsPerShareDiluted", "EarningsPerShareBasic"], `${book.currency}/shares`);
  return profit && eps && profit.end === eps.end && eps.val > 0 && profit.val > 0 ? profit.val / eps.val : null;
}
