// A short, computed reading of one company history: the latest value, its change on the prior year,
// the compound annual rate across the history, and the range of the last five reported years.
// Every figure comes from the page's own observations, so each history page says something no
// other page says, in words a reader (and a search engine) can use without parsing the table.
//
// Rules that keep the sentences honest:
// - one unit per summary (the unit with the most observations; ties go to the most recent);
// - "a year earlier" only when the prior observation ends 330 to 400 days before the latest;
// - a percent change only against a non-zero prior value, measured against its absolute size;
// - a compound annual rate only over at least three years and only when every value in the span
//   is positive (a rate through a sign change means nothing).

const DAY = 86_400_000;
const days = (a, b) => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY;

function primaryUnit(observations) {
  const byUnit = new Map();
  for (const row of observations) {
    const entry = byUnit.get(row.unit) ?? { count: 0, last: '' };
    entry.count += 1;
    if (row.end > entry.last) entry.last = row.end;
    byUnit.set(row.unit, entry);
  }
  return [...byUnit.entries()].sort(([, a], [, b]) => b.count - a.count || b.last.localeCompare(a.last))[0]?.[0] ?? null;
}

export function historySummary(concept) {
  const unit = primaryUnit(concept.observations ?? []);
  if (!unit) return null;
  const byEnd = new Map();
  for (const row of concept.observations) {
    if (row.unit !== unit || !Number.isFinite(row.val)) continue;
    const kept = byEnd.get(row.end);
    if (!kept || row.filed > kept.filed) byEnd.set(row.end, row);
  }
  const rows = [...byEnd.values()].sort((a, b) => a.end.localeCompare(b.end));
  if (!rows.length) return null;
  const latest = rows.at(-1);
  const prior = [...rows].reverse().find((row) => {
    const gap = days(row.end, latest.end);
    return gap >= 330 && gap <= 400;
  }) ?? null;
  const change = prior && prior.val !== 0 ? { abs: latest.val - prior.val, pct: (latest.val - prior.val) / Math.abs(prior.val) } : null;
  let cagr = null;
  const first = rows[0];
  const years = days(first.end, latest.end) / 365.2425;
  if (rows.length >= 4 && years >= 3 && rows.every((row) => row.val > 0)) {
    cagr = { from: first, to: latest, years, rate: (latest.val / first.val) ** (1 / years) - 1 };
  }
  const recent = rows.slice(-5);
  const range = recent.length >= 3
    ? { n: recent.length, min: recent.reduce((a, b) => (b.val < a.val ? b : a)), max: recent.reduce((a, b) => (b.val > a.val ? b : a)) }
    : null;
  return { unit, count: rows.length, first, latest, prior, change, cagr, range };
}

function significant(value) {
  return value.toFixed(Math.abs(value) >= 10 ? 1 : 2);
}
const WORDS = { 3: 'three', 4: 'four', 5: 'five' };
const periodPhrase = (kind, end) => (kind === 'duration' ? `for the year ending ${end}` : `at ${end}`);

// "$359.2 billion", "15.9 billion shares", "$6.08 per share", "0.47 (pure)".
export function compactAmount(value, unit) {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  const scaled = abs >= 1e12 ? `${significant(abs / 1e12)} trillion` : abs >= 1e9 ? `${significant(abs / 1e9)} billion` : abs >= 1e6 ? `${significant(abs / 1e6)} million` : abs >= 1e4 ? `${significant(abs / 1e3)} thousand` : `${Number(abs.toPrecision(6))}`;
  if (unit === 'USD') return `${sign}$${scaled}`;
  if (unit === 'USD/shares') return `${sign}$${abs.toFixed(2)} per share`;
  if (unit === 'shares') return `${sign}${scaled} shares`;
  if (unit === 'pure') return `${sign}${Number(abs.toPrecision(4))}`;
  return `${sign}${scaled} ${unit}`;
}

export const percent = (fraction) => `${(Math.abs(fraction) * 100).toFixed(1)}%`;

// The plain-language sentences; the caller escapes them for HTML.
export function summarySentences(summary, { company, label, kind }) {
  if (!summary) return [];
  const { latest, prior, change, cagr, range, unit } = summary;
  let first = `${company} reported ${label.toLowerCase()} of ${compactAmount(latest.val, unit)} ${periodPhrase(kind, latest.end)}`;
  if (prior && change) {
    first += change.abs === 0
      ? `, unchanged from a year earlier`
      : `, ${change.abs > 0 ? 'up' : 'down'} ${percent(change.pct)} from ${compactAmount(prior.val, unit)} a year earlier`;
  }
  const sentences = [`${first}.`];
  if (cagr) {
    sentences.push(`From ${cagr.from.end.slice(0, 4)} to ${cagr.to.end.slice(0, 4)} it ${cagr.rate >= 0 ? 'grew' : 'fell'} at a compound ${percent(cagr.rate)} a year, from ${compactAmount(cagr.from.val, unit)} to ${compactAmount(cagr.to.val, unit)}.`);
  }
  if (range && range.min.val !== range.max.val) {
    sentences.push(`Across the last ${WORDS[range.n] ?? range.n} reported years it ranged from ${compactAmount(range.min.val, unit)} (${range.min.end}) to ${compactAmount(range.max.val, unit)} (${range.max.end}).`);
  }
  return sentences;
}

// A search-snippet description, kept near 160 characters.
export function summaryDescription(summary, { company, label, kind }) {
  if (!summary) return null;
  const { latest, change, count, first, unit } = summary;
  const move = change ? (change.abs === 0 ? ', unchanged on the year' : `, ${change.abs > 0 ? 'up' : 'down'} ${percent(change.pct)} on the year`) : '';
  return `${company} ${label.toLowerCase()}: ${compactAmount(latest.val, unit)} ${periodPhrase(kind, latest.end)}${move}. ${count} values since ${first.end.slice(0, 4)} from SEC filings, each linked to its filing.`;
}
