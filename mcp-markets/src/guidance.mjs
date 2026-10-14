// Guidance in a results press release: the outlook a company gives for the next quarter or year,
// each figure parsed into a range (low, high, midpoint) with its unit, the measure it is for and
// the period, and always the sentence or table row it came from. Nothing is inferred beyond the
// words: "approximately $34.8 billion" is one value marked approximate; "$108.0 billion, plus or
// minus 2%" is $105.84 to $110.16 billion; "low single digits" stays words.

const SCALE = { thousand: "thousand", k: "thousand", million: "million", m: "million", mn: "million", mm: "million", billion: "billion", b: "billion", bn: "billion", trillion: "trillion", t: "trillion" };

// Measures people guide on, most specific first. A label that is none of these is kept as written.
const MEASURES = [
  ["pretax_margin", /\bpre-?tax (?:profit |income )?margins?\b/],
  ["gross_margin", /\bgross (?:profit )?margins?\b/],
  ["operating_margin", /\b(?:operating|op\.?) (?:income |profit )?margins?(?: rate)?\b/],
  ["net_margin", /\bnet (?:income |profit )?margins?\b/],
  ["ebitda_margin", /\bebitda margins?\b/],
  ["eps", /\b(?:diluted |basic )?(?:earnings|eps|net income|income|loss)(?: \(loss\))? (?:per (?:diluted )?share|attributable to [\w .]+? per share)\b|\beps\b|\bearnings of\b/],
  ["comparable_sales", /\b(?:comparable|comp|same[- ]store|like-for-like)(?: store)?(?: sales)?\b/],
  ["free_cash_flow", /\bfree cash flows?\b/],
  ["operating_cash_flow", /\b(?:operating cash flows?|cash flows? from operations|cash from operations)\b/],
  ["capex", /\b(?:capital expenditures?|capex|capital spending|capital investments?)\b/],
  ["tax_rate", /\b(?:effective )?(?:income )?tax (?:rates?|provision(?: rate)?)\b/],
  ["operating_income", /\b(?:operating (?:income|profit|earnings))\b/],
  ["pretax_income", /\bpre-?tax (?:profit|income|earnings)\b/],
  ["net_income", /\bnet (?:income|earnings)\b/],
  ["ebitda", /\bebitda\b/],
  ["operating_expenses", /\b(?:operating expenses|opex)\b/],
  ["interest_expense", /\binterest (?:expense|, net)\b/],
  ["share_count", /\b(?:diluted )?(?:share count|shares outstanding|weighted[- ]average (?:diluted )?shares)\b/],
  ["revenue", /\b(?:total |net |consolidated )?(?:revenues?|net sales|sales)\b/],
];
const BASIS = [["constant currency", /\bconstant (?:currency|dollars?)\b|\(cc\)|\bin cc\b/gi], ["non-GAAP", /\bnon-?gaap\b/gi], ["adjusted", /\badjusted\b|\badj\.(?=\s)/gi], ["GAAP", /(?<!non-?)\bgaap\b/gi]];

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
export function figuresIn(sentence) {
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
    } else if (a.cur || a.pct || a.scale) {
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
const GROWTH = /\b(grow(?:th)?|increase[sd]?|up|rise|higher|decline[sd]?|down|decrease[sd]?|lower|change)\b/i;

// Words that do not make a measure a part of itself: "fourth quarter revenue" is revenue,
// "AI semiconductor revenue" is not.
const GENERIC = new Set(["the", "our", "its", "their", "total", "net", "consolidated", "quarterly", "annual", "fiscal", "full", "year", "full-year", "quarter", "first", "second", "third", "fourth", "first-quarter", "second-quarter", "third-quarter", "fourth-quarter", "gaap", "non-gaap", "adjusted", "reported", "and", "of", "for", "to", "is", "be", "in", "a", "an", "on", "with", "expected", "expects", "expect", "expecting", "guidance", "outlook", "company", "company's", "organic", "overall", "diluted", "basic", "this", "next", "current", "period", "both", "now", "updated", "group", "initiates", "raises", "maintains", "reaffirms", "updates", "sees", "forecasting", "forecast", "projected", "that", "we", "it", "as", "at", "by", "q1", "q2", "q3", "q4",
  "deliver", "generate", "produce", "achieve", "reach", "return", "grow", "see", "have", "pay", "keep", "hit", "post", "drive", "improve", "reduce", "remain", "continue", "accelerate", "record", "approximately", "about", "roughly", "around"]);
const FILLER = /\b(?:of|to|be|is|are|at|approximately|approx|about|around|roughly|guidance|expected|expects|range|the|in|between|from|for|will|now|an|a)\s*$/i;

const SIDE = /,\s*(?:absorbing|including|includes|included|which|reflecting|reflects|excluding|excludes|driven|based on|assuming|assumes|net of|offset|partially|primarily|compared|versus|vs\.?)\b|\band (?:pay|return|repurchase|reduce|invest|buy|retire|fund)\b/i;
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
  for (const m of before.matchAll(/[.;!?]["”']?\s+|[•▪●]/g)) start = m.index + m[0].length;
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
    const lead = clause.slice(0, bestAt).replace(/[^\w\s&'-]/g, " ").split(/\s+/).filter(Boolean).slice(-4);
    const words = [];
    for (let k = lead.length - 1; k >= 0; k--) {
      const w = lead[k].toLowerCase();
      if (GENERIC.has(w) || own.has(w) || /^(?:fy)?['’]?\d+$|^q[1-4]$|^fy\d+$/.test(w)) break;
      words.unshift(lead[k]);
    }
    const phrase = clause.slice(bestAt, bestAt + bestLen);
    if (words.length) return { measure: null, label: `${words.join(" ")} ${phrase}`.trim() };
    // After the measure's own figure, a side clause names something else: "a pre-tax profit of
    // $4.5 billion, absorbing a $6 billion increase in fuel costs".
    const between = clause.slice(bestAt + bestLen);
    if (/\d/.test(between) && SIDE.test(between)) return { measure: null, label: sideLabel(sentence, at) };
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

const pick = (low, high) => (low === null || high === null ? null : round((low + high) / 2));

const DECLINE = /\b(?:decline[sd]?|declining|down|decrease[sd]?|decreasing|lower|drop(?:ped)?|fall|fell|contract(?:ed|ion)?)\b(?:\s+(?:of|by))?(?:\s+(?:approximately|about|around|roughly))?\s*$/i;
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
const FORWARD = /\b(?:expects?|expected|expecting|anticipates?|anticipated|projects?|projected|forecasts?|forecasted|forecasting|guid(?:ance|es|ed|ing)|outlook|reaffirm\w*|sees|targets?|will|to be|plans? to)\b/i;
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
      if (!pure && !/\b(?:quarter|year|fiscal|fy|q[1-4]|20\d{2}|month|period|next|full)\b/i.test(s)) continue;
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

// Guidance tables (rows of measures, columns of periods or bases): each cell's figures parsed.
export function guidanceFromTable(t) {
  const out = [];
  const head = t.columns.slice(1);
  const ctx = `${t.caption ?? ""} ${(t.notes ?? []).join(" ")}`;
  // "($ in billions)" in a header or caption is the scale of its dollar figures.
  const scaleIn = (text) => { const m = String(text).match(/\$\s*in\s+(thousands|millions|billions)|in\s+(thousands|millions|billions)\b/i); return m ? (m[1] ?? m[2]).toLowerCase().replace(/s$/, "") : null; };
  let heading = null;
  for (const row of t.rows) {
    const label = unglue(String(row[0] ?? "")).trim();
    if (!label) continue;
    // A row with a label and no values heads the rows under it ("Fiscal year 2027", "Third quarter").
    if (row.slice(1).every((v) => v === null || v === "")) { heading = label; continue; }
    row.slice(1).forEach((cell, j) => {
      if (cell === null || cell === "" || /^unchanged$/i.test(String(cell))) return;
      const text = typeof cell === "number" ? String(cell) : String(cell);
      const header = head[j] ?? "";
      const sentence = `${label}: ${text}`;
      const measure = measureOf(label) ?? measureOf(header);
      const figures = typeof cell === "number" ? [{ at: label.length + 2, end: sentence.length, low: cell, high: cell, f: { cur: null, scale: null, pct: null, after: "" } }] : figuresIn(text).map((f) => ({ ...f, at: f.at + label.length + 2, end: f.end + label.length + 2 }));
      const scale = scaleIn(header) ?? scaleIn(ctx);
      for (const f of figures) {
        if (scale && !f.f.pct && !f.f.scale && measure !== "eps" && !/per share/i.test(label)) f.f = { ...f.f, cur: f.f.cur ?? "$", scale };
        const item = itemFrom(f, measure, sentence);
        const safeCtx = BOILERPLATE.test(ctx) ? "" : ctx;
        out.push({ ...(measure ? {} : { label }), ...item, basis: basisOf(`${label} ${header}`) ?? basisOf(safeCtx), period: periodOf(header) ?? periodOf(label) ?? periodOf(heading ?? "") ?? periodOf(safeCtx), column: header || null, quote: `${label} | ${header ? `${header}: ` : ""}${text}` });
      }
    });
  }
  return out;
}

// Results in a release's text: the measure, its value and the sentence, in the order they appear.
export function resultsFromText(text, max = 400) {
  const lines = unglue(text).split("\n").map((l) => l.trim()).filter(Boolean).slice(0, max);
  const out = [];
  for (const line of lines) {
    if (BOILERPLATE.test(line) || STOP.test(line) || line.includes(" | ")) continue;
    for (const s of sentences(line)) {
      if (VERBS.test(s) && !/\b(?:was|were|reported|delivered|grew|increased|decreased|declined|totaled|came in|of)\b/i.test(s)) continue;
      let prev = null;
      const figs = figuresIn(s);
      for (const [k, f] of figs.entries()) {
        if (f.low !== f.high) continue;
        // "decreased 9%, or 10% on a constant dollar basis": the second figure shares the first's sign.
        const sameSign = prev && prev.negative && /^\s*,?\s*or\s+$/i.test(s.slice(prev.end, f.at));
        let { measure } = measureNear(s, f.at, new Set(), false);
        if (!measure) continue;
        const unit = unitOf(f.f, measure);
        if (/per share$/.test(unit ?? "") && (measure === "net_income" || measure === "revenue")) measure = "eps";
        // A margin's "up 0.4 percentage points" is a change, not a level.
        const change = unit === "percentage points" || unit === "bps" ? "change" : f.f.pct && (GROWTH.test(s.slice(Math.max(0, f.at - 45), f.at)) || signed(f, s)) && !/margin|rate/.test(measure) ? "growth" : null;
        const negative = (change === "growth" && (signed(f, s) || sameSign)) || (change === "change" && fallsBy(f, s));
        const value = negative ? -f.low : f.low;
        prev = { end: f.end, negative };
        // The basis can follow the figure ("5% on a constant dollar basis"), up to the next figure.
        const basis = basisOf(s.slice(Math.max(0, (figs[k - 1]?.end ?? f.at - 120)), Math.min(figs[k + 1]?.at ?? f.end + 40, f.end + 40)));
        out.push({ measure, value, unit, basis, change, decimals: f.decimals, quote: s });
      }
    }
  }
  return out;
}

// Last quarter's guidance against this quarter's results, where both name the same measure and
// basis in the same unit. The verdict is the position against the range, nothing more.
export function compareGuidance(guided, results) {
  const rows = [];
  for (const g of guided) {
    if (!g.measure || g.low === null || g.unit === null) continue;
    // A result for both bases ("GAAP and non-GAAP gross margins were both 75.0%") answers either guide.
    const sameBasis = (x) => g.basis === "GAAP and non-GAAP" || (x.basis ?? null) === (g.basis ?? null) || (!g.basis && x.basis === "GAAP") || (x.basis === "GAAP and non-GAAP" && (g.basis === "GAAP" || g.basis === "non-GAAP"));
    const r = results.find((x) => x.measure === g.measure && x.unit === g.unit && (x.change ?? null) === (g.change === "decline" ? "growth" : g.change ?? null) && sameBasis(x));
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
