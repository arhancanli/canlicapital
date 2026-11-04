// mcp-books/src/planning.mjs
//
// Canli Treasury and Planning: cash runway from the bank account's own history, budget against actual, a
// forecast from trailing months, and a discounted cash flow valuation that hands back every input. Estimates
// from the inputs shown, not advice.
import { incomeStatement, isDate, state, toMinor } from "./ledger.mjs";

const monthOf = (date) => date.slice(0, 7);

// The `n` calendar months ending with `month` ("2026-03"), oldest first.
function monthsEnding(month, n) {
  let [y, m] = month.split("-").map(Number);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.unshift(`${y}-${String(m).padStart(2, "0")}`);
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}

function needDates(dates) {
  for (const [name, d] of Object.entries(dates)) if (!isDate(d)) throw new Error(`${name} must be a real date in the form 2026-01-31`);
}

// Cash on `through`, and the average monthly change over the `months` calendar months that end with
// through's month. Runway is cash divided by the average monthly fall, when cash is falling.
export function runway(book, { cash = "1000", through, months = 3 } = {}) {
  needDates({ through });
  const s = state(book);
  if (!s.accounts.has(cash)) throw new Error(`There is no account ${cash} in this book`);
  const window = monthsEnding(monthOf(through), months);
  const change = new Map(window.map((m) => [m, 0]));
  let balance = 0;
  for (const e of s.entries) {
    if (e.date > through) continue;
    const delta = e.lines.filter((l) => l.account === cash).reduce((t, l) => t + (l.debit ?? 0) - (l.credit ?? 0), 0);
    balance += delta;
    if (change.has(monthOf(e.date))) change.set(monthOf(e.date), change.get(monthOf(e.date)) + delta);
  }
  const average = Math.round([...change.values()].reduce((t, c) => t + c, 0) / months);
  return { currency: s.currency, account: cash, through, cash: balance, months: window.map((month) => ({ month, change: change.get(month) })), averageChange: average, burning: average < 0, runwayMonths: average < 0 ? Math.round((balance / -average) * 10) / 10 : null };
}

// budget maps income and expense account codes to plain amounts for the period: { "6100": "3000" }.
export function budgetVsActual(book, budget, { from, to } = {}) {
  const s = state(book);
  const is = incomeStatement(book, { from, to });
  const actual = new Map([...is.income, ...is.expenses].map((r) => [r.code, r.amount]));
  return Object.entries(budget).map(([code, amount]) => {
    const a = s.accounts.get(code);
    if (!a || (a.type !== "income" && a.type !== "expense")) throw new Error(`Budget line ${code}: budgets are set on income and expense accounts`);
    const planned = toMinor(amount, s.currency);
    const got = actual.get(code) ?? 0;
    return { code, name: a.name, type: a.type, budget: planned, actual: got, variance: got - planned, pct: planned ? Math.round(((got - planned) / planned) * 1000) / 10 : null };
  });
}

// The next `months` months from the monthly average of [from, to], income growing by `growth` and costs by
// `costGrowth` each month (0.02 is 2%).
export function forecast(book, { from, to, months = 6, growth = 0, costGrowth = 0 } = {}) {
  needDates({ from, to });
  const is = incomeStatement(book, { from, to });
  const [y1, m1] = from.split("-").map(Number);
  const [y2, m2] = to.split("-").map(Number);
  const span = (y2 - y1) * 12 + (m2 - m1) + 1;
  if (span < 1) throw new Error("from must come before to");
  const income = is.totalIncome / span;
  const costs = is.totalExpenses / span;
  const rows = Array.from({ length: months }, (_, i) => {
    const inc = Math.round(income * (1 + growth) ** (i + 1));
    const cost = Math.round(costs * (1 + costGrowth) ** (i + 1));
    return { month: i + 1, income: inc, costs: cost, net: inc - cost };
  });
  return { currency: is.currency, basis: { from, to, months: span, averageIncome: Math.round(income), averageCosts: Math.round(costs), growth, costGrowth }, rows };
}

// Present value of yearly cash flows at `rate`, plus a terminal value growing at `terminalGrowth` after the
// last year. Plain numbers in the currency's main unit; the inputs come back with the result.
export function dcf({ cashFlows, rate, terminalGrowth = 0 } = {}) {
  if (!Array.isArray(cashFlows) || !cashFlows.length || !cashFlows.every(Number.isFinite)) throw new Error("cashFlows must be a list of yearly amounts");
  if (!Number.isFinite(rate) || rate <= -1) throw new Error("rate must be a yearly rate such as 0.1 for 10%");
  if (!(terminalGrowth < rate)) throw new Error("The terminal growth rate must be below the discount rate, or the value has no limit");
  const flows = cashFlows.map((cashFlow, i) => ({ year: i + 1, cashFlow, presentValue: cashFlow / (1 + rate) ** (i + 1) }));
  const terminalValue = (cashFlows.at(-1) * (1 + terminalGrowth)) / (rate - terminalGrowth);
  const terminalPresentValue = terminalValue / (1 + rate) ** cashFlows.length;
  const value = flows.reduce((t, f) => t + f.presentValue, 0) + terminalPresentValue;
  return { inputs: { cashFlows, rate, terminalGrowth }, flows, terminalValue, terminalPresentValue, value, terminalShare: terminalPresentValue / value };
}
