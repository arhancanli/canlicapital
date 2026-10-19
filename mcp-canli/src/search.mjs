// BM25F search over every pack's tools (name, title, keywords, description), with light stemming,
// stop words and finance abbreviations expanded, plus a bonus when the query names a tool or
// contains a run of its name's words. Built once from index.json.
// Time words ("last month", "current") say when, not which tool, so they are left out too.
const STOP = new Set("a an and are as at be by can do does for from get how i in is it me my of on or our the this to what which with you your want need using use show find give compute calculate last latest recent recently current currently today now".split(" "));
const ABBREV = { cvar: "expected shortfall conditional", es: "expected shortfall", var: "value risk", npv: "net present value", irr: "internal rate return", ytm: "yield maturity", dcf: "discounted cash flow", pnl: "profit loss", vol: "volatility", iv: "implied volatility", rv: "realized variance", hmm: "markov regime", pbo: "probability backtest overfitting", dsr: "deflated sharpe", ml: "machine learning", cv: "cross validation", etf: "etfs", fx: "currency", otm: "out money", sec: "filings", "10k": "annual filing", "10q": "quarterly filing", "8k": "current report events", pit: "point time", max: "maximum", min: "minimum" };
// Words the stemmer would turn into another word ("news" into "new").
const KEEP = new Set(["news"]);
// Plurals lose only their "s" ("rates" is "rate", like "rate"); "es" goes only after s, x, z, ch
// or sh ("taxes", "indexes", "matches").
const plural = (w) => (/(ss|us|is)$/.test(w) ? w : /(s|x|z|ch|sh)es$/.test(w) ? w.slice(0, -2) : w.replace(/s$/, ""));
export const stem = (w) => (w.length <= 3 || KEEP.has(w) ? w : plural(w.replace(/(ies)$/, "y")).replace(/(ing|ed)$/, "").replace(/(istic|ility|ation|ion|ity|al|ness|ic)$/, "") || w);
// Form names keep their number ("8-K" as 8k, "10-Q" as 10q) before dashes become spaces.
export const tokens = (s) => String(s ?? "").toLowerCase().replace(/\b(\d{1,2})-([kq])\b/g, "$1$2").replace(/[-_/]/g, " ").split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w)).flatMap((w) => (Object.hasOwn(ABBREV, w) ? [w, ...ABBREV[w].split(" ")] : [w])).map(stem);

// Field, weight, and how much the field's length discounts a match. Keywords are lists of the words
// people use, so a longer list does not dilute each word.
const FIELDS = [["name", 3, 0.75], ["title", 2.5, 0.75], ["keywords", 2, 0], ["description", 1, 0.75]];

// entries: [{ name, pack, title, description, keywords }]
export function buildIndex(entries) {
  const docs = entries.map((t) => Object.fromEntries(FIELDS.map(([f]) => [f, tokens(f === "name" ? t.name.replace(/_/g, " ") : t[f])])));
  const avg = Object.fromEntries(FIELDS.map(([f]) => [f, docs.reduce((s, d) => s + d[f].length, 0) / (docs.length || 1)]));
  const df = new Map();
  for (const d of docs) for (const w of new Set(FIELDS.flatMap(([f]) => d[f]))) df.set(w, (df.get(w) ?? 0) + 1);
  return { entries, docs, avg, df, n: docs.length };
}

export function search(index, query, { packs, limit = 8 } = {}) {
  const q = [...new Set(tokens(query))], { entries, docs, avg, df, n } = index, k1 = 3;
  const plain = String(query).toLowerCase(), raw = plain.split(/[^a-z0-9]+/).filter(Boolean);
  const scored = [];
  entries.forEach((t, i) => {
    if (packs && !packs.includes(t.pack)) return;
    let s = 0;
    for (const w of q) {
      let tf = 0;
      for (const [f, wt, b] of FIELDS) { const d = docs[i][f]; let c = 0; for (const x of d) if (x === w) c++; tf += wt * c / (1 - b + b * d.length / (avg[f] || 1)); }
      if (tf > 0) s += Math.log(1 + (n - (df.get(w) ?? 0) + 0.5) / ((df.get(w) ?? 0) + 0.5)) * tf * (k1 + 1) / (tf + k1);
    }
    const nw = t.name.split("_");
    let run = 0;
    for (let x = 0; x < raw.length; x++) for (let j = 0; j < nw.length; j++) { let k = 0; while (raw[x + k] && nw[j + k] && raw[x + k] === nw[j + k]) k++; run = Math.max(run, k); }
    if (run >= 2) s += 2 * run;
    // Naming a tool picks it: the whole query, or an identifier with an underscore (sharpe_ratio).
    // A one-word name ("history") is an ordinary word in a question, so it gets no bonus there.
    if (q.length && (t.name.replace(/_/g, " ") === plain.trim() || (t.name.includes("_") && new RegExp(`(^|[^a-z_])${t.name}([^a-z_]|$)`).test(plain)))) s += 100;
    if (s > 0 || q.length === 0) scored.push([s, t]);
  });
  scored.sort((x, y) => y[0] - x[0] || x[1].name.length - y[1].name.length || x[1].name.localeCompare(y[1].name));
  return scored.slice(0, limit).map(([, t]) => t);
}
