// Which company a pasted text is about, from the rows of /api/v1/company-names.json.
const LEGAL = new Set(["inc", "incorporated", "corp", "corporation", "co", "company", "ltd", "limited", "plc", "llc", "lp", "nv", "sa", "ag", "holdings", "holding", "group", "the", "com", "de"]);
const ALIASES = { google: "GOOGL", facebook: "META", meta: "META", instagram: "META", whatsapp: "META", youtube: "GOOGL", tsmc: "TSM", "coca cola": "KO", coke: "KO", amazon: "AMZN", aws: "AMZN", uber: "UBER", ford: "F", cisco: "CSCO", coinbase: "COIN", micron: "MU", spotify: "SPOT", palantir: "PLTR", disney: "DIS", exxon: "XOM", exxonmobil: "XOM", jpmorgan: "JPM", goldman: "GS", lilly: "LLY", berkshire: "BRK-B", procter: "PG", "p and g": "PG", citi: "C", citigroup: "C" };
const NOT_TICKERS = new Set(["A", "I", "AN", "AS", "AT", "BE", "BY", "DO", "GO", "IF", "IN", "IS", "IT", "ME", "MY", "NO", "OF", "ON", "OR", "SO", "TO", "UP", "US", "WE", "USD", "EPS", "CEO", "CFO", "SEC", "IPO", "FY", "GAAP", "ALL", "NOW", "NEW", "ONE", "CAN", "FOR", "ARE", "HAS", "THE", "AND", "BUT", "NOT", "YOU", "ANY", "OUT", "BIG", "LOW", "HIGH", "AI", "EV", "PE", "FCF", "EPS", "ROE", "ROI", "ROIC", "PE", "GAAP", "IFRS", "TTM", "YOY", "QOQ", "ARR", "ARPU", "EBIT", "EBITDA", "CAPEX", "FY", "IPO", "ETF", "USD", "EUR", "GBP", "SEC", "CEO", "CFO", "AI", "API", "GDP"]);
const wordsOf = (text) => String(text).toLowerCase().replace(/['’]s\b/g, "").replace(/&/g, " and ").split(/[^a-z0-9]+/).filter(Boolean);


export function indexCompanies(rows) {
  const byTicker = new Map(), byFirst = new Map();
  for (const [cik, name, tickers] of rows) {
    const company = { cik: String(cik).padStart(10, "0"), name, ticker: tickers?.[0] ?? null, words: wordsOf(name).filter((w, i, all) => i === 0 || !LEGAL.has(w) || i < all.length - 1 && !LEGAL.has(all[i + 1])) };
    while (company.words.length > 1 && LEGAL.has(company.words.at(-1))) company.words.pop();
    for (const t of tickers ?? []) byTicker.set(t, company);
    if (!company.words.length) continue;
    if (!byFirst.has(company.words[0])) byFirst.set(company.words[0], []);
    byFirst.get(company.words[0]).push(company);
  }
  return { byTicker, byFirst };
}

// The company a text names: a $TICKER, then the first company named in it (a known everyday name or the longest
// company name, written with capitals unless it is the whole text), then a capital ticker.
export function findCompany({ byTicker, byFirst }, text) {
  const dollar = text.match(/\$([A-Za-z]{1,5})\b(?![\d.])/);
  if (dollar && byTicker.has(dollar[1].toUpperCase())) return byTicker.get(dollar[1].toUpperCase());
  const raw = String(text).replace(/['’]s\b/g, "").replace(/&/g, " and ").split(/[^A-Za-z0-9]+/).filter(Boolean), words = raw.map((w) => w.toLowerCase());
  const written = (at, length) => words.length === length || raw.slice(at, at + length).every((w) => /^[A-Z]/.test(w) || /^(and|of|the)$/.test(w));
  const aliases = Object.entries(ALIASES).map(([alias, ticker]) => [alias.split(" "), ticker]).filter(([, ticker]) => byTicker.has(ticker));
  for (let at = 0; at < words.length; at++) {
    // A name is never a bare number or a quarter: "12.58" and "Q2" are not 58.com or Q2 Holdings.
    if (/^(\d+|q[1-4])$/.test(words[at])) continue;
    let best = null;
    for (const [alias, ticker] of aliases) if (alias.every((w, i) => words[at + i] === w) && written(at, alias.length) && (!best || alias.length > best.words.length)) best = { ...byTicker.get(ticker), words: alias };
    for (const c of byFirst.get(words[at]) ?? []) {
      if (!c.words.every((w, i) => words[at + i] === w) || !written(at, c.words.length)) continue;
      if (!best || c.words.length > best.words.length || (c.words.length === best.words.length && c.ticker && !best.ticker)) best = c;
    }
    if (best) return best;
  }
  for (const token of text.match(/\b[A-Z]{1,5}\b/g) ?? []) if (!NOT_TICKERS.has(token) && byTicker.has(token)) return byTicker.get(token);
  return null;
}
