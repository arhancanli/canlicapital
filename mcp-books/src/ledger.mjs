// mcp-books/src/ledger.mjs
//
// The double-entry core of Canli Books. A book is one append-only list of records: the opening record
// (name and currency), then accounts, journal entries and period locks in the order they were made. Each
// record carries the hash of the one before it, so an edit anywhere in the history shows in verify().
// Amounts are whole numbers of the currency's smallest unit (cents, fils, yen), so nothing is lost to
// floating point. A posted entry never changes: a mistake is corrected by a reversing entry. Nothing dated
// on or before a lock can be posted.
import { createHash } from "node:crypto";

export const TYPES = ["asset", "liability", "equity", "income", "expense"];
const DEBIT_NORMAL = new Set(["asset", "expense"]);

// ISO 4217 currencies whose smallest unit is not a hundredth.
const MINOR_UNITS = { BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3, BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0, PYG: 0, RWF: 0, UGX: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0 };
export const minorUnits = (currency) => MINOR_UNITS[currency] ?? 2;

// "1234.56" -> 123456 in a two-decimal currency. Only a plain positive decimal is read: no signs,
// separators or exponents, and no more decimals than the currency has. An amount that cannot be read
// exactly is refused, never rounded.
export function toMinor(amount, currency) {
  const text = String(amount ?? "").trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) throw new Error(`"${text}" is not a plain amount such as 1234.56 (no signs, commas or exponents)`);
  const digits = minorUnits(currency);
  const fraction = match[2] ?? "";
  if (fraction.length > digits) throw new Error(`${currency} has ${digits} decimal places, and "${text}" has ${fraction.length}`);
  const value = BigInt(match[1]) * 10n ** BigInt(digits) + BigInt(fraction.padEnd(digits, "0") || "0");
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`"${text}" is too large to keep exactly`);
  return Number(value);
}

// 123456 -> "1234.56" in a two-decimal currency.
export function fromMinor(value, currency) {
  const digits = minorUnits(currency);
  const text = String(Math.abs(value)).padStart(digits + 1, "0");
  return `${value < 0 ? "-" : ""}${digits ? `${text.slice(0, -digits)}.${text.slice(-digits)}` : text}`;
}

export const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);

function checkDates(...dates) {
  for (const date of dates) if (date !== undefined && !isDate(date)) throw new Error(`"${date}" is not a real date in the form 2026-01-31`);
}

// A record's hash is SHA-256 over its other fields as JSON with sorted keys, so anyone can recompute it.
const canonical = (v) => (Array.isArray(v) ? `[${v.map(canonical).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}` : JSON.stringify(v));

export function hashRecord(record) {
  const { hash, ...fields } = record;
  return createHash("sha256").update(canonical(fields)).digest("hex");
}

// The checks every record must pass, both when it is made and when verify() replays the book.
function checkOpen(record) {
  if (record?.kind !== "open") throw new Error("A book starts with its opening record");
  if (!/^[A-Z]{3}$/.test(record.currency)) throw new Error(`Currency "${record.currency}" is not a three-letter code such as USD or AED`);
}

function checkAccount(s, { code, name, type }) {
  if (typeof code !== "string" || !/^[A-Za-z0-9][A-Za-z0-9.-]{0,19}$/.test(code)) throw new Error(`Account code "${code}" must be 1 to 20 letters, digits, dots or dashes`);
  if (s.accounts.has(code)) throw new Error(`Account ${code} already exists`);
  if (!TYPES.includes(type)) throw new Error(`Account type "${type}" must be one of ${TYPES.join(", ")}`);
  if (typeof name !== "string" || !name) throw new Error(`Account ${code} needs a name`);
}

function checkPostingDate(s, date) {
  checkDates(date);
  if (date === undefined) throw new Error("An entry needs a date in the form 2026-01-31");
  if (s.lockedThrough && date <= s.lockedThrough) throw new Error(`The books are locked through ${s.lockedThrough}, so nothing dated ${date} can be posted`);
}

const mirror = (lines) => lines.map((l) => (l.debit !== undefined ? { account: l.account, credit: l.debit } : { account: l.account, debit: l.credit }));

// Lines here are already in the currency's smallest unit.
function checkEntry(s, { date, lines, reverses }) {
  checkPostingDate(s, date);
  if (!Array.isArray(lines) || lines.length < 2) throw new Error("An entry needs at least two lines");
  let debits = 0;
  let credits = 0;
  lines.forEach((line, i) => {
    if (!s.accounts.has(line?.account)) throw new Error(`Line ${i + 1}: there is no account ${line?.account || "(blank)"} in this book`);
    const sides = ["debit", "credit"].filter((side) => line[side] !== undefined);
    if (sides.length !== 1) throw new Error(`Line ${i + 1}: give a debit or a credit, not both or neither`);
    const amount = line[sides[0]];
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error(`Line ${i + 1}: the amount must be more than zero`);
    if (sides[0] === "debit") debits += amount;
    else credits += amount;
  });
  if (!Number.isSafeInteger(debits) || !Number.isSafeInteger(credits)) throw new Error("The entry's totals are too large to keep exactly");
  if (debits !== credits) throw new Error(`Debits ${fromMinor(debits, s.currency)} and credits ${fromMinor(credits, s.currency)} differ by ${fromMinor(Math.abs(debits - credits), s.currency)}`);
  if (reverses !== undefined) {
    const original = s.entries.find((e) => e.seq === reverses);
    if (!original) throw new Error(`There is no entry ${reverses} to reverse`);
    if (s.reversed.has(reverses)) throw new Error(`Entry ${reverses} has already been reversed`);
    if (canonical(mirror(original.lines)) !== canonical(lines)) throw new Error(`A reversal of entry ${reverses} must swap its debits and credits exactly`);
  }
}

function checkLock(s, { through }) {
  checkDates(through);
  if (through === undefined) throw new Error("A lock needs a date in the form 2026-01-31");
  if (s.lockedThrough && through <= s.lockedThrough) throw new Error(`The books are already locked through ${s.lockedThrough}; a lock only moves forward`);
}

const CHECKS = { account: checkAccount, entry: checkEntry, lock: checkLock };

// What the records add up to: the accounts, the entries, which entries were reversed, the latest lock.
const emptyState = (open) => ({ name: open.name, currency: open.currency, accounts: new Map(), entries: [], reversed: new Set(), lockedThrough: null });

function apply(s, record) {
  if (record.kind === "account") s.accounts.set(record.code, record);
  else if (record.kind === "entry") {
    s.entries.push(record);
    if (record.reverses !== undefined) s.reversed.add(record.reverses);
  } else if (record.kind === "lock") s.lockedThrough = record.through;
}

export function state(book) {
  const [open, ...rest] = book.records;
  checkOpen(open);
  const s = emptyState(open);
  for (const record of rest) apply(s, record);
  return s;
}

function append(book, fields) {
  const last = book.records.at(-1);
  const record = { seq: book.records.length + 1, ...fields, prev: last ? last.hash : "" };
  record.hash = hashRecord(record);
  book.records.push(record);
  return record;
}

export function openBook({ name, currency = "USD", accounts = [] } = {}) {
  const open = { kind: "open", name: String(name ?? "").trim() || "Books", currency: String(currency).toUpperCase() };
  checkOpen(open);
  const book = { records: [] };
  append(book, open);
  for (const account of accounts) addAccount(book, account);
  return book;
}

export function addAccount(book, { code, name, type } = {}) {
  const fields = { kind: "account", code: String(code ?? "").trim(), name: String(name ?? "").trim() || String(code ?? "").trim(), type };
  checkAccount(state(book), fields);
  return append(book, fields);
}

// Lines take amounts as plain decimals ("1050.00"); the book keeps them in the smallest unit. A source names the
// documents behind the entry (the Cirrun receipts it records), kept in the record and so under its hash.
export function post(book, { date, memo = "", lines, source } = {}) {
  if (source !== undefined && (source === null || typeof source !== "object" || Array.isArray(source) || JSON.stringify(source).length > 200000)) throw new Error("An entry's source is an object of at most 200,000 characters as JSON");
  const s = state(book);
  const converted = (Array.isArray(lines) ? lines : []).map((line, i) => {
    const given = ["debit", "credit"].filter((side) => line?.[side] !== undefined && line?.[side] !== null && line?.[side] !== "");
    if (given.length !== 1) throw new Error(`Line ${i + 1}: give a debit or a credit, not both or neither`);
    return { account: String(line.account ?? "").trim(), [given[0]]: toMinor(line[given[0]], s.currency) };
  });
  const fields = { kind: "entry", date, memo: String(memo).slice(0, 500), lines: converted, ...(source === undefined ? {} : { source }) };
  checkEntry(s, fields);
  return append(book, fields);
}

// The correction for a posted entry: the same lines with debits and credits swapped, dated in an open
// period. The original stays in the book.
export function reverse(book, seq, { date, memo } = {}) {
  const s = state(book);
  const original = s.entries.find((e) => e.seq === seq);
  if (!original) throw new Error(`There is no entry ${seq} to reverse`);
  const fields = { kind: "entry", date: date ?? original.date, memo: String(memo ?? `Reverses entry ${seq}`).slice(0, 500), lines: mirror(original.lines), reverses: seq };
  checkEntry(s, fields);
  return append(book, fields);
}

export function lock(book, through) {
  const fields = { kind: "lock", through };
  checkLock(state(book), fields);
  return append(book, fields);
}

// Debit and credit totals per account over entries dated within [from, to]; either end may be open.
function totals(s, { from, to } = {}) {
  checkDates(from, to);
  const sums = new Map([...s.accounts.keys()].map((code) => [code, { debit: 0, credit: 0 }]));
  for (const entry of s.entries) {
    if ((from !== undefined && entry.date < from) || (to !== undefined && entry.date > to)) continue;
    for (const line of entry.lines) {
      const t = sums.get(line.account);
      t.debit += line.debit ?? 0;
      t.credit += line.credit ?? 0;
    }
  }
  return sums;
}

// A balance in the account's own direction: debit less credit for assets and expenses, credit less debit
// for liabilities, equity and income. A contra account (accumulated depreciation) comes out negative.
const balanceOf = (type, t) => (DEBIT_NORMAL.has(type) ? t.debit - t.credit : t.credit - t.debit);
const sum = (rows) => rows.reduce((total, row) => total + row.amount, 0);
const section = (s, sums, type) => [...s.accounts.values()].filter((a) => a.type === type).map((a) => ({ code: a.code, name: a.name, amount: balanceOf(type, sums.get(a.code)) })).filter((row) => row.amount !== 0);

export function trialBalance(book, { asOf } = {}) {
  const s = state(book);
  const sums = totals(s, { to: asOf });
  const rows = [];
  for (const account of s.accounts.values()) {
    const t = sums.get(account.code);
    const net = t.debit - t.credit;
    if (net !== 0) rows.push({ code: account.code, name: account.name, type: account.type, debit: Math.max(net, 0), credit: Math.max(-net, 0) });
  }
  const debit = rows.reduce((total, row) => total + row.debit, 0);
  const credit = rows.reduce((total, row) => total + row.credit, 0);
  return { currency: s.currency, asOf: asOf ?? null, rows, debit, credit, balanced: debit === credit };
}

export function incomeStatement(book, { from, to } = {}) {
  const s = state(book);
  const sums = totals(s, { from, to });
  const income = section(s, sums, "income");
  const expenses = section(s, sums, "expense");
  return { currency: s.currency, from: from ?? null, to: to ?? null, income, expenses, totalIncome: sum(income), totalExpenses: sum(expenses), netIncome: sum(income) - sum(expenses) };
}

// Assets against liabilities, equity and the earnings not yet closed into equity. The two sides agree
// whenever every entry balanced, which post() and verify() both insist on.
export function balanceSheet(book, { asOf } = {}) {
  const s = state(book);
  const sums = totals(s, { to: asOf });
  const assets = section(s, sums, "asset");
  const liabilities = section(s, sums, "liability");
  const equity = section(s, sums, "equity");
  const earningsToDate = sum(section(s, sums, "income")) - sum(section(s, sums, "expense"));
  const totalAssets = sum(assets);
  const totalLiabilitiesAndEquity = sum(liabilities) + sum(equity) + earningsToDate;
  return { currency: s.currency, asOf: asOf ?? null, assets, liabilities, equity, earningsToDate, totalAssets, totalLiabilities: sum(liabilities), totalEquity: sum(equity), totalLiabilitiesAndEquity, balanced: totalAssets === totalLiabilitiesAndEquity };
}

// Every entry behind an account's balance, in date order, with the running balance.
export function explain(book, code, { from, to } = {}) {
  const s = state(book);
  const account = s.accounts.get(code);
  if (!account) throw new Error(`There is no account ${code} in this book`);
  checkDates(from, to);
  const touching = s.entries.filter((e) => e.lines.some((l) => l.account === code)).sort((a, b) => (a.date === b.date ? a.seq - b.seq : a.date < b.date ? -1 : 1));
  let opening = 0;
  let balance = 0;
  const rows = [];
  for (const entry of touching) {
    if (to !== undefined && entry.date > to) break;
    const change = entry.lines.filter((l) => l.account === code).reduce((total, l) => total + balanceOf(account.type, { debit: l.debit ?? 0, credit: l.credit ?? 0 }), 0);
    balance += change;
    if (from !== undefined && entry.date < from) {
      opening = balance;
      continue;
    }
    rows.push({ seq: entry.seq, date: entry.date, memo: entry.memo, change, balance, ...(entry.reverses !== undefined ? { reverses: entry.reverses } : {}) });
  }
  return { code, name: account.name, type: account.type, currency: s.currency, opening, rows, closing: balance };
}

// Walks the book from the start: each record must be numbered in order, point to the record before it,
// match its own hash, and pass the same checks post() applies. A book cut short, or a rewrite that
// recomputes every hash, would pass the first three, so keep the head hash returned here somewhere else
// (an email, a commit) and compare it later.
export function verify(book) {
  const records = book?.records ?? [];
  if (!records.length) return { ok: false, at: 0, problem: "the book is empty" };
  let prev = "";
  let s = null;
  for (const [i, record] of records.entries()) {
    const at = i + 1;
    const fail = (problem) => ({ ok: false, at, problem });
    if (record?.seq !== at) return fail(`record ${at} is numbered ${record?.seq}`);
    if (record.prev !== prev) return fail("it does not point to the record before it");
    if (hashRecord(record) !== record.hash) return fail("its contents do not match its hash");
    try {
      if (at === 1) {
        checkOpen(record);
        s = emptyState(record);
      } else {
        const check = CHECKS[record.kind];
        if (!check) throw new Error(`unknown kind of record "${record.kind}"`);
        check(s, record);
        apply(s, record);
      }
    } catch (error) {
      return fail(error.message);
    }
    prev = record.hash;
  }
  return { ok: true, records: records.length, head: prev };
}

// One record per line: saving a new record is appending one line to the file.
export const toJsonl = (book) => `${book.records.map((record) => JSON.stringify(record)).join("\n")}\n`;

export function fromJsonl(text) {
  const records = String(text).split("\n").filter((line) => line.trim()).map((line, i) => {
    try {
      return JSON.parse(line);
    } catch {
      throw new Error(`Line ${i + 1} of the book file is not JSON`);
    }
  });
  return { records };
}
