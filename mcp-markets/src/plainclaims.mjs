// A claim as people say it, not as a press release does: "Amazon earned $9 per share", "Microsoft has
// $90 billion in cash", "Intel lost $18.8 billion", "profit fell 46%". Each figure is read only when
// the words beside it say what it is; anything else stays unread, because a wrong reading would tell
// someone their true figure is false. Results a release words its own way are guidance.mjs's job.
import { figuresIn } from "./guidance.mjs";

const OTHER = { "NT$": "TWD", "HK$": "HKD", "A$": "AUD", "C$": "CAD", "S$": "SGD", "R$": "BRL", RMB: "CNY", "₩": "KRW", "₹": "INR" };

// The words for a measure, most specific first; loose ones cover more than one line of the accounts.
const WORDS = [
  [/free cash flows?|fcf/, "free_cash_flow"],
  [/operating cash flows?|cash flows? from operations|cash from operations/, "operating_cash_flow"],
  [/gross profits?/, "gross_profit"],
  [/operating (?:profits?|income|earnings)/, "operating_income"],
  [/pre-?tax (?:profits?|income|earnings)/, "pretax_income"],
  [/net (?:income|profits?|earnings)/, "net_income"],
  [/profits?|earnings|bottom line/, "net_income", "profit"],
  [/(?:net )?revenues?|(?:net )?sales|turnover|top line/, "revenue"],
  [/long[- ]term debt/, "long_term_debt"],
  [/(?:total )?debt/, "long_term_debt", "debt"],
  [/cash and (?:cash )?equivalents/, "cash"],
  [/cash/, "cash", "cash"],
  [/r&d|research and development/, "rnd"],
  [/capex|capital expenditures?|capital spending/, "capex"],
  [/total assets/, "total_assets"],
  [/total liabilities/, "total_liabilities"],
  [/(?:stockholders|shareholders)['’]? equity|total equity/, "equity"],
];
const WORD = WORDS.map(([re]) => re.source).join("|");
const measureOfWord = (w) => { for (const [re, measure, loose] of WORDS) if (new RegExp(`^(?:${re.source})$`, "i").test(w)) return { measure, loose }; return null; };
const MARGINS = [[/gross(?: profit)?/, "gross_margin"], [/operating(?: profit| income)?/, "operating_margin"], [/pre-?tax(?: profit| income)?/, "pretax_margin"], [/net(?: profit| income)?|profit/, "net_margin"]];
const MARGIN = `(${MARGINS.map(([re]) => re.source).join("|")}) margins?`;
const marginOf = (w) => MARGINS.find(([re]) => new RegExp(`^(?:${re.source})$`, "i").test(w))?.[1] ?? null;

// Words between a figure's clause start and a measure that leave it the whole company's.
const WHOLE = /^(?:its|their|the|our|total|annual|yearly|quarterly|overall|full[- ]year|company|company's|firm's|group's|consolidated)$/i;
// What the sentence is about, when it is not a reported figure.
const FUTURE = /\b(?:will|would|could|might|may|should|shall|expect\w*|forecast\w*|estimat\w*|project\w*|predict\w*|guid(?:ance|ed|es|ing)|outlook|targets?|plans? to|going to|on track|next (?:year|quarter)|by 20\d\d|analysts?|consensus)\b/i;
const UNADJUSTED = /\b(?:adjusted|non-?gaap|pro forma|underlying|core)\b/i;
// A figure these describe is something else: "$3 trillion market cap", "$90 billion of stock".
const NOT_RESULT = /^\s*(?:dollars?\s+)?(?:(?:in|of|worth of)\s+)?(?:(?:its|their|the)\s+)?(?:market|stock|shares?|buybacks?|acquisitions?|deals?|valuation|value|fines?|settlements?|contracts?|loans?|bonds?|investments?|wealth|net worth|funding)\b/i;
// The figures in a sentence that the words after them say are something else.
export const notResults = (sentence) => figuresIn(sentence).filter((f) => NOT_RESULT.test(String(sentence).slice(f.end))).map((f) => Math.abs(f.low));
const VERB = "(?:was|were|is|are|came in at|came to|hit|reached|topped|totaled|totalled|stood at|amounted to|of|at)";
const HEDGE = { about: /\b(?:about|around|roughly|approximately|approx\.?|nearly|almost|close to|some|~)\s*$/i, over: /\b(?:over|more than|above|at least|upwards of|north of|in excess of|exceeded|exceeding)\s*$/i, under: /\b(?:under|less than|below|at most)\s*$/i };
const hedgeOf = (before) => Object.entries(HEDGE).find(([, re]) => re.test(before))?.[0] ?? null;
const stripHedge = (before) => Object.values(HEDGE).reduce((t, re) => t.replace(re, ""), before);

const unitOf = (f) => {
  if (f.pct) return "%";
  const cur = f.cur === "$" || f.cur === "US$" ? "USD" : OTHER[f.cur] ?? f.cur ?? null;
  return [cur, f.scale].filter(Boolean).join(" ") || null;
};

// A year written plainly in a sentence, its own full stop allowed: "in 2025." is a year, "$2025.5" is not.
export function plainYear(s) {
  const fy = String(s).match(/\bfy\s?['’]\s?\d{2}\b/i);
  if (fy) return fy[0];
  const year = String(s).match(/(?<![\d.,$€£¥/-])\b(?:19|20)\d{2}\b(?![\d/-]|[.,]\d|\s?(?:%|percent))/);
  return year ? year[0] : null;
}

// When a sentence says "last year" or "last quarter" instead of naming one.
const relativeWhen = (s) => { const m = String(s).match(/\b(?:last|past|most recent|latest) (quarter|year)\b/i); return m ? `last ${m[1].toLowerCase()}` : null; };

// The whole company's measure in the words just before a figure, joined by a verb: "Apple's profit
// was", "revenue of". A word in front that is neither the company nor "its" names a part of it.
function before(clause, name) {
  const m = clause.match(new RegExp(`(?:^|[\\s,(])((?:[\\w&.’'-]+\\s+){0,2}?)(${MARGIN}|${WORD})(?:\\s+(?:last|this|past|latest|most recent)\\s+(?:year|quarter))?(?:\\s+(?:in|for|during)\\s+(?:fiscal\\s+|fy\\s?)?\\d{4})?\\s+${VERB}\\s*$`, "i"));
  if (!m) return null;
  const front = m[1].trim().split(/\s+/).filter(Boolean).pop() ?? "";
  const known = !front || WHOLE.test(front) || front.endsWith("'s") || front.endsWith("’s") || isCompanyWord(front, name) || /^(?:and|with|while|but|that|had|has|a|an|fiscal|fy['’]?\d{2,4}|q[1-4]|(?:19|20)\d{2})$/i.test(front);
  return { word: m[2].toLowerCase(), margin: m[3] ? m[3].toLowerCase() : null, part: known ? null : front };
}

const isCompanyWord = (word, name) => String(name ?? "").toLowerCase().split(/[^a-z0-9&-]+/).includes(word.toLowerCase());

// A sentence's figures read as claims: { measure, value, unit, decimals, when?, change?, bound?, loose?, part? }.
// `when` is a relative period to resolve; a part of the business comes back only when `parts` asks.
export function plainClaimsIn(sentence, { name = null, parts = false } = {}) {
  const s = String(sentence);
  if (FUTURE.test(s)) return [];
  const out = [];
  const figs = figuresIn(s);
  for (const [k, fig] of figs.entries()) {
    if (fig.low !== fig.high) continue;
    const f = fig.f, after = s.slice(fig.end), gap = s.slice(figs[k - 1]?.end ?? 0, fig.at);
    if (NOT_RESULT.test(after) || /\b(?:compared (?:to|with)|versus|vs\.?|from|against)\s*(?:about |around |roughly )?$/i.test(gap)) continue;
    const bound = hedgeOf(gap);
    const clause = stripHedge(gap).trim();
    const unit = unitOf(f);
    const base = { value: fig.low, unit, decimals: fig.decimals, ...(bound ? { bound } : {}) };
    const when = relativeWhen(s);
    if (when) base.when = when;
    const push = (x) => { if (UNADJUSTED.test(gap)) x.basis = "adjusted"; out.push(x); };

    if (f.pct) {
      if (!/^\s*$|%|percent/.test(f.pct) && f.pct !== "%") continue;
      // "a 30% profit margin", "profit margin is 30%".
      const named = after.match(new RegExp(`^\\s*${MARGIN}`, "i"));
      if (named && marginOf(named[1])) { push({ ...base, measure: marginOf(named[1]) }); continue; }
      const head = before(clause, name);
      if (head?.margin && marginOf(head.margin)) { if (!head.part) push({ ...base, measure: marginOf(head.margin) }); continue; }
      // "sales rose 6%", "profit fell 46%".
      const moved = clause.match(new RegExp(`(?:^|\\s)((?:[\\w&.’'-]+\\s+)?)(${WORD})\\s+(?:(?:last|this)\\s+(?:year|quarter)\\s+)?(?:(grew|rose|climbed|increased|jumped|gained|surged|soared|was up|were up|up)|(fell|dropped|declined|decreased|slid|shrank|sank|tumbled|was down|were down|down))(?:\\s+by)?\\s*$`, "i"));
      if (moved) {
        const front = moved[1].trim();
        if (front && !WHOLE.test(front) && !/['’]s$/.test(front) && !isCompanyWord(front, name)) continue;
        const m = measureOfWord(moved[2]);
        if (m) push({ ...base, measure: m.measure, value: moved[4] ? -fig.low : fig.low, change: "growth", ...(m.loose ? { loose: m.loose } : {}) });
      }
      continue;
    }

    // A figure per share: "earned $9 per share", "$7.17 a share", "EPS of $7.46".
    if (/^\s*(?:per|a)\s+(?:diluted\s+)?share\b/i.test(after)) {
      if (/\b(?:earned|made|net(?:ted)?|earnings?|profits?|eps|lost|loss)\b/i.test(clause) && !/\b(?:dividend|price|trad\w+|bought|paid)\b/i.test(clause)) {
        push({ ...base, measure: "eps", unit: `${unitOf({ ...f, scale: null }) ?? "USD"} per share`, value: /\b(?:lost|loss)\b/i.test(clause) ? -fig.low : fig.low });
      }
      continue;
    }
    if (/^\s*(?:dividends?\b)/i.test(after) || (!f.cur && !f.scale)) continue;
    // After the figure: "$416 billion in revenue", "$100 billion profit", "112 billion dollars of sales".
    const tail = after.match(new RegExp(`^\\s*(?:dollars?\\s+)?(?:(?:in|of)\\s+)?(?:(?:net|total|annual|quarterly|its|their)\\s+)*(${WORD})\\b(.{0,40})`, "i"));
    if (tail) {
      // "revenue from China", "sales in Europe": a part; "revenue in 2025", "sales in Q3": a period.
      if (/^\s*(?:from|in)\s+(?!(?:fiscal|fy|q[1-4]|the (?:first|second|third|fourth|last|past|latest)|20\d\d|19\d\d|its|last|this)\b)/i.test(tail[2])) continue;
      const m = measureOfWord(tail[1]);
      if (m) { push({ ...base, measure: m.measure, ...(m.loose ? { loose: m.loose } : {}) }); continue; }
    }
    // Before it: "Apple's profit was $112 billion", "net loss of $18.8 billion".
    const loss = clause.match(/\b(net|operating)?\s*loss(?:es)?\s+(?:was|were|of|at|hit|reached)\s*$/i);
    if (loss) { push({ ...base, measure: /operating/i.test(loss[1] ?? "") ? "operating_income" : "net_income", value: -fig.low }); continue; }
    const head = before(clause, name);
    if (head && !head.margin) {
      const m = measureOfWord(head.word);
      if (m && /^\s*(?:from|in)\s+(?!(?:fiscal|fy|q[1-4]|the (?:first|second|third|fourth|last|past|latest)|20\d\d|19\d\d|its|last|this)\b)/i.test(after)) continue;
      if (m && head.part) { if (parts) out.push({ ...base, measure: m.measure, part: head.part }); continue; }
      if (m) { push({ ...base, measure: m.measure, ...(m.loose ? { loose: m.loose } : {}) }); continue; }
    }
    // Spent on: "spent $34 billion on R&D".
    const spent = after.match(/^\s*(?:dollars?\s+)?on\s+(r&d|research and development|capex|capital expenditures?|capital spending)\b/i);
    if (spent && /\b(?:spent|invested|put)\s*$/i.test(clause)) { const m = measureOfWord(spent[1]); if (m) { push({ ...base, measure: m.measure }); continue; } }
    // A verb that says it alone, with nothing after the figure but a period: "earned $112 billion in
    // 2025", "lost $18.8 billion". "lost $200 billion in market value" stopped above; "in antitrust
    // fines" stops here.
    if (/^\s*(?:(?:in|for|during)\s+(?:fiscal\s+|fy\s?|q[1-4]\s*)?(?:\d{4}|the (?:first|second|third|fourth|last|past|latest) \w+)|(?:last|this|the past) (?:year|quarter))?\s*(?:[.,;!?]|$|and\b|but\b|while\b)/i.test(after)) {
      if (/\b(?:earned|netted)\s*$/i.test(clause)) { push({ ...base, measure: "net_income", loose: "profit" }); continue; }
      if (/\blost\s*$/i.test(clause)) { push({ ...base, measure: "net_income", value: -fig.low }); continue; }
    }
  }
  return out;
}
