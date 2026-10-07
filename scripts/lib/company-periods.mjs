// Quarterly and annual results per company, from the company's own SEC companyfacts file.
//
// Why fiscal labels are derived, not read: in companyfacts every fact carries the fy/fp of the filing it
// came from, and a period's first appearance is often a comparative in a later filing (NVIDIA's quarters
// appear only inside 10-Ks, all labelled FY). So the company's fiscal calendar is learned from its own
// annual reports (the primary period of each 10-K: year-end dates and how it numbers its years), and
// every quarter is placed by its end date inside that calendar. Pages always state the exact period end,
// so a label can never stand in for a date.
//
// Values: for each measure and period, the value first reported (earliest filing) and the latest one
// (most recent filing). When they differ the page says the figure was revised and shows both.

const DAY = 86_400_000;
const days = (start, end) => Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY);
const isQuarter = (start, end) => { const d = days(start, end); return d >= 80 && d <= 100; };
const isYear = (start, end) => { const d = days(start, end); return d >= 350 && d <= 380; };

// Headline measures shown on a results page, in display order. A measure may be reported under several
// tags; the first tag present for that period wins. `flow` measures are durations (income statement);
// `stock` measures are balance-sheet instants at the period end. Cash flow is reported year-to-date in
// 10-Qs, so it is shown on annual pages only.
export const PERIOD_MEASURES = Object.freeze([
  { key: 'revenue', label: 'Revenue', kind: 'flow', tags: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet', 'RevenueFromContractWithCustomerIncludingAssessedTax'] },
  { key: 'cost_of_revenue', label: 'Cost of revenue', kind: 'flow', tags: ['CostOfGoodsAndServicesSold', 'CostOfRevenue', 'CostOfGoodsSold'] },
  { key: 'gross_profit', label: 'Gross profit', kind: 'flow', tags: ['GrossProfit'] },
  { key: 'rnd', label: 'Research and development', kind: 'flow', tags: ['ResearchAndDevelopmentExpense'] },
  { key: 'sga', label: 'Selling, general and administrative', kind: 'flow', tags: ['SellingGeneralAndAdministrativeExpense'] },
  { key: 'operating_income', label: 'Operating income', kind: 'flow', tags: ['OperatingIncomeLoss'] },
  { key: 'income_tax', label: 'Income tax', kind: 'flow', tags: ['IncomeTaxExpenseBenefit'] },
  { key: 'net_income', label: 'Net income', kind: 'flow', tags: ['NetIncomeLoss', 'ProfitLoss'] },
  { key: 'eps_basic', label: 'Earnings per share, basic', kind: 'flow', tags: ['EarningsPerShareBasic'], unit: 'USD/shares' },
  { key: 'eps_diluted', label: 'Earnings per share, diluted', kind: 'flow', tags: ['EarningsPerShareDiluted'], unit: 'USD/shares' },
  { key: 'diluted_shares', label: 'Diluted weighted shares', kind: 'flow', tags: ['WeightedAverageNumberOfDilutedSharesOutstanding'], unit: 'shares' },
  { key: 'operating_cash_flow', label: 'Operating cash flow', kind: 'flow', tags: ['NetCashProvidedByUsedInOperatingActivities'], annualOnly: true },
  { key: 'capex', label: 'Capital expenditure', kind: 'flow', tags: ['PaymentsToAcquirePropertyPlantAndEquipment'], annualOnly: true },
  { key: 'cash', label: 'Cash and equivalents', kind: 'stock', tags: ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'] },
  { key: 'assets', label: 'Total assets', kind: 'stock', tags: ['Assets'] },
  { key: 'liabilities', label: 'Total liabilities', kind: 'stock', tags: ['Liabilities'] },
  { key: 'long_term_debt', label: 'Long-term debt', kind: 'stock', tags: ['LongTermDebtNoncurrent', 'LongTermDebt'] },
  { key: 'equity', label: "Stockholders' equity", kind: 'stock', tags: ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'] },
]);

// A results page needs at least this many headline measures for its period; fewer is not a useful page.
export const MIN_MEASURES = 4;
const FORMS = /^(10-K|10-Q|10-KT|10-QT)(\/A)?$/;

function rowsFor(facts, tag, unit) {
  const units = facts?.[tag]?.units;
  if (!units) return [];
  const pick = unit ?? (units.USD ? 'USD' : null);
  return pick && units[pick] ? units[pick].filter(r => FORMS.test(r.form) && r.end && Number.isFinite(r.val)).map(r => ({ ...r, unit: pick })) : [];
}

// The company's fiscal calendar: annual periods taken from the primary period of each 10-K, and how the
// company numbers its fiscal years relative to the calendar year of the year end (0, or -1 for years
// ending in early January/February that companies name after the prior calendar year).
export function fiscalCalendar(facts) {
  const years = new Map();
  let offsets = [];
  for (const m of PERIOD_MEASURES.filter(x => x.kind === 'flow' && !x.unit)) {
    for (const tag of m.tags) {
      const byAccn = new Map();
      for (const r of rowsFor(facts, tag)) if (r.start && isYear(r.start, r.end) && /^10-K/.test(r.form)) {
        const list = byAccn.get(r.accn) ?? []; list.push(r); byAccn.set(r.accn, list);
      }
      for (const list of byAccn.values()) {
        const primary = list.reduce((a, b) => (b.end > a.end ? b : a));
        if (!years.has(primary.end)) years.set(primary.end, primary.start);
        if (Number.isInteger(primary.fy)) offsets.push(primary.fy - Number(primary.end.slice(0, 4)));
      }
    }
  }
  if (!years.size) return null;
  const count = new Map(); for (const o of offsets) count.set(o, (count.get(o) ?? 0) + 1);
  const offset = [...count.entries()].filter(([o]) => o === 0 || o === -1).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  const ends = [...years.keys()].sort();
  return { offset, years: ends.map(end => ({ start: years.get(end), end, fy: Number(end.slice(0, 4)) + offset })) };
}

// Which fiscal year and quarter a quarter-length period belongs to. Known fiscal years come from the
// calendar; quarters after the latest annual report fall in the next fiscal year (one year on, +-10 days).
export function placeQuarter(calendar, start, end) {
  if (!calendar) return null;
  const years = [...calendar.years];
  const last = years.at(-1);
  if (last) {
    const nextEnd = new Date(Date.parse(`${last.end}T00:00:00Z`) + 364 * DAY).toISOString().slice(0, 10);
    years.push({ start: new Date(Date.parse(`${last.end}T00:00:00Z`) + DAY).toISOString().slice(0, 10), end: nextEnd, fy: last.fy + 1, projected: true });
  }
  for (const y of years) {
    if (start >= addDays(y.start, -10) && end <= addDays(y.end, y.projected ? 10 : 7)) {
      const q = Math.min(4, Math.max(1, Math.round(days(y.start, end) / 91.3)));
      return { fy: y.fy, q };
    }
  }
  return null;
}
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

function pickValue(rows) {
  const sorted = [...rows].sort((a, b) => (a.filed === b.filed ? a.accn.localeCompare(b.accn) : a.filed.localeCompare(b.filed)));
  const first = sorted[0], latest = sorted.at(-1);
  return { val: latest.val, unit: latest.unit, accn: latest.accn, form: latest.form, filed: latest.filed,
    ...(first.val !== latest.val ? { first: { val: first.val, accn: first.accn, filed: first.filed } } : {}) };
}

// All results periods for one company: [{ key, kind, fy, q?, start, end, accn, form, filed, measures }].
// `accn`/`form`/`filed` are the filing that first reported the period (its own 10-Q or 10-K, where we have it).
export function companyPeriods(companyfacts) {
  const facts = companyfacts?.facts?.['us-gaap'];
  if (!facts) return [];
  const calendar = fiscalCalendar(facts);
  if (!calendar) return [];
  const periods = new Map();
  const periodFor = (start, end) => {
    const year = isYear(start, end);
    let id;
    if (year) {
      const y = calendar.years.find(x => Math.abs(days(x.end, end)) <= 7);
      if (!y) return null;
      id = { kind: 'year', fy: y.fy, key: `fy${y.fy}` };
    } else {
      const place = placeQuarter(calendar, start, end);
      if (!place) return null;
      id = { kind: 'quarter', fy: place.fy, q: place.q, key: `fy${place.fy}-q${place.q}` };
    }
    const existing = periods.get(id.key);
    if (existing && existing.end !== end) return existing.end > end ? existing : (periods.delete(id.key), periodFor(start, end));
    if (!existing) periods.set(id.key, { ...id, start, end, measures: {}, sources: [] });
    return periods.get(id.key);
  };
  // Durations first: they define the periods.
  for (const m of PERIOD_MEASURES.filter(x => x.kind === 'flow')) {
    for (const tag of m.tags) {
      const groups = new Map();
      for (const r of rowsFor(facts, tag, m.unit)) {
        if (!r.start || !(isQuarter(r.start, r.end) || isYear(r.start, r.end))) continue;
        if (m.annualOnly && !isYear(r.start, r.end)) continue;
        const k = `${r.start}|${r.end}`; const list = groups.get(k) ?? []; list.push(r); groups.set(k, list);
      }
      for (const [k, rows] of groups) {
        const [start, end] = k.split('|');
        const period = periodFor(start, end);
        if (!period || period.end !== end || period.measures[m.key]) continue;
        period.measures[m.key] = { tag, ...pickValue(rows) };
        period.sources.push(...rows);
      }
    }
  }
  // Balance-sheet instants at each period's end date.
  for (const m of PERIOD_MEASURES.filter(x => x.kind === 'stock')) {
    for (const tag of m.tags) {
      const byEnd = new Map();
      for (const r of rowsFor(facts, tag, m.unit)) if (!r.start) { const list = byEnd.get(r.end) ?? []; list.push(r); byEnd.set(r.end, list); }
      for (const period of periods.values()) {
        if (period.measures[m.key] || !byEnd.has(period.end)) continue;
        period.measures[m.key] = { tag, ...pickValue(byEnd.get(period.end)) };
      }
    }
  }
  const out = [];
  for (const p of periods.values()) {
    const n = Object.keys(p.measures).length;
    if (n < MIN_MEASURES) continue;
    // The filing that first reported this period: the earliest filing among its facts whose own primary
    // period this is, else simply the earliest.
    const firstFiled = p.sources.sort((a, b) => a.filed.localeCompare(b.filed))[0];
    const { sources, ...rest } = p;
    out.push({ ...rest, accn: firstFiled.accn, form: firstFiled.form, filed: firstFiled.filed });
  }
  return out.sort((a, b) => (a.end === b.end ? (a.kind === 'year' ? 1 : -1) : a.end.localeCompare(b.end)));
}

// The same period one year earlier, for year-on-year comparisons.
export function priorPeriod(periods, period) {
  const key = period.kind === 'year' ? `fy${period.fy - 1}` : `fy${period.fy - 1}-q${period.q}`;
  return periods.find(p => p.key === key) ?? null;
}
