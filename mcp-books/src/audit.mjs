// mcp-books/src/audit.mjs
//
// Canli Audit: tests an auditor runs over a book's journal. Benford's law on the first digits of the amounts,
// read against Nigrini's bands for the mean absolute deviation; and journal-entry tests for round amounts,
// weekend dates, duplicates, amounts just under an approval limit, entries with no memo, and reversals.
// Analytics that point at entries worth a look, never an audit opinion.
import { state, toMinor } from "./ledger.mjs";

const EXPECTED = Array.from({ length: 9 }, (_, i) => Math.log10(1 + 1 / (i + 1)));

// Nigrini's first-digit bands for the mean absolute deviation.
const BANDS = [
  [0.006, "close conformity"],
  [0.012, "acceptable conformity"],
  [0.015, "marginally acceptable conformity"],
  [Infinity, "nonconformity"],
];

// Amounts are whole numbers of the smallest unit; their first digit is the amount's first digit. Below a
// few hundred amounts the test says little, so `enough` is false there.
export function benford(amounts) {
  const counts = Array(9).fill(0);
  for (const amount of amounts) {
    const digit = Number(String(Math.abs(amount))[0]);
    if (digit >= 1) counts[digit - 1] += 1;
  }
  const n = counts.reduce((t, c) => t + c, 0);
  if (!n) return { n: 0, digits: [], mad: null, band: "no amounts", enough: false };
  const digits = counts.map((count, i) => ({ digit: i + 1, count, share: count / n, expected: EXPECTED[i] }));
  const mad = digits.reduce((t, d) => t + Math.abs(d.share - d.expected), 0) / 9;
  return { n, digits, mad, band: BANDS.find(([limit]) => mad <= limit)[1], enough: n >= 300 };
}

const weekday = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();

// limit: an approval limit as a plain amount; entries whose largest line sits within `under` percent below
// it are listed. weekend: days of the week as numbers, Sunday 0 to Saturday 6.
export function journalTests(book, { roundTo = "1000", limit, under = 5, weekend = [6, 0] } = {}) {
  const s = state(book);
  const round = toMinor(roundTo, s.currency);
  const cap = limit === undefined ? null : toMinor(limit, s.currency);
  const entries = s.entries.filter((e) => e.reverses === undefined);
  const amount = (l) => l.debit ?? l.credit;
  const largest = (e) => Math.max(...e.lines.map(amount));
  const key = (e) => `${e.date}|${e.lines.map((l) => `${l.account}:${l.debit !== undefined ? "D" : "C"}${amount(l)}`).sort().join(",")}`;
  const groups = new Map();
  for (const e of entries) groups.set(key(e), [...(groups.get(key(e)) ?? []), e.seq]);
  return {
    entries: entries.length,
    benford: benford(entries.flatMap((e) => e.lines.filter((l) => l.debit !== undefined).map((l) => l.debit))),
    round: entries.filter((e) => e.lines.every((l) => amount(l) % round === 0)).map((e) => e.seq),
    weekend: entries.filter((e) => weekend.includes(weekday(e.date))).map((e) => e.seq),
    duplicates: [...groups.values()].filter((seqs) => seqs.length > 1),
    nearLimit: cap === null ? [] : entries.filter((e) => largest(e) < cap && largest(e) >= cap * (1 - under / 100)).map((e) => e.seq),
    noMemo: entries.filter((e) => !e.memo.trim()).map((e) => e.seq),
    reversed: [...s.reversed],
  };
}
