// What to add to a book, by correlation first. Most searches rank by return and check correlation
// afterwards. This one ranks by how much a candidate adds in independent bets and how it behaves on
// the book's worst days; return comes last, because a high return found by search is the least
// trustworthy number there is.
import { z } from "zod";

import { readPanel } from "./panel-io.mjs";

export const diversifiersInput = z.object({
  book_file: z.string().min(1).max(1000).regex(/^[^\0]+$/, "a file path").describe("A CSV of the book's daily returns: date, then one column per strategy or one for the whole book."),
  candidates_file: z.string().min(1).max(1000).regex(/^[^\0]+$/, "a file path").describe("A CSV of candidates' daily returns: date, then one column each."),
  limit: z.number().int().min(1).max(100).optional().describe("How many to return; default 10."),
  min_days: z.number().int().min(60).max(100000).optional().describe("Days a candidate must share with the book; default 252."),
}).strict();

const round = (x, d = 3) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(d)));
function corr(a, b) {
  const n = a.length;
  if (n < 3) return null;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i += 1) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let up = 0, da = 0, db = 0;
  for (let i = 0; i < n; i += 1) { up += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da > 1e-18 && db > 1e-18 ? up / Math.sqrt(da * db) : null;
}
const annualSharpe = (r) => {
  const m = r.reduce((a, b) => a + b, 0) / r.length, v = r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1);
  return v > 0 ? m / Math.sqrt(v) * Math.sqrt(252) : null;
};
// k for unrelated series, 1 for copies.
function bets(series) {
  const k = series.length;
  let squares = 0;
  for (let i = 0; i < k; i += 1) for (let j = 0; j < k; j += 1) { const c = i === j ? 1 : corr(series[i], series[j]) ?? 1; squares += c * c; }
  return k * k / squares;
}

export function findDiversifiers(args) {
  const a = diversifiersInput.parse(args);
  const book = readPanel(a.book_file, "book_file"), cand = readPanel(a.candidates_file, "candidates_file");
  const minDays = a.min_days ?? 252;
  const cDate = new Map(cand.dates.map((d, i) => [d, i]));
  const shared = book.dates.map((d, i) => [i, cDate.get(d)]).filter(([, j]) => j !== undefined);
  if (shared.length < minDays) throw new RangeError(`The two files share ${shared.length} days and at least ${minDays} are needed.`);
  const rows = [];
  for (const name of cand.tickers) {
    const pairs = shared.filter(([i, j]) => cand.values[name][j] !== null && book.tickers.every((t) => book.values[t][i] !== null));
    if (pairs.length < minDays) continue;
    const bookCols = book.tickers.map((t) => pairs.map(([i]) => book.values[t][i]));
    const whole = pairs.map((_, n) => bookCols.reduce((s, c) => s + c[n], 0) / bookCols.length);
    const c = pairs.map(([, j]) => cand.values[name][j]);
    const worst = [...whole.keys()].sort((x, y) => whole[x] - whole[y]).slice(0, Math.max(20, Math.floor(whole.length / 10)));
    const onWorst = worst.reduce((s, i) => s + c[i], 0) / worst.length;
    const before = bets(bookCols), after = bets([...bookCols, c]);
    rows.push({ name, days: pairs.length, correlation: corr(whole, c), worst_days_correlation: corr(worst.map((i) => whole[i]), worst.map((i) => c[i])), mean_on_worst_days_percent: onWorst * 100, bets_added: after - before, sharpe: annualSharpe(c) });
  }
  if (!rows.length) throw new RangeError(`No candidate shares ${minDays} days with the whole book.`);
  // More independent bets first; among near ties, what it does when the book is at its worst.
  rows.sort((x, y) => (Math.round((y.bets_added - x.bets_added) * 20) / 20) || ((x.worst_days_correlation ?? 1) - (y.worst_days_correlation ?? 1)));
  const shown = rows.slice(0, a.limit ?? 10);
  return {
    book_series: book.tickers.length, candidates_read: rows.length,
    columns: ["candidate", "days", "correlation_with_book", "correlation_on_books_worst_days", "mean_on_books_worst_days_percent", "independent_bets_added", "sharpe_alone"],
    rows: shown.map((r) => [r.name, r.days, round(r.correlation), round(r.worst_days_correlation), round(r.mean_on_worst_days_percent), round(r.bets_added), round(r.sharpe, 2)]),
    meaning: "independent_bets_added is how much the candidate raises the participation ratio of the correlations (1.0 for something wholly unrelated to everything in the book). The worst days are the book's worst tenth. Sharpe is shown last and is not used to rank.",
    limits: [`${rows.length} candidates were compared, so the best of them looks better than it is: judge any one with validate_luck_trials at that many trials.`, "Correlations move, and they tend to rise in a crisis. These are from the days in the files."],
  };
}
