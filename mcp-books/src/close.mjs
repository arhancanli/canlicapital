// mcp-books/src/close.mjs
//
// Canli Close: month-end work on a Canli Books book. A bank statement read from CSV and matched against the
// bank account's entries (the same amount, dates at most a few days apart, each line used once); what moved
// between two periods and the entries that moved it; and a checklist of what is left before a month is
// locked.
import { fromMinor, isDate, state, toMinor, trialBalance, verify } from "./ledger.mjs";

// A small CSV reader: quoted fields, doubled quotes inside them, CRLF or LF line ends.
export function parseCsv(text) {
  const s = String(text);
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

// A bank amount: a minus sign or brackets for money out, and commas only as thousands in groups of three
// ("1,234.56"), so "1,5" is refused rather than read as fifteen.
function signedAmount(text, currency, where) {
  let t = String(text ?? "").trim();
  let sign = 1;
  if (/^\(.*\)$/.test(t)) {
    sign = -1;
    t = t.slice(1, -1).trim();
  }
  if (t.startsWith("-")) {
    sign = -sign;
    t = t.slice(1).trim();
  } else if (t.startsWith("+")) t = t.slice(1).trim();
  if (t.includes(",")) {
    if (!/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) throw new Error(`${where}: "${text}" is not a plain amount`);
    t = t.replaceAll(",", "");
  }
  try {
    return sign * toMinor(t, currency);
  } catch (error) {
    throw new Error(`${where}: ${error.message}`);
  }
}

// A statement CSV with a header row naming date and description, and either amount (money in positive) or in
// and out columns. Dates must be written 2026-01-31: 03/01/2026 is refused, because it reads two ways.
export function readStatement(text, currency) {
  const [header, ...lines] = parseCsv(text);
  if (!header) throw new Error("The statement is empty");
  const col = Object.fromEntries(header.map((h, i) => [h.trim().toLowerCase(), i]));
  if (col.date === undefined || col.description === undefined) throw new Error('The statement needs "date" and "description" columns');
  const single = col.amount !== undefined;
  if (!single && (col.in === undefined || col.out === undefined)) throw new Error('The statement needs an "amount" column, or "in" and "out" columns');
  return lines.map((cells, i) => {
    const where = `Statement line ${i + 1}`;
    const date = String(cells[col.date] ?? "").trim();
    if (!isDate(date)) throw new Error(`${where}: the date "${date}" must be a real date written 2026-01-31`);
    const part = (name) => String(cells[col[name]] ?? "").trim();
    const amount = single ? signedAmount(part("amount"), currency, where) : (part("in") ? signedAmount(part("in"), currency, where) : 0) - (part("out") ? signedAmount(part("out"), currency, where) : 0);
    return { line: i + 1, date, description: String(cells[col.description] ?? "").trim(), amount };
  });
}

const direction = (type) => (type === "asset" || type === "expense" ? 1 : -1);
const dayNumber = (date) => Date.parse(`${date}T00:00:00Z`) / 864e5;
const byDate = (a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1);

// Statement lines matched one to one with the account's entries: the same amount and the closest date within
// `days`, earliest statement line first. For a bank (asset) account, money in is positive. Entries that were
// reversed, and their reversals, are left out: they cancel in the books and never reached the bank.
export function reconcile(book, statement, { account = "1000", days = 3, from, to } = {}) {
  const s = state(book);
  const acct = s.accounts.get(account);
  if (!acct) throw new Error(`There is no account ${account} in this book`);
  const inRange = (d) => (from === undefined || d >= from) && (to === undefined || d <= to);
  const books = s.entries
    .filter((e) => !s.reversed.has(e.seq) && e.reverses === undefined && inRange(e.date))
    .map((e) => ({ seq: e.seq, date: e.date, memo: e.memo, amount: direction(acct.type) * e.lines.filter((l) => l.account === account).reduce((t, l) => t + (l.debit ?? 0) - (l.credit ?? 0), 0) }))
    .filter((e) => e.amount !== 0);
  const lines = statement.filter((l) => inRange(l.date)).sort((a, b) => byDate(a, b) || a.line - b.line);
  const used = new Set();
  const matched = [];
  const unmatchedStatement = [];
  for (const line of lines) {
    let best = null;
    for (const e of books) {
      if (used.has(e.seq) || e.amount !== line.amount) continue;
      const gap = Math.abs(dayNumber(e.date) - dayNumber(line.date));
      if (gap <= days && (!best || gap < best.gap)) best = { e, gap };
    }
    if (!best) {
      unmatchedStatement.push(line);
      continue;
    }
    used.add(best.e.seq);
    matched.push({ line: line.line, date: line.date, description: line.description, amount: line.amount, seq: best.e.seq, days: best.gap });
  }
  const unmatchedBooks = books.filter((e) => !used.has(e.seq));
  const statementTotal = lines.reduce((t, l) => t + l.amount, 0);
  const booksTotal = books.reduce((t, e) => t + e.amount, 0);
  return { account, currency: s.currency, matched, unmatchedStatement, unmatchedBooks, statementTotal, booksTotal, difference: statementTotal - booksTotal, reconciled: !unmatchedStatement.length && !unmatchedBooks.length };
}

// What moved between a prior period and the current one, largest change first, with the current period's
// entries that moved each account most. pct is the change as a percentage of the prior amount.
export function variance(book, { from, to, priorFrom, priorTo, top = 3 } = {}) {
  for (const [name, d] of Object.entries({ from, to, priorFrom, priorTo })) if (!isDate(d)) throw new Error(`${name} must be a real date in the form 2026-01-31`);
  const s = state(book);
  const effect = (e, a) => direction(a.type) * e.lines.filter((l) => l.account === a.code).reduce((t, l) => t + (l.debit ?? 0) - (l.credit ?? 0), 0);
  const between = (lo, hi) => s.entries.filter((e) => e.date >= lo && e.date <= hi);
  const rows = [];
  for (const a of s.accounts.values()) {
    const current = between(from, to).reduce((t, e) => t + effect(e, a), 0);
    const prior = between(priorFrom, priorTo).reduce((t, e) => t + effect(e, a), 0);
    if (!current && !prior) continue;
    const drivers = between(from, to).map((e) => ({ seq: e.seq, date: e.date, memo: e.memo, amount: effect(e, a) })).filter((d) => d.amount).sort((x, y) => Math.abs(y.amount) - Math.abs(x.amount)).slice(0, top);
    rows.push({ code: a.code, name: a.name, type: a.type, prior, current, change: current - prior, pct: prior ? Math.round(((current - prior) / Math.abs(prior)) * 1000) / 10 : null, drivers });
  }
  rows.sort((x, y) => Math.abs(y.change) - Math.abs(x.change));
  return { currency: s.currency, from, to, priorFrom, priorTo, rows };
}

// What is left before a month can be locked. Pass the bank reconciliation for the month when there is one.
export function checklist(book, { through, reconciliation } = {}) {
  if (!isDate(through)) throw new Error(`"${through}" is not a real date in the form 2026-01-31`);
  const s = state(book);
  const checked = verify(book);
  const tb = trialBalance(book, { asOf: through });
  const noMemo = s.entries.filter((e) => e.date <= through && !e.memo.trim()).map((e) => e.seq);
  const items = [
    { item: "The book's records and checks pass", done: checked.ok, detail: checked.ok ? `${checked.records} records` : `record ${checked.at}: ${checked.problem}` },
    { item: `The trial balance balances through ${through}`, done: tb.balanced, detail: `debits ${fromMinor(tb.debit, s.currency)}, credits ${fromMinor(tb.credit, s.currency)}` },
    { item: "The bank is reconciled", done: Boolean(reconciliation?.reconciled), detail: reconciliation ? `${reconciliation.unmatchedStatement.length} statement lines and ${reconciliation.unmatchedBooks.length} book entries unmatched` : "not run yet: reconcile the bank statement first" },
    { item: "Every entry has a memo", done: !noMemo.length, detail: noMemo.length ? `entries ${noMemo.join(", ")} have none` : "every entry has one" },
    { item: `The month is locked through ${through}`, done: Boolean(s.lockedThrough && s.lockedThrough >= through), detail: s.lockedThrough ? `locked through ${s.lockedThrough}` : "not locked" },
  ];
  return { through, items, readyToLock: items.slice(0, 4).every((i) => i.done) };
}
