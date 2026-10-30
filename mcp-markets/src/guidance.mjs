// Guidance in a results press release: the outlook a company gives for the next quarter or year,
// each figure parsed into a range (low, high, midpoint) with its unit, the measure it is for and
// the period, and always the sentence or table row it came from. Nothing is inferred beyond the
// words: "approximately $34.8 billion" is one value marked approximate; "$108.0 billion, plus or
// minus 2%" is $105.84 to $110.16 billion; "low single digits" stays words.

const SCALE = { thousand: "thousand", k: "thousand", million: "million", m: "million", mn: "million", mm: "million", billion: "billion", b: "billion", bn: "billion", trillion: "trillion", t: "trillion" };

// Measures people guide on, most specific first. A label that is none of these is kept as written.
const MEASURES = [
  ["pretax_margin", /\bpre-?tax (?:profit |income )?margins?\b/],
  ["gross_margin", /\bgross (?:profit )?(?:margins?|rate)\b/],
  ["operating_margin", /\b(?:operating|op\.?) (?:income |profit )?margins?(?: rate)?\b/],
  ["net_margin", /\bnet (?:income |profit )?margins?\b/],
  ["ebitda_margin", /\bebitda margins?\b/],
  ["eps", /\b(?:diluted |basic )?(?:earnings|eps|net income|income|loss)(?: \(loss\))? (?:per (?:diluted )?share|attributable to [\w .]+? per share)\b|\beps\b|\bearnings of\b/],
  ["comparable_sales", /\b(?:comparable|comp|same[- ](?:store|restaurant)|like-for-like)(?: store)?(?: sales)?\b/],
  ["free_cash_flow", /\bfree cash flows?\b/],
  ["operating_cash_flow", /\b(?:operating cash flows?|cash flows? from operations|cash from operations)\b/],
  ["capex", /\b(?:gross )?(?:capital expenditures?|capex|capital spending|capital investments?)\b/],
  ["tax_rate", /\b(?:effective )?(?:income )?tax (?:rates?|provision(?: rate)?)\b/],
  ["operating_income", /\b(?:operating (?:income|profit|earnings))\b/],
  ["pretax_income", /\bpre-?tax (?:profit|income|earnings)\b/],
  ["net_income", /\bnet (?:income|earnings)\b/],
  ["ebitda", /\bebitda\b/],
  ["operating_expenses", /\b(?:operating expenses|opex)\b/],
  ["interest_expense", /\binterest (?:expense|, net)\b/],
  ["share_count", /\b(?:diluted )?(?:share count|shares outstanding|weighted[- ]average (?:diluted )?shares)\b/],
  ["total_assets", /\btotal assets\b/],
  ["total_liabilities", /\btotal liabilities\b/],
  ["equity", /\b(?:stockholders|shareholders|shareowners)['’]? equity\b|\btotal equity\b/],
  ["cash", /\bcash and (?:cash )?equivalents\b/],
  ["long_term_debt", /\blong[- ]term debt\b/],
  ["rnd", /\bresearch and development\b|\br&d\b/],
  ["dividends_per_share", /\bdividends? (?:per share|declared)\b|\bquarterly dividend\b/],
  ["gross_profit", /\bgross profit\b/],
  ["income_tax", /\b(?:provision for income taxes|income tax expense)\b/],
  ["revenue", /\b(?:total |net |consolidated |operating )?(?:revenues?|net sales|sales)\b/],
];
const BASIS = [["constant currency", /\bconstant (?:currency|dollars?)\b|\blocal currenc(?:y|ies)\b|\(cc\)|\bin cc\b/gi], ["non-GAAP", /\bnon-?gaap\b/gi], ["adjusted", /\badjusted\b|\badj\.(?=\s)/gi], ["GAAP", /(?<!non-?)\bgaap\b/gi]];

export function measureOf(text) {
  const t = String(text).toLowerCase();
  for (const [key, re] of MEASURES) if (re.test(t)) return key;
  return null;
}
// The basis named nearest the end of a text: "GAAP ... 20.1%, and maintains non-GAAP ... 34.3%"
// gives non-GAAP for the second figure; "GAAP and non-GAAP" together give both.
export function basisOf(text) {
  const t = String(text);
  if (/\bgaap and non-?gaap\b/i.test(t)) return "GAAP and non-GAAP";
  let best = null, at = -1;
  for (const [name, re] of BASIS) for (const m of t.matchAll(re)) if (m.index > at) { best = name; at = m.index; }
  return best;
}

// The period a figure is for, as the text names it.
const PERIOD_RES = [
  /\b(?:three|six|nine|twelve|3|6|9|12) months? end(?:ed|ing) (?:on )?(?:january|february|march|april|may|june|july|august|september|october|november|december) \d{1,2},? \d{4}\b/i,
  /\b(?:the )?(?:first|second|third|fourth|1st|2nd|3rd|4th)[- ]quarter(?: of)?(?: (?:fiscal|fy)(?: year)?)?(?: \d{4}| fy ?\d{2,4}| '\d{2})?\b/i,
  /\b(?:q[1-4]|fq[1-4])(?:[- ]?(?:fy)?['’]?\d{2,4})?\b/i,
  /\b(?:the )?(?:january|february|march|april|may|june|july|august|september|october|november|december) quarter\b/i,
  /\b(?:full[- ]year|fiscal(?: year)?|fy)\s*(?:\d{4}|\d{2})\b/i,
  /\b(?:the )?full[- ]year\b|\bfiscal year\b|\b(?:for )?the year\b/i,
  /\b(?:next|current|coming) (?:quarter|year)\b/i,
  /\bfor the (?:quarter|year)\b/i,
  /\b20\d{2}\b(?= (?:outlook|guidance|full[- ]year))/i,
];
const ORDINAL = { first: 1, "1st": 1, second: 2, "2nd": 2, third: 3, "3rd": 3, fourth: 4, "4th": 4 };
// The quarter a text names ("second quarter of fiscal 2027", "Q3 FY27", "2Q26") with its year when given.
export function quarterOf(text) {
  const t = String(text ?? "");
  let q = null, year = null;
  const o = t.match(/\b(first|second|third|fourth|1st|2nd|3rd|4th)[- ]quarter\b/i);
  if (o) q = ORDINAL[o[1].toLowerCase()];
  const short = t.match(/\bf?q([1-4])\b|\b([1-4])q(\d{2})\b/i);
  if (!q && short) { q = Number(short[1] ?? short[2]); if (short[3]) year = 2000 + Number(short[3]); }
  const y = t.match(/\b(?:fiscal(?: year)?|fy)\s*['’]?(\d{4}|\d{2})\b|\b(20\d{2})\b/i);
  if (y && !year) { const v = y[1] ?? y[2]; year = v.length === 2 ? 2000 + Number(v) : Number(v); }
  return q ? { quarter: q, year } : null;
}

export function periodOf(text) {
  for (const re of PERIOD_RES) { const m = String(text).match(re); if (m) return m[0].replace(/^the /i, "").trim(); }
  return null;
}

const NUM = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?`;
// One figure: an optional currency, the number, an optional scale and unit.
const FIG = new RegExp(String.raw`(?:(\$|US\$|€|£)\s?)?(?:(?<![\d.])([-−]))?(${NUM})\s?(thousand|million|billion|trillion|bn|mn|[KMBT](?![A-Za-z]))?\s?(%|percent(?:age points?)?|per cent|pts?\b|points?\b|basis points|bps)?`, "gi");
const CONNECT = /^\s*(?:to|-|–|—|and|through)\s*$/i;
const APPROX = /(?:approximately|approx\.?|about|around|roughly|nearly|close to|~|in a range around|in the range of approximately)\s*$/i;

function unitOf(f, measure) {
  if (f.pct) return /basis|bps/.test(f.pct) ? "bps" : /point|pts?\b/.test(f.pct) ? "percentage points" : "%";
  const cur = f.cur === "$" || f.cur === "US$" ? "USD" : f.cur;
  const per = String(f.after ?? "").match(/^\s*per (?:diluted |basic )?(\w+)/)?.[1];
  if (f.cur) return per && per !== "share" ? `${cur} per ${per}` : measure === "eps" || per === "share" ? `${cur} per share` : `${cur}${f.scale ? ` ${f.scale}` : ""}`;
  return f.scale ? f.scale : null;
}

// The figures in a sentence, joined into ranges where two are linked by "to", "-" or "and",
// with "plus or minus" applied and "approximately" noted.
export function figuresIn(sentence, { bare = false } = {}) {
  const s = String(sentence);
  const raw = [];
  for (const m of s.matchAll(FIG)) {
    if (!m[3]) continue;
    // A year or a footnote mark is not a figure; neither is a number inside a word ("Q3", "FY27").
    const before = s.slice(Math.max(0, m.index - 1), m.index);
    if (/[A-Za-z]/.test(before) && !m[1]) continue;
    const n = Number(m[3].replace(/,/g, ""));
    if (!m[1] && !m[4] && !m[5] && /^(19|20)\d{2}$/.test(m[3])) continue;
    raw.push({ decimals: (m[3].split(".")[1] ?? "").length, at: m.index, end: m.index + m[0].length, cur: m[1] ?? null, neg: Boolean(m[2]), n: m[2] ? -n : n, scale: m[4] ? SCALE[m[4].toLowerCase()] ?? null : null, pct: m[5]?.toLowerCase() ?? null, text: m[0].trim() });
  }
  for (let i = 0; i < raw.length; i++) raw[i].after = s.slice(raw[i].end, raw[i].end + 30).toLowerCase();
  const out = [];
  const band = (item, rest) => {
    const pm = rest.match(/^\s*,?\s*(?:plus or minus|\+\/-|±)\s*(\$|US\$)?\s?(\d+(?:\.\d+)?)\s?(thousand|million|billion|bn|mn)?\s?(%|percent|basis points|bps)?/i);
    if (!pm || item.low !== item.high) return 0;
    const d = Number(pm[2]), dpct = pm[4]?.toLowerCase();
    let delta = null;
    if (dpct && /basis|bps/.test(dpct) && item.f.pct) delta = d / 100;
    else if (dpct && !/basis|bps/.test(dpct) && !item.f.pct) delta = item.low * d / 100;
    else if (dpct && !/basis|bps/.test(dpct) && item.f.pct) delta = d;
    else if (!dpct) delta = d * ((pm[3] && SCALE[pm[3].toLowerCase()] !== item.f.scale) ? (SCALE[pm[3].toLowerCase()] === "million" && item.f.scale === "billion" ? 0.001 : SCALE[pm[3].toLowerCase()] === "billion" && item.f.scale === "million" ? 1000 : 1) : 1);
    if (delta === null) return 0;
    item.plusMinus = pm[0].trim().replace(/^,\s*/, "");
    item.low = round(item.low - delta);
    item.high = round(item.high + delta);
    return pm[0].length;
  };
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i], b = raw[i + 1];
    // "74.9% and 75.0%, respectively": one value for each of two things named before, not a range.
    const resp = b && /^\s*and\s*$/i.test(s.slice(a.end, b.at)) ? s.slice(b.end).match(/^\s*,?\s*respectively\b,?/i) : null;
    if (resp) {
      const pair = [a, b].map((x, k) => ({ at: x.at, end: x.end, low: x.n, high: x.n, decimals: x.decimals, f: x, respectively: k }));
      const used = Math.max(...pair.map((x) => band(x, s.slice(b.end + resp[0].length))));
      for (const x of pair) {
        x.approx = APPROX.test(s.slice(Math.max(0, a.at - 40), a.at)) || /\bapproximately\b/i.test(s.slice(Math.max(0, a.at - 60), a.at));
        out.push(x);
      }
      i++;
      const end = b.end + resp[0].length + used;
      while (raw[i + 1] && raw[i + 1].at < end) i++;
      continue;
    }
    let item;
    // A range joins figures of one kind: "4% to $2.4 billion" is a change and an amount, not a range.
    const sameKind = b && !((a.pct && (b.cur || b.scale)) || (b.pct && (a.cur || a.scale)) || (a.pct && b.pct && /basis|bps/.test(a.pct) !== /basis|bps/.test(b.pct)));
    if (b && sameKind && CONNECT.test(s.slice(a.end, b.at)) && (a.cur || b.cur || a.pct || b.pct || a.scale || b.scale)) {
      // "$60-65 billion", "11% - 12%", "3.0 to 3.75 percent": the second figure's unit covers both.
      const cur = a.cur ?? b.cur, scale = a.scale ?? b.scale, pct = a.pct ?? b.pct;
      item = { at: a.at, end: b.end, low: Math.min(a.n, b.n), high: Math.max(a.n, b.n), decimals: Math.max(a.decimals, b.decimals), f: { cur, scale, pct, after: b.after } };
      i++;
    } else if ((a.pct || a.cur) && /\bflat\s+to\s*$/i.test(s.slice(Math.max(0, a.at - 12), a.at))) {
      // "approximately flat to 2.0%": from zero to the figure.
      item = { at: s.lastIndexOf("flat", a.at), end: a.end, low: Math.min(0, a.n), high: Math.max(0, a.n), decimals: a.decimals, f: a };
    } else if (a.cur || a.pct || a.scale || bare) {
      item = { at: a.at, end: a.end, low: a.n, high: a.n, decimals: a.decimals, f: a };
    } else continue;
    // "plus or minus 2%" / "± $300 million" / "+/- 50 basis points" after the figure.
    const rest = s.slice(item.end, item.end + 40);
    const pm = rest.match(/^\s*,?\s*(?:plus or minus|\+\/-|±)\s*(\$|US\$)?\s?(\d+(?:\.\d+)?)\s?(thousand|million|billion|bn|mn)?\s?(%|percent|basis points|bps)?/i);
    if (pm && item.low === item.high) {
      const d = Number(pm[2]);
      const dpct = pm[4]?.toLowerCase();
      let delta = null;
      if (dpct && /basis|bps/.test(dpct) && item.f.pct) delta = d / 100;
      else if (dpct && !/basis|bps/.test(dpct) && !item.f.pct) delta = item.low * d / 100;
      else if (dpct && !/basis|bps/.test(dpct) && item.f.pct) delta = d;
      else if (!dpct) delta = d * ((pm[3] && SCALE[pm[3].toLowerCase()] !== item.f.scale) ? (SCALE[pm[3].toLowerCase()] === "million" && item.f.scale === "billion" ? 0.001 : SCALE[pm[3].toLowerCase()] === "billion" && item.f.scale === "million" ? 1000 : 1) : 1);
      if (delta !== null) {
        item.plusMinus = pm[0].trim().replace(/^,\s*/, "");
        item.low = round(item.low - delta);
        item.high = round(item.high + delta);
        item.end += pm[0].length;
        // The band's own figure ("2%", "50 basis points") is part of this one.
        while (raw[i + 1] && raw[i + 1].at < item.end) i++;
      }
    }
    item.approx = APPROX.test(s.slice(Math.max(0, item.at - 40), item.at)) || /\bapproximately\b/i.test(s.slice(Math.max(0, item.at - 60), item.at));
    out.push(item);
  }
  return out;
}

const round = (x) => (x === null || !Number.isFinite(x) ? null : Math.round(x * 1e6) / 1e6);
const GROWTH = /\b(grow(?:th)?|grew|increase[sd]?|up|rise|rose|risen|higher|gain(?:ed|s)?|climb(?:ed)?|jump(?:ed)?|surged?|decline[sd]?|down|decrease[sd]?|lower|fell|fall(?:ing)?|drop(?:ped)?|slipped|change)\b/i;

// Words that do not make a measure a part of itself: "fourth quarter revenue" is revenue,
// "AI semiconductor revenue" is not.
const GENERIC = new Set(["the", "our", "its", "their", "total", "net", "consolidated", "quarterly", "annual", "fiscal", "full", "year", "full-year", "quarter", "first", "second", "third", "fourth", "first-quarter", "second-quarter", "third-quarter", "fourth-quarter", "gaap", "non-gaap", "adjusted", "reported", "and", "of", "for", "to", "is", "be", "in", "a", "an", "on", "with", "expected", "expects", "expect", "expecting", "guidance", "outlook", "company", "company's", "organic", "overall", "diluted", "basic", "this", "next", "current", "period", "both", "now", "updated", "group", "initiates", "raises", "maintains", "reaffirms", "updates", "sees", "forecasting", "forecast", "projected", "that", "we", "it", "as", "at", "by", "q1", "q2", "q3", "q4",
  "deliver", "generate", "produce", "achieve", "reach", "return", "grow", "see", "have", "pay", "keep", "hit", "post", "drive", "improve", "reduce", "remain", "continue", "accelerate", "record", "approximately", "about", "roughly", "around",
  "had", "has", "was", "were", "reported", "posted", "generated", "recorded", "delivered", "achieved", "earned", "booked", "made", "saw", "its", "total", "annual", "quarterly", "full", "year's", "quarter's",
  "strong", "solid", "robust", "healthy", "continued", "higher", "lower", "double-digit", "single-digit", "global", "worldwide", "sequential", "basis", "blended", "combined"]);
const FILLER = /\b(?:of|to|be|is|are|at|approximately|approx|about|around|roughly|guidance|expected|expects|range|the|in|between|from|for|will|now|an|a)\s*$/i;

const SIDE = /,\s*(?:absorbing|including|includes|included|which|reflecting|reflects|excluding|excludes|driven|led by|based on|assuming|assumes|net of|offset|partially|primarily|compared|versus|vs\.?)\b|\band (?:pay|return|repurchase|reduce|invest|buy|retire|fund|includes?)\b/i;
// A side clause that moves to another subject even before the measure has a figure: "growth in
// revenue, including eCommerce, which grew 23%".
const SIDE_SUBJECT = /,\s*(?:including|includes|led by|driven by|partially offset|offset by|primarily)\b/i;
// What a side figure is about: the words after it ("$6 billion increase in fuel costs"), else the
// words before it ("a fuel price of approximately $4.25").
function sideLabel(sentence, at) {
  const after = sentence.slice(at).replace(/^\S+(?:\s(?:thousand|million|billion|per \w+))?/i, "").match(/^\s*([a-z][\w -]{2,60}?)(?=[,.;]|\s(?:and|but|which|while)\b|$)/i)?.[1]?.trim();
  if (after && after.split(/\s+/).length >= 2) return after;
  let label = clauseBefore(sentence, at).replace(/[^\w\s&'%/-]/g, " ").trim().split(/\s+/).slice(-6).join(" ");
  for (let prev = null; prev !== label;) { prev = label; label = label.replace(FILLER, "").trim(); }
  return label || null;
}

// The clause a figure sits in: from the last sentence end (a full stop and a space, not a decimal
// point), semicolon or bullet up to the figure.
function clauseBefore(sentence, at) {
  const before = sentence.slice(0, at);
  let start = 0;
  for (const m of before.matchAll(/[.;!?]["”']?\s+|[•▪●]/g)) {
    // "Walmart U.S. comp sales": an abbreviation's full stop does not end the clause.
    if (m[0][0] === "." && /\b(?:U\.S|U\.K|No|approx|vs|e\.g|i\.e|Inc|Corp|Co|Ltd)$/.test(before.slice(0, m.index))) continue;
    start = m.index + m[0].length;
  }
  return before.slice(start);
}

// The measure a figure belongs to: the last measure named before it in its clause, else the
// first after it. A measure with its own qualifier ("Data Center revenue") is returned as a label.
function measureNear(sentence, at, own = new Set(), lookAfter = true) {
  const clause = clauseBefore(sentence, at);
  let best = null, bestAt = -1, bestLen = 0;
  for (const [key, re] of MEASURES) {
    for (const m of clause.matchAll(new RegExp(re.source, "gi"))) {
      // The measure named last wins; where two overlap ("comparable sales" holds "sales"), the
      // longer one, which ends at the same place or later.
      const end = m.index + m[0].length, bestEnd = bestAt + bestLen;
      if (end > bestEnd || (end === bestEnd && m[0].length > bestLen)) { best = key; bestAt = m.index; bestLen = m[0].length; }
    }
  }
  if (best) {
    const lead = clause.slice(0, bestAt).split(",").pop().replace(/[^\w\s&'.-]/g, " ").split(/\s+/).filter(Boolean).slice(-5);
    const words = [];
    for (let k = lead.length - 1; k >= 0; k--) {
      const w = lead[k].toLowerCase();
      // A name joined by "and" between capitalized words: "System Design and Analysis".
      if ((w === "and" || w === "&") && k > 0 && words.length && /^[A-Z]/.test(lead[k - 1]) && /^[A-Z]/.test(words[0])) { words.unshift(lead[k]); continue; }
      // A possessive ("Apple's", "the company's") names whose measure it is, not a part of it.
      if (GENERIC.has(w) || own.has(w) || /['’]s$/.test(w) || /\d|^q[1-4]$/.test(w) || !/[a-z]/.test(w)) break;
      words.unshift(lead[k]);
    }
    const phrase = clause.slice(bestAt, bestAt + bestLen);
    if (words.length) return { measure: null, label: `${words.join(" ")} ${phrase}`.trim(), base: best, qualifier: words.join(" ") };
    // So does a name after it: "Revenue in Productivity and Business Processes", "sales at Sam's
    // Club". A time ("Revenue in the Second Quarter") or a basis ("from Continuing Operations") is
    // not a part of the business.
    const part = clause.slice(bestAt + bestLen).match(/^\s+(?:in|at|from)\s+(?:the\s+)?([A-Z][\w&'’.-]*(?:\s+(?:and|&|of|[A-Z][\w&'’.-]*))*)/);
    if (part && !NOT_A_PART.test(part[1])) return { measure: null, label: `${phrase} ${part[0].trim()}`, base: best, qualifier: part[1] };
    // After the measure's own figure, a side clause names something else: "a pre-tax profit of
    // $4.5 billion, absorbing a $6 billion increase in fuel costs".
    const between = clause.slice(bestAt + bestLen);
    if ((/\d/.test(between) && SIDE.test(between)) || SIDE_SUBJECT.test(between)) return { measure: null, label: sideLabel(sentence, at) };
    return { measure: best, label: null };
  }
  const after = sentence.slice(at, at + 80).toLowerCase();
  const m = lookAfter ? measureOf(after) : null;
  if (m) return { measure: m, label: null };
  // No measure named: the words before the figure, without the filler around it.
  let label = clause.replace(/[^\w\s&'%/-]/g, " ").trim().split(/\s+/).slice(-7).join(" ");
  for (let prev = null; prev !== label;) { prev = label; label = label.replace(FILLER, "").trim(); }
  return { measure: null, label: label || null };
}

const NOT_A_PART = /^(?:Q[1-4]|FY|Fiscal|First|Second|Third|Fourth|Full|Quarter|Year|Calendar|January|February|March|April|May|June|July|August|September|October|November|December|Continuing|Discontinued|Operations|Ongoing|Constant|Local|Comparable|GAAP|Non-GAAP|U\.S\. Dollars?)\b/;

const pick = (low, high) => (low === null || high === null ? null : round((low + high) / 2));

const DECLINE = /\b(?:decline[sd]?|declining|down|decrease[sd]?|decreasing|lower|drop(?:ped)?|fall|fell|slipped|contract(?:ed|ion)?)\b(?:\s+(?:of|by))?(?:\s+(?:approximately|about|around|roughly))?\s*$/i;
const signed = (f, sentence) => DECLINE.test(sentence.slice(Math.max(0, f.at - 40), f.at)) && f.f.pct && !/basis|bps/.test(f.f.pct);
// A change in points or basis points that is a decrease ("operating margin decreased 190 basis points").
const fallsBy = (f, sentence) => DECLINE.test(sentence.slice(Math.max(0, f.at - 40), f.at));

function itemFrom(f, measure, sentence, extra = {}) {
  const unit = unitOf(f.f, measure);
  // "Net earnings were $4.8 billion, or $4.79 per diluted share": a per-share figure of earnings is EPS.
  if (/per share$/.test(unit ?? "") && (measure === "net_income" || measure === "revenue")) measure = "eps";
  const growth = f.f.pct && (GROWTH.test(sentence.slice(Math.max(0, f.at - 45), f.at)) || signed(f, sentence)) && !/margin|rate/.test(measure ?? "") ? "growth" : null;
  // A decline is negative growth: "a decline of 10% to 11%" is -11 to -10.
  const [low, high] = growth && signed(f, sentence) ? [-f.high, -f.low] : [f.low, f.high];
  const mid = pick(low, high);
  return {
    measure, ...extra,
    low: round(low), high: round(high), mid,
    unit, ...(growth ? { change: growth } : {}), ...(f.approx ? { approximate: true } : {}), ...(f.plusMinus ? { stated_as: f.plusMinus } : {}),
    ...(f.low !== f.high && mid ? { width_pct_of_mid: round(Math.abs((f.high - f.low) / mid) * 100) } : {}),
    ...(f.decimals != null ? { decimals: f.decimals } : {}),
  };
}

// Words for a range without numbers, kept as words.
const QUALITATIVE = /\b(?:(?:low|mid|high)[- ](?:single|double)[- ]digits?|(?:low|mid|high)[- ]teens|flat(?:tish)?|in line with|similar to)\b/i;

// The guidance items in sentences: each figure with the measure, basis and period it is for.
export function guidanceFromSentence(sentence, context = {}) {
  const out = [];
  const own = new Set(String(context.company ?? "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 2));
  for (const f of figuresIn(sentence)) {
    // Outside an outlook section a figure is guidance only when an expectation is stated before it
    // in its sentence ("Revenue was $89 billion" is a result; "we expect $108 billion" is not).
    if (!context.section && !FORWARD.test(sentence.slice(0, f.at))) continue;
    const { measure, label } = measureNear(sentence, f.at, own);
    // A figure with no measure is kept only when an expectation is stated before it ("an ASR of
    // $25 billion is expected" is not guidance on a measure; "$200M raise ... reflects" neither).
    if (!measure && !FORWARD.test(sentence.slice(0, f.at))) continue;
    const item = itemFrom(f, measure, sentence);
    const local = sentence.slice(Math.max(0, f.at - 160), f.end);
    // "GAAP and non-GAAP ... X and Y, respectively": the first value is GAAP, the second non-GAAP.
    const both = basisOf(local);
    const basis = f.respectively !== undefined && both === "GAAP and non-GAAP" ? (f.respectively === 0 ? "GAAP" : "non-GAAP") : both;
    out.push({
      ...(label && !measure ? { label } : {}),
      ...item,
      basis: basis ?? context.basis ?? null,
      period: periodOf(sentence.slice(f.end, f.end + 40).match(/^\s*,?\s*(?:for|in|during)\s+(?:the\s+)?[^,.;]{2,36}/i)?.[0] ?? "") ?? periodOf(local) ?? periodOf(sentence.slice(f.end, f.end + 60)) ?? context.period ?? periodOf(sentence.slice(0, f.at)) ?? null,
      quote: sentence.trim(),
    });
  }
  if (!out.length) {
    const q = sentence.match(QUALITATIVE);
    const measure = measureOf(sentence);
    if (q && measure) out.push({ measure, low: null, high: null, mid: null, unit: null, words: q[0], basis: basisOf(sentence) ?? context.basis ?? null, period: periodOf(sentence) ?? context.period ?? null, quote: sentence.trim() });
  }
  return out;
}

// Footnote marks glued to words ("EPS1", "comp sales2", "(cc)1") are split off, so "EPS" reads as EPS.
export const unglue = (text) => String(text).replace(/([A-Za-z)]{2,})(\d)(?=[\s,.;:)]|$)/g, "$1 $2");

// Sentences of a line, without splitting decimals ("$5.10") or abbreviations ("U.S.", "Inc.").
export function sentences(line) {
  return String(line).split(/(?<=[.;])\s+(?=[A-Z•▪●"“(])/).map((x) => x.trim()).filter(Boolean)
    .reduce((acc, x) => { if (acc.length && /\b(?:U\.S|No|approx|vs|e\.g|i\.e)\.$/.test(acc[acc.length - 1])) acc[acc.length - 1] += ` ${x}`; else acc.push(x); return acc; }, []);
}

const HEADING = /^(?:[\w&,.' -]{0,40}\s)?(?:business |financial |fiscal |full[- ]year |quarterly |current |updated |annual )?(?:outlook|guidance|expectations|looking ahead)(?:\s[\w&,.' -]{0,40})?:?$/i;
const STOP = /^(?:about |forward[- ]looking|conference call|webcast|use of non-gaap|non-gaap (?:financial )?measures?|reconciliation|safe harbor|investor (?:relations|contact)|media (?:relations|contact)|contacts?:?$|additional information|supplemental|condensed consolidated|consolidated (?:statements|balance))/i;
const FORWARD = /\b(?:expects?|expected|expecting|expectations?|estimates?|estimated|anticipates?|anticipated|projects?|projected|forecasts?|forecasted|forecasting|guid(?:ance|es|ed|ing)|outlook|reaffirm\w*|sees|targets?|will|to be|plans? to)\b/i;
const VERBS = /\b(?:expects?|expected|expecting|anticipates?|anticipated|projects?|projected|forecasts?|forecasted|forecasting|guid(?:ance|es|ed|ing)|outlook|reaffirm\w*|raises?|raising|initiates?|maintains?|sees|targets?)\b/i;
const BOILERPLATE = /forward-looking|risks and uncertainties|actual results (?:could|may)|undue reliance|could cause|safe harbor|based on the following|is based on (?:the )?(?:prior|last)[- ]year/i;

// A line that heads a new part of a release ("Highlights", "Data Center", "Quarterly Dividend").
const HEADING_LIKE = (line) => line.length < 60 && !/[.:;,]$/.test(line) && !/^[•▪●*-]/.test(line) && !/\d{3,}|\$/.test(line.replace(/\b20\d{2}\b/g, "")) && /^[A-Z0-9]/.test(line) && line.split(/\s+/).length <= 8;

// The outlook in a release's text: lines under an outlook heading (to the next heading), and
// anywhere else, sentences that state an expectation with a figure. Table rows are left to
// guidanceFromTable.
export function guidanceFromText(text, context = {}) {
  const lines = unglue(text).split("\n").map((l) => l.trim()).filter(Boolean);
  const out = [];
  const seen = new Set();
  let section = null;
  const last = { quarter: null, year: null };
  lines.forEach((line, i) => {
    if (line.length < 90 && HEADING.test(line) && !/^(?:reaffirm|raise|update|initiate|maintain|provide|issue|lower|cut|narrow|withdraw|reiterate)\w*\b/i.test(line) && !/[$%]|\d+\.\d|\d{3,}/.test(line.replace(/\b20\d{2}\b|\bfy ?\d{2,4}\b|\bq[1-4]\b/gi, ""))) {
      // "Revenue Environment and Outlook" mixes results with the outlook: its figures need an
      // expectation stated before them, as outside a section.
      section = { heading: line, period: periodOf(line), from: i, body: 0, pure: !/\b(?:and|results|performance|environment|highlights|review|summary|recap)\b/i.test(line) };
      return;
    }
    if (section && (STOP.test(line) || i - section.from > 30 || (section.body > 0 && HEADING_LIKE(line)))) section = null;
    if (section) section.body++;
    // "NVIDIA's outlook for the third quarter of fiscal 2027 is as follows:" names the section's period.
    if (section && /\b(?:outlook|guidance)\b/i.test(line) && /:$/.test(line) && periodOf(line)) section.period = periodOf(line);
    if (line.includes(" | ")) return;
    for (const s of sentences(line)) {
      if (BOILERPLATE.test(s) || seen.has(s)) continue;
      const pure = Boolean(section?.pure);
      if (!pure && !VERBS.test(s)) continue;
      if (!pure && !/\b(?:quarter|year|annual|fiscal|fy|q[1-4]|20\d{2}|month|period|next|full)\b/i.test(s)) continue;
      const items = guidanceFromSentence(s, { period: section?.period ?? null, section: pure, company: context.company }).filter((x) => x.measure || (x.label && x.label.length > 2));
      // "... for the quarter" means the quarter named just before; "for the year", the year.
      for (const x of items) {
        if (/^for the quarter$/i.test(x.period ?? "") && last.quarter) x.period = last.quarter;
        else if (/^for the year$/i.test(x.period ?? "") && last.year) x.period = last.year;
        else if (x.period && quarterOf(x.period)) last.quarter = x.period;
        else if (x.period && /\b(?:year|fiscal|fy|20\d{2})\b/i.test(x.period)) last.year = x.period;
      }
      if (items.length) { seen.add(s); out.push(...items.map((x) => ({ ...x, ...(section ? { section: section.heading } : {}) }))); }
    }
  });
  return out;
}

// A guidance table names itself: "Outlook" or "Guidance" in its title, its headers, the prose
// inside it, or one of its heading rows ("Fourth Quarter Fiscal 2026 Outlook"). The prose above a
// table only counts in its last line, so "...narrowed our free cash flow expectations" above a
// table of results does not make it guidance.
export function isGuidanceTable(t) {
  const lastLine = String(t.caption ?? "").split(" / ").at(-1);
  const headings = t.rows.filter((r) => r.slice(1).every((v) => v === null || v === "")).map((r) => r[0]).slice(0, 6);
  // "Cisco expects to achieve the following results for the first quarter:" introduces one too.
  const intro = /:\s*$/.test(lastLine) && /\b(?:expects?|expected|anticipates?|outlook|guidance|forecasts?|estimates?)\b/i.test(lastLine);
  return intro || /\b(?:outlook|guidance)\b/i.test([lastLine, t.heading ?? "", ...t.columns, ...(t.notes ?? []), ...headings].join(" "));
}

// Guidance tables (rows of measures, columns of periods or bases): each cell's figures parsed.
export function guidanceFromTable(t) {
  const out = [];
  const head = t.columns.slice(1);
  // The table's own title row ("(in millions, except per share data)") counts as context too.
  const ctx = `${t.caption ?? ""} ${t.heading ?? ""} ${(t.notes ?? []).join(" ")}`;
  // "($ in billions)" in a header or caption is the scale of its dollar figures.
  const scaleIn = (text) => { const m = String(text).match(/\$\s*in\s+(thousands|millions|billions)|in\s+(thousands|millions|billions)\b/i); return m ? (m[1] ?? m[2]).toLowerCase().replace(/s$/, "") : null; };
  let heading = null;
  for (const raw of t.rows) {
    const label = unglue(String(raw[0] ?? "")).trim();
    if (!label) continue;
    // A row with a label and no values heads the rows under it ("Fiscal year 2027", "Third quarter").
    if (raw.slice(1).every((v) => v === null || v === "")) { heading = label; continue; }
    // "$ 10,250 | +/- | $ 500": a band written across cells is one figure.
    const row = [raw[0]];
    for (let k = 1; k < raw.length; k++) {
      if (/^(?:\+\/-|±|plus or minus)$/i.test(String(raw[k] ?? "").trim()) && row.length > 1 && raw[k + 1] != null) { row[row.length - 1] = `${row[row.length - 1]} +/- ${raw[k + 1]}`; row.push(null, null); k++; continue; }
      row.push(raw[k]);
    }
    row.slice(1).forEach((cell, j) => {
      if (cell === null || cell === "" || /^unchanged$/i.test(String(cell))) return;
      const text = typeof cell === "number" ? String(cell) : String(cell);
      const header = head[j] ?? "";
      // A results column beside the outlook ("2026 Outlook | 2025 Actual") is not guidance.
      if (/\b(?:actual|actuals|reported|results?)\b/i.test(header) && !/\b(?:outlook|guidance|forecast|expected)\b/i.test(header)) return;
      const sentence = `${label}: ${text}`;
      const measure = measureOf(label) ?? measureOf(header);
      const figures = typeof cell === "number" ? [{ at: label.length + 2, end: sentence.length, low: cell, high: cell, f: { cur: null, scale: null, pct: null, after: "" } }] : figuresIn(text, { bare: /\+\/-|±/.test(text) }).map((f) => ({ ...f, at: f.at + label.length + 2, end: f.end + label.length + 2 }));
      const scale = scaleIn(header) ?? scaleIn(ctx);
      for (const f of figures) {
        if (scale && !f.f.pct && !f.f.scale && measure !== "eps" && !/per share/i.test(label)) f.f = { ...f.f, cur: f.f.cur ?? "$", scale };
        const item = itemFrom(f, measure, sentence);
        const safeCtx = BOILERPLATE.test(ctx) ? "" : ctx;
        out.push({ ...(measure ? {} : { label }), ...item, from: "table", basis: basisOf(`${label} ${header}`) ?? basisOf(safeCtx), period: periodOf(header) ?? periodOf(label) ?? periodOf(heading ?? "") ?? periodOf(safeCtx), column: header || null, quote: `${label} | ${header ? `${header}: ` : ""}${text}` });
      }
    });
  }
  return out;
}

// Results in a release's text: the measure, its value and the sentence, in the order they appear.
export function resultsFromText(text, max = 400) {
  const lines = unglue(text).split("\n").map((l) => l.trim()).filter(Boolean).slice(0, max);
  const out = [];
  // Lines under a heading that names a part of the business ("Data Center") are that part's
  // results, even when the sentence says only "revenue was $89.0 billion".
  let section = null, skipping = false, scope = null;
  for (const line of lines) {
    const heading = headingOf(line);
    // A subheadline ("Reaffirms Fiscal 2026 Guidance") is not a section.
    if (heading && SUBHEADLINE.test(heading)) continue;
    if (heading) {
      // Boilerplate and outlook sections hold no results: "About Walmart", "Fiscal 2027 Outlook".
      // A heading that joins the outlook to something else ("Revenue Environment and Outlook")
      // still has results.
      skipping = NO_RESULTS.test(heading) || (/\b(?:outlook|guidance|expectations)\b/i.test(heading) && !/\b(?:results?|highlights?|summary)\b|\s(?:and|&)\s/i.test(heading));
      // A part of the business is named in title case, after the company's own results begin:
      // "Data Center", "Walmart U.S.", not a contact's name above the release or "Three Months Ended".
      section = !skipping && out.length && !WHOLE.test(heading) && isPartName(heading) ? heading : null;
      // "Full-Year Highlights" or "Fourth-Quarter Results": the period the lines under it cover.
      scope = scopeOf(heading);
      continue;
    }
    if (skipping || BOILERPLATE.test(line) || STOP.test(line) || line.includes(" | ")) continue;
    // A line that introduces a list names the period of the lines under it: "For the full year:".
    if (/:$/.test(line) && line.split(/\s+/).length <= 8 && !/\d[\d,.]*\s*(?:%|percent|million|billion)|\$/.test(line) && scopeOf(line)) { scope = scopeOf(line); continue; }
    for (const s of sentences(line)) {
      if (VERBS.test(s) && !/\b(?:was|were|reported|delivered|grew|increased|decreased|declined|totaled|came in|of)\b/i.test(s)) continue;
      // "This compares to revenue of $5.84 billion, gross margin of ...": last year's figures only.
      if (/^\W*(?:this|these|that|which)\s+(?:compares?|compared)\b/i.test(s)) continue;
      let prev = null, comparedEnd = null;
      const paired = {};
      const figs = figuresIn(s);
      for (const [k, f] of figs.entries()) {
        if (f.low !== f.high) continue;
        // The figures compared against are earlier periods', not results: "$2.92 compared to
        // $3.10", "$54.23 billion versus $41.46 billion for the prior quarter and $11.32 billion for
        // the same period last year".
        const gap = s.slice(figs[k - 1]?.end ?? Math.max(0, f.at - 40), f.at);
        const chain = comparedEnd !== null ? s.slice(comparedEnd, f.at) : null;
        if (COMPARED.test(gap) || (chain !== null && !measureOf(chain) && !/[;]|\.\s/.test(chain) && !GROWTH.test(chain))) { comparedEnd = f.end; continue; }
        // Guidance, assumptions and impacts are not results: "we expect a headwind of over 100bps",
        // "affected sales by $1.5 billion", "includes 80 bps headwind from health & wellness".
        const clause = clauseBefore(s, f.at);
        if (VERBS.test(clause) || /\bassum(?:es?|ing|ptions?)\b/i.test(clause) || (IMPACT.test(clause) && /\bby\s*$/i.test(clause)) || IMPACT_AFTER.test(s.slice(f.end, f.end + 30))) continue;
        // "decreased 9%, or 10% on a constant dollar basis": the second figure shares the first's sign.
        const sameSign = prev && prev.negative && /^\s*,?\s*or\s+$/i.test(s.slice(prev.end, f.at));
        let { measure, base, qualifier } = measureNear(s, f.at, new Set(), false);
        // A measure of a named part of the business ("Data Center revenue", "revenue in Intelligent
        // Cloud") is that part's result. Deferred or recurring revenue, an average price, or words
        // that are not a name ("services", "where") are left out.
        let part = section;
        if (!measure && base) {
          const q = qualifier.replace(/^[^A-Za-z0-9]+/, "");
          if (!isPartName(q) || CHANGES_MEANING.test(q)) continue;
          measure = base;
          // Under a heading, the part is the heading's ("Walmart U.S. eCommerce"), said once.
          const [a, b] = [section ?? "", q].map((x) => x.toLowerCase());
          part = !a || a.includes(b) ? (a ? section : q) : b.includes(a) ? q : `${section} ${q}`;
        }
        if (!measure) continue;
        // The words after a figure name that figure, not the next one: "$1.4 billion in cash and
        // cash equivalents and it had $593.7 million of available capacity".
        const between = k > 0 ? s.slice(figs[k - 1].end, f.at).split(/[,;)]|\band (?:it|we|the company|they)\b|\bwhile\b|\bwith\b/i)[0] : "";
        if (/^\s*(?:in|of)\s/i.test(between) && measureOf(between) === measure && measureNear(s, figs[k - 1].at, new Set(), false).measure !== measure) continue;
        // A measure named right after the figure is the figure's: "with a 4.6% operating margin".
        measure = measureAt(s.slice(f.end, f.end + 40)) ?? measure;
        let unit = unitOf(f.f, measure);
        if (/per share$/.test(unit ?? "") && (measure === "net_income" || measure === "revenue")) measure = "eps";
        // A change in points is a rate's: "gross profit rate up 96 bps", "gross profit grew 158 bps";
        // so is a percent of revenue ("operating income was 37.4% of revenue"). A margin in dollars
        // is the profit ("gross margin was $3.48 billion"). A per-share measure needs a per-share
        // figure ("1.15 billion diluted shares" is not EPS).
        const share = unit === "%" && /^\s*of (?:total |net |our )?(?:[\w&'’-]+\s+){0,3}?(?:revenues?|sales)\b/i.test(s.slice(f.end, f.end + 60));
        if ((unit === "percentage points" || unit === "bps" || share) && RATE_OF[measure]) measure = RATE_OF[measure];
        // Any other share of revenue is a ratio, not the measure's level or growth ("operating
        // expenses ... were 39.4% of revenue", "53 percent of total TurboTax revenue"); a figure that
        // describes what follows it is about that ("on 8 percent higher capacity").
        else if ((share && !/margin|rate/.test(measure)) || /^\s*(?:higher|lower|more|fewer|less|additional)\s+[a-z]/i.test(s.slice(f.end, f.end + 30))) continue;
        if (f.f.cur && AMOUNT_OF[measure]) measure = AMOUNT_OF[measure];
        if (measure === "eps" && !f.f.pct && (f.f.scale || !/per share$/.test(unitOf(f.f, measure) ?? ""))) {
          // "Net earnings of $284 million" is net income; any other amount read as EPS is dropped.
          if (!f.f.scale || !/\bnet earnings\b/i.test(clause)) continue;
          measure = "net_income";
          unit = unitOf(f.f, measure);
        }
        // A margin's "up 0.4 percentage points" is a change, not a level; so is an amount after "an
        // increase of" or "up".
        const change = unit === "percentage points" || unit === "bps" || (!f.f.pct && AMOUNT_CHANGE.test(s.slice(Math.max(0, f.at - 30), f.at))) ? "change" : f.f.pct && (GROWTH.test(s.slice(Math.max(0, f.at - 45), f.at)) || signed(f, s)) && !/margin|rate/.test(measure) ? "growth" : null;
        const negative = (change === "growth" && (signed(f, s) || sameSign)) || (change === "change" && fallsBy(f, s));
        const value = negative ? -f.low : f.low;
        // The basis can follow the figure ("5% on a constant dollar basis"), up to the next figure
        // or clause; else a change has its level's basis ("GAAP EPS of $4.29, up 119%").
        const after = s.slice(f.end, Math.min(figs[k + 1]?.at ?? f.end + 40, f.end + 40)).split(/\band\b|[,;]/)[0];
        const from = Math.max(0, figs[k - 1]?.end ?? f.at - 120);
        const cut = s.slice(from, f.at).search(/[)(][^)(]*$/);
        const named = basisOf(s.slice(cut >= 0 ? from + cut + 1 : from, f.end) + after) ?? (prev?.measure === measure ? prev.named : null);
        let basis = named;
        // "GAAP and non-GAAP earnings per diluted share were $2.46 and $2.22, respectively": one each.
        if (basis === "GAAP and non-GAAP" && /\brespectively\b/i.test(s)) {
          const n = paired[measure] ?? 0;
          paired[measure] = n + 1;
          if (n < 2) basis = n === 0 ? "GAAP" : "non-GAAP";
        }
        prev = { end: f.end, negative, measure, named };
        out.push({ measure, value, unit, basis, change, versus: change ? versusOf(s, f.end) : null, section: part, scope: scopeOf(clause) ?? scope, decimals: f.decimals, quote: s });
      }
    }
  }
  return out;
}

// A section heading: a short line of words between paragraphs ("Data Center", "Outlook", "Q2
// Fiscal 2027 Summary"), not a bullet, a sentence, a table row or a file name.
export function headingOf(line) {
  // A line ending in a figure and a full stop is a sentence ("Revenue was 309.1bn."), not a heading.
  if (line.length > 60 || /[|$%•▪●]|[.!?]["”']?\s|[:;!?]$|(?:[a-z]{4,}|\d[\w.]*)\.$/.test(line) || /\.(?:htm|html|txt|pdf)$|^(?:EX-|exhibit\s+)\d|^page\s+\d/i.test(line)) return null;
  return /^[A-Z]/.test(line) && /[A-Za-z]{3}/.test(line) && line.split(/\s+/).length <= 6 ? line : null;
}
// Headings about the whole company's results rather than a part of the business.
const WHOLE = /\b(?:summary|highlights?|outlook|guidance|results?|overview|financials?|quarter(?:ly)?|fiscal|year|annual|updates?|recent|developments?|commentary|conference|webcast|calls?|gaap|non-gaap|measures?|about|capital|returns?|dividends?|repurchases?|shareholders?|stockholders?|liquidity|cash|balance|statements?|reconciliations?|forward|harbor|contacts?|media|investors?|business|operating|performance|key|metrics|other|corporate|strategic|consolidated|total|revenues?|sales|margins?|income|earnings|expenses|profit|eps|release|immediate|press|news|announces?|reports?|company|corporation|inc|notes?|tables?|months|ended|q[1-4]|fy\s?\d+|\d{4})\b/i;

// What a change is measured against, from the words after it: "up 18% from the previous quarter
// and up 117% from a year ago".
const VERSUS = [
  [/^[\s,]*(?:\([^)]{0,40}\)\s*)?(?:year[- ]over[- ]year|y\/y|yoy)\b|^[\s,]*(?:\([^)]{0,40}\)\s*)?(?:from|over|versus|vs\.?|compared (?:to|with)|against)\s+(?:the\s+|a\s+)?(?:year[- ]ago|year[- ]earlier|prior[- ]year|previous[- ]year|last[- ]year|same (?:quarter|period) (?:a |of the )?(?:last|prior|previous) year)/i, "year over year"],
  [/^[\s,]*(?:\([^)]{0,40}\)\s*)?(?:sequentially|quarter[- ]over[- ]quarter|q\/q|qoq)\b|^[\s,]*(?:\([^)]{0,40}\)\s*)?(?:from|over|versus|vs\.?|compared (?:to|with)|against)\s+(?:the\s+)?(?:previous|prior|preceding|last|sequential) quarter/i, "quarter over quarter"],
];
const NO_RESULTS = /^(?:about\b|forward[- ]looking|safe harbor|cautionary|(?:use of )?non-gaap (?:financial )?(?:measures?|information|reconciliations?)|reconciliations?\b|conference call|webcast|contacts?\b|investors? (?:relations|contacts?)\b|media (?:relations|contacts?)\b|definitions?\b)/i;
const SUBHEADLINE = /^(?:reaffirms?|raises?|updates?|initiates?|lowers?|narrows?|maintains?|provides?|announces?|reports?|delivers?|declares?|increases?|achieves?|posts?|records?|expands?|completes?|launches?|sets?|exceeds?|beats?|generates?|returns?)\b/i;
const CHANGES_MEANING = /\b(?:deferred|unearned|recurring|estimated|future|expected|backlog|remaining|pro forma|run[- ]rate|average|annualized|bookings|incremental|cumulative|potential|unit|per)\b/i;
const AMOUNT_OF = { gross_margin: "gross_profit", operating_margin: "operating_income", net_margin: "net_income", pretax_margin: "pretax_income" };
// The name of a part of the business: one to five words starting with a capital ("Data Center",
// "Walmart U.S.", "eCommerce", "System Design and Analysis"), no figures, roles, measures or
// connecting words.
function isPartName(q) {
  const words = q.split(/\s+/).filter(Boolean);
  // Capitals throughout are a table's title ("NOTES TO TABLE A"), not a part's name.
  return words.length >= 1 && words.length <= 5 && /^(?:[A-Z]|[a-z]+[A-Z])/.test(words[0]) && !/\d/.test(q) && !/[-–—]{2}/.test(q) && (words.length === 1 || /[a-z]/.test(q))
    && !/\b(?:CEO|CFO|COO|Chair(?:man|woman)?|President|Officer|Director|Vice|Executive|Founder|Chief|Months|Weeks|Ended|Period|Where|Which|While|When|Whose|That|Delivers?|Generates?|Reported|Reports?|Revenues?|Sales|Income|Earnings|Margins?|Profit)\b/i.test(q);
}
const IMPACT = /\b(?:affected|impacted|benefit(?:ed|ted)?|hurt|helped|boosted|weighed on|reduced|lowered|raised)\b/i;
const IMPACT_AFTER = /^\s*(?:of\s+)?(?:headwinds?|tailwinds?|impacts?|benefits?|drag|contribution|unfavorable|favorable)\b/i;
const AMOUNT_CHANGE = /\b(?:an?\s+)?(?:increase|decrease|decline|rise|drop|reduction|improvement)\s+of\s*$|\b(?:up|down|increased|decreased|declined|rose|fell|grew)\s+(?:by\s+)?$/i;
const RATE_OF = { gross_profit: "gross_margin", operating_income: "operating_margin", net_income: "net_margin", pretax_income: "pretax_margin", ebitda: "ebitda_margin" };
const COMPARED = /\b(?:compar(?:ed|es?) (?:to|with)|versus|vs\.?|from)\s*(?:approximately\s+|about\s+)?$|\b(?:compar(?:ed|es?) (?:to|with)|versus|vs\.?)\s+(?:(?!was\b|were\b|is\b|are\b|increased\b|decreased\b|grew\b|rose\b|fell\b)[\w&'’()-]+\s+){1,6}(?:of|at|was|were)\s+(?:approximately\s+|about\s+)?$/i;
// The measure a text starts with, after a basis word: " operating margin" gives operating_margin;
// " of revenue" gives none (a share is read separately).
function measureAt(text) {
  const t = String(text).toLowerCase().replace(/^\s*(?:(?:gaap|non-gaap|adjusted|total|net)\s+)*/, "");
  if (/^of\b/.test(t)) return null;
  for (const [key, re] of MEASURES) { const m = t.match(re); if (m && m.index === 0) return key; }
  return null;
}
// Whether a text speaks of a quarter or a whole year; the mention nearest its end wins ("Fourth-
// quarter revenue grew 14 percent, full year fiscal 2026 revenue grew 14 percent").
function scopeOf(text) {
  let at = -1, scope = null;
  for (const m of String(text).matchAll(/\b(?:full[- ](?:fiscal )?year|fiscal year|for the year|twelve months|annual)\b|\b(?:quarter|q[1-4]|three months)\b/gi)) {
    if (m.index > at) { at = m.index; scope = /quarter|q[1-4]|three months/i.test(m[0]) ? "quarter" : "year"; }
  }
  return scope;
}
const versusOf = (s, end) => VERSUS.find(([re]) => re.test(s.slice(end, end + 80)))?.[1] ?? null;

// Last quarter's guidance against this quarter's results, where both name the same measure and
// basis in the same unit. The verdict is the position against the range, nothing more. A result
// under a part of the business ("Data Center") does not answer the company's guide, and growth
// from the previous quarter does not answer a growth guide.
export function compareGuidance(guided, results) {
  const rows = [];
  for (const g of guided) {
    if (!g.measure || g.low === null || g.unit === null) continue;
    // A result for both bases ("GAAP and non-GAAP gross margins were both 75.0%") answers either guide.
    const sameBasis = (x) => g.basis === "GAAP and non-GAAP" || (x.basis ?? null) === (g.basis ?? null) || (!g.basis && x.basis === "GAAP") || (x.basis === "GAAP and non-GAAP" && (g.basis === "GAAP" || g.basis === "non-GAAP"));
    // The most precise statement of the result: "$18.68 billion" rather than the headline's "$18.7 billion".
    // Nor does a full year's result answer a quarter's guide, or a quarter's the year's.
    const quarterly = Boolean(quarterOf(g.period ?? "")), yearly = !quarterly && /\b(?:year|fy|fiscal|annual)/i.test(g.period ?? "");
    const r = results.filter((x) => !x.section && !(x.change === "growth" && x.versus === "quarter over quarter") && !(quarterly && x.scope === "year") && !(yearly && x.scope === "quarter") && x.measure === g.measure && x.unit === g.unit && (x.change ?? null) === (g.change === "decline" ? "growth" : g.change ?? null) && sameBasis(x)).reduce((best, x) => (!best || (x.decimals ?? 0) > (best.decimals ?? 0) ? x : best), null);
    if (!r) continue;
    const scale = g.unit === "%" || g.unit === "percentage points" ? 100 : null;
    const vsLow = round(r.value - g.low), vsHigh = round(r.value - g.high);
    // "$2.4 billion" cannot be placed in a range stated to the hundredth.
    const rounded = r.decimals != null && g.decimals != null && r.decimals < g.decimals;
    const place = r.value > g.high ? "above the range" : r.value < g.low ? "below the range" : "within the range";
    rows.push({
      measure: g.measure, basis: g.basis ?? null, period: g.period ?? null, unit: g.unit,
      guided_low: g.low, guided_high: g.high, actual: r.value,
      vs_low: vsLow, vs_high: vsHigh, ...(scale ? { vs_low_bps: round(vsLow * scale), vs_high_bps: round(vsHigh * scale) } : {}),
      position: rounded ? `not placed: the result is stated to ${r.decimals} decimal${r.decimals === 1 ? "" : "s"}, the guide to ${g.decimals}` : g.approximate ? `${place} (the guide was approximate)` : place,
      guidance_quote: g.quote, result_quote: r.quote,
    });
  }
  return rows;
}
