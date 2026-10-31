// Which company a pasted text is about, from the rows of /api/v1/company-names.json.
const LEGAL = new Set(["inc", "incorporated", "corp", "corporation", "co", "company", "ltd", "limited", "plc", "llc", "lp", "nv", "sa", "ag", "holdings", "holding", "group", "the", "com", "de"]);
const ALIASES = { google: "GOOGL", facebook: "META", instagram: "META", whatsapp: "META", youtube: "GOOGL", tsmc: "TSM", "coca cola": "KO" };
const NOT_TICKERS = new Set(["A", "I", "AN", "AS", "AT", "BE", "BY", "DO", "GO", "IF", "IN", "IS", "IT", "ME", "MY", "NO", "OF", "ON", "OR", "SO", "TO", "UP", "US", "WE", "USD", "EPS", "CEO", "CFO", "SEC", "IPO", "FY", "GAAP", "ALL", "NOW", "NEW", "ONE", "CAN", "FOR", "ARE", "HAS", "THE", "AND", "BUT", "NOT", "YOU", "ANY", "OUT", "BIG", "LOW", "HIGH", "AI", "EV", "PE"]);
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

// The company a text names: a $TICKER or capital ticker, a known alias, then the longest company name found in it.
export function findCompany({ byTicker, byFirst }, text) {
  const dollar = text.match(/\$([A-Za-z]{1,5})\b(?![\d.])/);
  if (dollar && byTicker.has(dollar[1].toUpperCase())) return byTicker.get(dollar[1].toUpperCase());
  const words = wordsOf(text), joined = ` ${words.join(" ")} `;
  for (const [alias, ticker] of Object.entries(ALIASES)) if (joined.includes(` ${alias} `) && byTicker.has(ticker)) return byTicker.get(ticker);
  let best = null;
  words.forEach((word, at) => {
    for (const c of byFirst.get(word) ?? []) {
      if (!c.words.every((w, i) => words[at + i] === w)) continue;
      const better = !best || c.words.length > best.words.length || (c.words.length === best.words.length && c.ticker && !best.ticker);
      if (better) best = c;
    }
  });
  if (!best) for (const token of text.match(/\b[A-Z]{1,5}\b/g) ?? []) if (!NOT_TICKERS.has(token) && byTicker.has(token)) return byTicker.get(token);
  // One bare word that is also an everyday word counts only with a capital or as the whole text.
  if (best && best.words.length === 1 && words.length > 1 && !new RegExp(`\\b${best.words[0]}`, "i").test(text.replace(/\b[a-z]+\b/g, ""))) return null;
  return best;
}
