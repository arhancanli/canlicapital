// mcp-books/src/group.mjs
//
// Canli Close: group consolidation. Each company keeps its own book in its own currency, and the group's
// statements are drawn up in one currency with the European Central Bank's euro reference rates. Assets and
// liabilities are translated at the closing rate: the ECB's rate on the balance sheet date, or the last one it
// published before it (it publishes none on weekends and TARGET holidays). Income, expenses and equity are
// translated at the rate on each entry's own date, and a reversal at the rate of the entry it reverses, so the
// two still cancel. What that leaves is the currency translation reserve, in equity. Balances between group
// companies are removed in named sets that should add up to zero; a set that does not is shown as an
// intercompany difference, never hidden. Each conversion is exact until one rounding, half away from zero, and
// the roundings land in the reserve. Wholly owned companies only: goodwill and non-controlling interests are not
// worked out here.
import { parseCsv } from "./close.mjs";
import { isDate, minorUnits, state } from "./ledger.mjs";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// "1.1590" -> { n: 11590n, s: 4 }: a rate as a whole number and its decimal places, so nothing is lost.
function decimal(text, where) {
  const t = String(text ?? "").trim();
  if (!/^\d+(\.\d+)?$/.test(t) || !/[1-9]/.test(t)) throw new Error(`${where}: "${t}" is not a rate such as 1.1590`);
  const [whole, fraction = ""] = t.split(".");
  return { n: BigInt(whole + fraction), s: fraction.length, text: t };
}

function product(a, b) {
  const n = a.n * b.n;
  const s = a.s + b.s;
  const digits = String(n).padStart(s + 1, "0");
  return { n, s, text: s ? `${digits.slice(0, -s)}.${digits.slice(-s)}`.replace(/\.?0+$/, "") : digits };
}

// The daily eurofxref.csv writes dates as "03 November 2026"; everything else the ECB publishes uses 2026-11-03.
function isoDate(text) {
  const t = String(text ?? "").trim();
  const m = /^(\d{1,2}) ([A-Za-z]{3,9}) (\d{4})$/.exec(t);
  const month = m ? MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1 : 0;
  return month ? `${m[3]}-${String(month).padStart(2, "0")}-${m[1].padStart(2, "0")}` : t;
}

// The ECB's euro reference rates (units of each currency per euro) from any file it publishes them in: the Data
// Portal's CSV (series EXR D.<currency>.EUR.SP00.A, format=csvdata), eurofxref-hist.csv or eurofxref.csv, or
// the eurofxref XML (daily, 90 days or the whole history). Returns { USD: [["2026-01-02", "1.1590"], ...] } with
// the dates in order.
export function readEcbRates(text) {
  const s = String(text ?? "");
  const table = {};
  const add = (currency, date, rate, where) => {
    const code = String(currency ?? "").trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) throw new Error(`${where}: "${currency}" is not a currency code`);
    if (!isDate(date)) throw new Error(`${where}: "${date}" is not a real date written 2026-01-31`);
    (table[code] ??= []).push([date, decimal(rate, where).text]);
  };
  if (/<Cube\b/.test(s)) {
    let date;
    for (const [, attrs] of s.matchAll(/<Cube\b([^>]*)>/g)) {
      const attr = (name) => new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`).exec(attrs)?.[1];
      if (attr("time") !== undefined) date = attr("time");
      else if (attr("currency") !== undefined) add(attr("currency"), date, attr("rate"), `ECB rates for ${date}`);
    }
  } else {
    const [header = [], ...rows] = parseCsv(s);
    const names = header.map((h) => h.trim());
    const at = (row, name) => (names.includes(name) ? String(row[names.indexOf(name)] ?? "").trim() : undefined);
    if (names.includes("TIME_PERIOD") && names.includes("OBS_VALUE")) {
      if (!names.includes("CURRENCY")) throw new Error("The ECB rates file has no CURRENCY column");
      rows.forEach((row, i) => {
        // Only the daily reference rate against the euro; the same file can carry monthly averages.
        if ((at(row, "FREQ") ?? "D") !== "D" || (at(row, "CURRENCY_DENOM") ?? "EUR") !== "EUR" || (at(row, "EXR_TYPE") ?? "SP00") !== "SP00" || (at(row, "EXR_SUFFIX") ?? "A") !== "A") return;
        const value = at(row, "OBS_VALUE");
        if (value && value !== "NaN") add(at(row, "CURRENCY"), at(row, "TIME_PERIOD"), value, `ECB rates line ${i + 2}`);
      });
    } else if (names[0]?.toLowerCase() === "date" && names.length > 1 && names.slice(1).every((code) => !code || /^[A-Z]{3}$/.test(code))) {
      rows.forEach((row, i) => {
        const date = isoDate(row[0]);
        names.slice(1).forEach((code, k) => {
          const value = String(row[k + 1] ?? "").trim();
          if (code && value && value !== "N/A") add(code, date, value, `ECB rates line ${i + 2}`);
        });
      });
    }
  }
  if (!Object.keys(table).length) throw new Error("No ECB euro reference rates were found: give the Data Portal CSV, eurofxref-hist.csv, eurofxref.csv or the eurofxref XML");
  for (const [code, list] of Object.entries(table)) {
    list.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    list.forEach(([date, rate], i) => {
      if (i && list[i - 1][0] === date && list[i - 1][1] !== rate) throw new Error(`The ECB rates give ${code} two rates on ${date}: ${list[i - 1][1]} and ${rate}`);
    });
    table[code] = list.filter(([date], i) => !i || list[i - 1][0] !== date);
  }
  return table;
}

const dayNumber = (date) => Date.parse(`${date}T00:00:00Z`) / 864e5;

// Units of a currency per euro on a date: the ECB's rate that day, or the last one published before it, at most
// maxDays earlier. A pegged currency is its base currency's rate times the peg. The euro itself is 1, published
// by nobody.
function perEuro(currency, date, { rates, pegs, maxDays }) {
  if (currency === "EUR") return { published: null, ...decimal("1", "EUR") };
  const peg = pegs[currency];
  if (peg) {
    const base = perEuro(peg.base, date, { rates, pegs: {}, maxDays });
    return { ...product(base, peg.rate), published: base.published };
  }
  const list = rates[currency];
  if (!Object.keys(rates).length) throw new Error(`Translating ${currency} needs the ECB's euro reference rates (rates_file), and none were given`);
  if (!list) throw new Error(`The ECB rates have no ${currency}. The ECB does not publish every currency (not AED or SAR, for example): give a file that has ${currency}, or a peg to one it does`);
  let lo = 0;
  let hi = list.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid][0] <= date) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (found < 0 || dayNumber(date) - dayNumber(list[found][0]) > maxDays) throw new Error(`The ECB rates have no ${currency} rate on ${date} or in the ${maxDays} days before it; give rates that cover ${date}`);
  return { published: list[found][0], ...decimal(list[found][1], `${currency} on ${list[found][0]}`) };
}

// An amount in one currency's smallest unit into another's, through the euro: amount / rate(from) * rate(to),
// exact until one rounding, half away from zero.
function convert(amount, from, to, rateFrom, rateTo) {
  if (!amount) return 0;
  const num = BigInt(amount) * rateTo.n * 10n ** BigInt(minorUnits(to) + rateFrom.s);
  const den = rateFrom.n * 10n ** BigInt(minorUnits(from) + rateTo.s);
  let q = num / den;
  const r = num % den;
  if (2n * (r < 0n ? -r : r) >= den) q += num < 0n ? -1n : 1n;
  if (q > BigInt(Number.MAX_SAFE_INTEGER) || q < -BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`An amount translated into ${to} is too large to keep exactly`);
  return Number(q);
}

const ownDirection = (type) => (type === "asset" || type === "expense" ? 1 : -1);
const BASIS = "Assets and liabilities at the closing rate; income, expenses and equity at the rate on each entry's date (a reversal at the rate of the entry it reverses); the rest is the currency translation reserve. ECB euro reference rates, which the ECB publishes for information. Wholly owned companies: no goodwill or non-controlling interests.";

// The group's trial balance, income statement for [from, asOf] and balance sheet at asOf, in `currency`.
// companies: [{ name, book, map }], where map renames a company's account codes to the group's ({ "2400": "2450" }).
// eliminate: [{ name, lines: [{ company, account }] }], each line a company's own account code; amounts in the
// result are in the group currency, and amounts on elimination lines are debit positive.
export function consolidate(companies, { currency, asOf, from, rates = {}, pegs = {}, eliminate = [], maxDays = 7 } = {}) {
  const group = String(currency ?? "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(group)) throw new Error(`Currency "${currency}" is not a three-letter code such as USD or AED`);
  if (!isDate(asOf)) throw new Error(`as_of "${asOf}" is not a real date in the form 2026-01-31`);
  if (from !== undefined && (!isDate(from) || from > asOf)) throw new Error(`from "${from}" must be a real date on or before ${asOf}`);
  if (!Array.isArray(companies) || !companies.length) throw new Error("Give at least one company");
  const pegged = {};
  for (const [key, peg] of Object.entries(pegs)) {
    const code = key.toUpperCase();
    const base = String(peg?.base ?? "").toUpperCase();
    if (code === "EUR" || rates[code]) throw new Error(`The ECB publishes ${code}, so it takes no peg`);
    if (base !== "EUR" && !rates[base]) throw new Error(Object.keys(rates).length ? `The peg for ${code} is to ${base || "(blank)"}, which the ECB rates do not have` : `Translating ${code} needs the ECB's euro reference rates (rates_file), and none were given`);
    pegged[code] = { base, rate: decimal(peg.rate, `The peg for ${code}`) };
  }
  const env = { rates, pegs: pegged, maxDays };

  const chart = new Map();
  const seen = new Set();
  const parts = companies.map((company) => {
    const name = String(company?.name ?? "").trim();
    if (!name) throw new Error("Every company needs a name");
    if (seen.has(name)) throw new Error(`Two companies are named ${name}`);
    seen.add(name);
    if (!Array.isArray(company.book?.records)) throw new Error(`${name} has no book`);
    const s = state(company.book);
    const map = company.map ?? {};
    for (const code of Object.keys(map)) if (!s.accounts.has(code)) throw new Error(`${name}'s map names account ${code}, which its book does not have`);
    const groupCode = (code) => map[code] ?? code;
    for (const a of s.accounts.values()) {
      const known = chart.get(groupCode(a.code));
      if (known && known.type !== a.type) throw new Error(`Group account ${groupCode(a.code)} would be ${known.type} in ${known.company} and ${a.type} in ${name}`);
      if (!known) chart.set(groupCode(a.code), { code: groupCode(a.code), name: a.name, type: a.type, company: name });
    }

    // Each account's amounts gathered by the date whose rate applies, debit positive in the company's currency.
    const dates = new Map(s.entries.map((e) => [e.seq, e.date]));
    const pieces = new Map();
    for (const e of s.entries) {
      if (e.date > asOf) continue;
      const original = e.reverses !== undefined ? dates.get(e.reverses) : undefined;
      const historic = original !== undefined && original <= e.date ? original : e.date;
      const inPeriod = from === undefined || e.date >= from;
      for (const l of e.lines) {
        const type = s.accounts.get(l.account).type;
        const at = type === "asset" || type === "liability" ? asOf : historic;
        const key = `${l.account}\u0000${at}`;
        if (!pieces.has(key)) pieces.set(key, { code: l.account, at, net: 0, period: 0 });
        const piece = pieces.get(key);
        const net = (l.debit ?? 0) - (l.credit ?? 0);
        piece.net += net;
        if (inPeriod && (type === "income" || type === "expense")) piece.period += net;
      }
    }

    const own = s.currency;
    const rateCache = new Map();
    const ratesOn = (date) => {
      if (!rateCache.has(date)) rateCache.set(date, { from: perEuro(own, date, env), to: perEuro(group, date, env) });
      return rateCache.get(date);
    };
    const balances = new Map();
    for (const p of pieces.values()) {
      const r = own === group ? null : ratesOn(p.at);
      const t = (amount) => (r ? convert(amount, own, group, r.from, r.to) : amount);
      const b = balances.get(p.code) ?? { net: 0, period: 0 };
      b.net += t(p.net);
      b.period += t(p.period);
      balances.set(p.code, b);
    }
    const reserve = [...balances.values()].reduce((sum, b) => sum + b.net, 0);
    const closing = own === group ? null : ratesOn(asOf);
    return {
      name,
      s,
      groupCode,
      balances,
      summary: {
        name,
        currency: own,
        // The date of the ECB rates used for the closing rate (the older one, if the two currencies differ).
        closingRate: closing && { published: [closing.from.published, closing.to.published].filter(Boolean).sort()[0], perEuro: { [own]: closing.from.text, [group]: closing.to.text } },
        // What this company leaves to the currency translation reserve: positive is a gain.
        translationDifference: reserve,
      },
    };
  });

  // Group rows before eliminations, then each set's lines taken out of them.
  const rows = new Map();
  for (const part of parts) {
    for (const [code, b] of part.balances) {
      const row = rows.get(part.groupCode(code)) ?? { net: 0, period: 0 };
      row.net += b.net;
      row.period += b.period;
      rows.set(part.groupCode(code), row);
    }
  }
  const used = new Set();
  const eliminations = eliminate.map((set) => {
    const name = String(set?.name ?? "").trim() || "Intercompany";
    if (!Array.isArray(set?.lines) || set.lines.length < 2) throw new Error(`The elimination "${name}" needs at least two lines`);
    const lines = set.lines.map(({ company, account }) => {
      const part = parts.find((p) => p.name === company);
      if (!part) throw new Error(`The elimination "${name}" names ${company}, which is not one of the companies`);
      if (!part.s.accounts.has(account)) throw new Error(`The elimination "${name}" names account ${account}, which ${company}'s book does not have`);
      const key = `${company}\u0000${account}`;
      if (used.has(key)) throw new Error(`${company}'s account ${account} is in two eliminations`);
      used.add(key);
      const b = part.balances.get(account) ?? { net: 0, period: 0 };
      const row = rows.get(part.groupCode(account));
      if (row) {
        row.net -= b.net;
        row.period -= b.period;
      }
      return { company, account, amount: b.net };
    });
    return { name, lines, difference: lines.reduce((sum, l) => sum + l.amount, 0) };
  });

  // Debit positive, like the rows; 0 - x rather than -x, so that nothing comes out as minus zero.
  const reserveNet = 0 - parts.reduce((sum, p) => sum + p.summary.translationDifference, 0);
  const differenceNet = eliminations.reduce((sum, e) => sum + e.difference, 0);
  const tbRows = [...chart.values()].filter((a) => rows.get(a.code)?.net).map((a) => {
    const net = rows.get(a.code).net;
    return { code: a.code, name: a.name, type: a.type, debit: Math.max(net, 0), credit: Math.max(-net, 0) };
  });
  for (const [name, net] of [["Currency translation reserve", reserveNet], ["Intercompany difference", differenceNet]]) if (net) tbRows.push({ code: null, name, type: "equity", debit: Math.max(net, 0), credit: Math.max(-net, 0) });
  const debit = tbRows.reduce((sum, r) => sum + r.debit, 0);
  const credit = tbRows.reduce((sum, r) => sum + r.credit, 0);

  const section = (type, field) => [...chart.values()].filter((a) => a.type === type && rows.get(a.code)?.[field]).map((a) => ({ code: a.code, name: a.name, amount: ownDirection(type) * rows.get(a.code)[field] }));
  const total = (list) => list.reduce((sum, r) => sum + r.amount, 0);
  const income = section("income", "period");
  const expenses = section("expense", "period");
  const assets = section("asset", "net");
  const liabilities = section("liability", "net");
  const equity = section("equity", "net");
  const earningsToDate = total(section("income", "net")) - total(section("expense", "net"));
  const totalLiabilitiesAndEquity = total(liabilities) + total(equity) - reserveNet - differenceNet + earningsToDate;
  return {
    currency: group,
    asOf,
    from: from ?? null,
    basis: BASIS,
    companies: parts.map((p) => p.summary),
    trialBalance: { rows: tbRows, debit, credit, balanced: debit === credit },
    incomeStatement: { income, expenses, totalIncome: total(income), totalExpenses: total(expenses), netIncome: total(income) - total(expenses) },
    balanceSheet: { assets, liabilities, equity, translationReserve: 0 - reserveNet, intercompanyDifference: 0 - differenceNet, earningsToDate, totalAssets: total(assets), totalLiabilities: total(liabilities), totalEquity: total(equity), totalLiabilitiesAndEquity, balanced: total(assets) === totalLiabilitiesAndEquity },
    eliminations,
  };
}
