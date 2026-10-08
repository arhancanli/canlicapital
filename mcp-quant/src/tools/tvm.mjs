// Time value of money and corporate finance: NPV, IRR, MIRR, dated XNPV/XIRR, the five-variable
// annuity solver, amortization, rate conversions, growing annuities, payback, equivalent annual
// annuity, WACC, levered beta and break-even. Rates are per period unless a field says annual.
import { z } from "zod";

import { bracketRoot } from "../math.mjs";
import { isoDate, parseDate } from "../dates.mjs";

const cashflows = z.array(z.number()).min(2).max(10000).describe("Cash flows, first at time 0, then one per period, e.g. [-1000, 300, 400, 500].");
const rate = z.number().gt(-1).lt(10).describe("Discount rate per period, e.g. 0.08.");

const npvAt = (r, cf) => cf.reduce((s, c, t) => s + c / (1 + r) ** t, 0);
const signChanges = (cf) => { let n = 0, last = 0; for (const c of cf) { if (c === 0) continue; if (last && Math.sign(c) !== last) n++; last = Math.sign(c); } return n; };

function irrOf(cf, guess = 0.1) {
  if (!cf.some((c) => c > 0) || !cf.some((c) => c < 0)) throw new Error("IRR needs at least one positive and one negative cash flow.");
  return bracketRoot((r) => npvAt(r, cf), Math.max(-0.99, guess - 0.05), guess + 0.05, { min: -0.999999, max: 1e6 });
}

const yearsBetween = (d0, d) => (d.serial - d0.serial) / 365;

function xnpvAt(r, flows) {
  return flows.reduce((s, f) => s + f.amount / (1 + r) ** f.t, 0);
}

function datedFlows(amounts, dates) {
  if (amounts.length !== dates.length) throw new Error(`cashflows has ${amounts.length} entries and dates ${dates.length}.`);
  const ds = dates.map((d, i) => parseDate(d, `dates[${i}]`));
  return amounts.map((amount, i) => ({ amount, t: yearsBetween(ds[0], ds[i]) }));
}

// fv + pv (1+r)^n + pmt (1 + r w) ((1+r)^n - 1) / r = 0, the spreadsheet sign convention.
function tvmResidual({ rate: r, nper: n, pmt, pv, fv, when }) {
  const w = when === "begin" ? 1 : 0;
  if (Math.abs(r) < 1e-14) return fv + pv + pmt * n;
  const g = (1 + r) ** n;
  return fv + pv * g + pmt * (1 + r * w) * (g - 1) / r;
}

function solveTvm(a) {
  const keys = ["rate", "nper", "pmt", "pv", "fv"], missing = keys.filter((k) => a[k] === undefined);
  if (missing.length !== 1) throw new Error(`Send four of rate, nper, pmt, pv and fv; leave out the one to solve (missing now: ${missing.join(", ") || "none"}).`);
  const x = { ...a, when: a.when ?? "end" }, m = missing[0];
  const lin = (k) => { const z0 = tvmResidual({ ...x, [k]: 0 }), z1 = tvmResidual({ ...x, [k]: 1 }); return -z0 / (z1 - z0); };
  if (m === "pmt" || m === "pv" || m === "fv") x[m] = lin(m);
  else if (m === "nper") {
    const { rate: r, pmt, pv, fv } = x, w = x.when === "begin" ? 1 : 0;
    if (Math.abs(r) < 1e-14) x.nper = -(fv + pv) / pmt;
    else { const c = pmt * (1 + r * w) / r, val = (c - fv) / (c + pv); if (!(val > 0)) throw new Error("No number of periods reaches that future value."); x.nper = Math.log(val) / Math.log(1 + r); }
  } else x.rate = bracketRoot((r) => tvmResidual({ ...x, rate: r }), 0.001, 0.2, { min: -0.999999, max: 100 });
  return { solved_for: m, rate: x.rate, nper: x.nper, pmt: x.pmt, pv: x.pv, fv: x.fv, when: x.when, sign_convention: "Money paid out is negative, money received positive (spreadsheet convention)." };
}

const effective = (nominal, m) => m === "continuous" ? Math.exp(nominal) - 1 : (1 + nominal / m) ** m - 1;
const nominalFrom = (eff, m) => m === "continuous" ? Math.log(1 + eff) : m * ((1 + eff) ** (1 / m) - 1);
const compoundingArg = z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(12), z.literal(52), z.literal(365), z.literal("continuous")]);

export const TOOLS = [
  {
    name: "net_present_value",
    title: "Net present value",
    description: "Compute the NPV of periodic cash flows (first at time 0), with the profitability index, discounted payback and the IRR when one exists.",
    keywords: "npv net present value discount cash flow profitability index capital budgeting project",
    input: z.object({ rate, cashflows }).strict(),
    run({ rate: r, cashflows: cf }) {
      const pvIn = cf.slice(1).reduce((s, c, t) => s + c / (1 + r) ** (t + 1), 0);
      let irr = null; try { irr = irrOf(cf); } catch { irr = null; }
      return { npv: npvAt(r, cf), pv_future_flows: pvIn, profitability_index: cf[0] < 0 ? pvIn / -cf[0] : null, irr };
    },
  },
  {
    name: "internal_rate_of_return",
    title: "Internal rate of return",
    description: "Solve the IRR of periodic cash flows, warning when sign changes allow several IRRs, with the NPV profile at a few rates.",
    keywords: "irr internal rate of return yield project cash flows",
    input: z.object({ cashflows, guess: z.number().gt(-1).lt(10).optional().describe("Starting guess; default 0.1. Change it to find another root.") }).strict(),
    run({ cashflows: cf, guess }) {
      const irr = irrOf(cf, guess), sc = signChanges(cf);
      return { irr, sign_changes: sc, warning: sc > 1 ? `${sc} sign changes: up to ${sc} IRRs exist; prefer NPV or MIRR.` : undefined, npv_profile: [0, 0.05, 0.1, 0.15, 0.2].map((r) => [r, npvAt(r, cf)]) };
    },
  },
  {
    name: "modified_irr",
    title: "Modified internal rate of return",
    description: "Compute the MIRR: negative flows discounted at a finance rate, positive flows compounded at a reinvestment rate, one unambiguous return.",
    keywords: "mirr modified internal rate of return reinvestment rate finance rate",
    input: z.object({ cashflows, finance_rate: z.number().gt(-1).lt(10).describe("Rate paid on money borrowed (negative flows)."), reinvest_rate: z.number().gt(-1).lt(10).describe("Rate earned on reinvested positive flows.") }).strict(),
    run({ cashflows: cf, finance_rate: fr, reinvest_rate: rr }) {
      const n = cf.length - 1;
      const pvNeg = cf.reduce((s, c, t) => s + (c < 0 ? c / (1 + fr) ** t : 0), 0);
      const fvPos = cf.reduce((s, c, t) => s + (c > 0 ? c * (1 + rr) ** (n - t) : 0), 0);
      if (!(pvNeg < 0) || !(fvPos > 0)) throw new Error("MIRR needs at least one negative and one positive flow.");
      return { mirr: (fvPos / -pvNeg) ** (1 / n) - 1, pv_of_outflows: pvNeg, fv_of_inflows: fvPos };
    },
  },
  {
    name: "xnpv_xirr",
    title: "Dated NPV and IRR (XNPV, XIRR)",
    description: "Compute NPV and IRR for cash flows on irregular dates (ACT/365 from the first date), as spreadsheet XNPV and XIRR do.",
    keywords: "xnpv xirr irregular dates dated cash flows money weighted return private equity",
    input: z.object({
      cashflows: z.array(z.number()).min(2).max(10000).describe("Cash flow amounts."),
      dates: z.array(isoDate).min(2).max(10000).describe("Dates of the cash flows, YYYY-MM-DD, first is the base date."),
      rate: z.number().gt(-1).lt(10).optional().describe("Annual discount rate for XNPV; omit for XIRR only."),
    }).strict(),
    run({ cashflows: cf, dates, rate: r }) {
      const flows = datedFlows(cf, dates);
      const xirr = bracketRoot((x) => xnpvAt(x, flows), 0.05, 0.15, { min: -0.999999, max: 1e6 });
      return { xirr, xnpv: r === undefined ? undefined : xnpvAt(r, flows) };
    },
  },
  {
    name: "time_value_solver",
    title: "Time value of money solver",
    description: "Solve for any one of rate, number of periods, payment, present value or future value given the other four (loans, savings, annuities), payments at period end or start.",
    keywords: "tvm time value money pmt payment pv fv nper rate annuity loan mortgage savings retirement",
    input: z.object({
      rate: z.number().gt(-1).lt(10).optional().describe("Rate per period, e.g. 0.005 for 6%/12."),
      nper: z.number().positive().max(100000).optional().describe("Number of periods."),
      pmt: z.number().optional().describe("Payment per period (negative when paid)."),
      pv: z.number().optional().describe("Present value (negative when paid)."),
      fv: z.number().optional().describe("Future value."),
      when: z.enum(["end", "begin"]).optional().describe("Payments at period end (default) or begin."),
    }).strict(),
    run: (a) => solveTvm(a),
  },
  {
    name: "amortization_schedule",
    title: "Loan amortization schedule",
    description: "Build a level-payment loan schedule: payment, interest and principal per period, remaining balance, and total interest.",
    keywords: "amortization schedule loan mortgage payment interest principal balance",
    input: z.object({
      principal: z.number().positive().describe("Amount borrowed, e.g. 300000."),
      annual_rate: z.number().min(0).lt(1).describe("Nominal annual rate, e.g. 0.065."),
      years: z.number().positive().max(50).describe("Term in years."),
      payments_per_year: z.number().int().min(1).max(52).optional().describe("Default 12."),
      extra_payment: z.number().min(0).optional().describe("Extra principal paid each period; default 0."),
    }).strict(),
    run({ principal, annual_rate, years, payments_per_year: m = 12, extra_payment = 0 }) {
      const n = Math.round(years * m), r = annual_rate / m;
      const pay = r === 0 ? principal / n : principal * r / (1 - (1 + r) ** -n);
      const rows = []; let bal = principal, totalInt = 0;
      for (let k = 1; k <= n && bal > 1e-9; k++) {
        const int = bal * r, prin = Math.min(bal, pay - int + extra_payment);
        bal -= prin; totalInt += int;
        rows.push([k, int + prin, int, prin, Math.max(0, bal)]);
      }
      const shown = rows.length > 360 ? [...rows.slice(0, 12), ...rows.filter((r) => r[0] % m === 0 && r[0] > 12)] : rows;
      return { payment: pay + extra_payment, scheduled_payment: pay, periods: rows.length, total_interest: totalInt, total_paid: principal + totalInt, columns: ["period", "payment", "interest", "principal", "balance"], rows: shown, note: rows.length > 360 ? "Long schedule: first year monthly, then year-end rows." : undefined };
    },
  },
  {
    name: "rate_conversion",
    title: "Interest rate conversion",
    description: "Convert a nominal rate between compounding frequencies, to effective annual and continuous rates, and remove inflation (exact Fisher real rate).",
    keywords: "effective annual rate apr apy nominal continuous compounding conversion fisher real rate inflation",
    input: z.object({
      rate: z.number().gt(-1).lt(10).describe("The rate to convert, e.g. 0.06."),
      from: compoundingArg.describe("Its compounding per year (1, 2, 4, 12, 52, 365) or continuous."),
      inflation: z.number().gt(-1).lt(10).optional().describe("Annual inflation, for the real rate."),
    }).strict(),
    run({ rate: x, from, inflation }) {
      const ear = effective(x, from);
      const to = Object.fromEntries([1, 2, 4, 12, 52, 365].map((m) => [`nominal_compounded_${m}`, nominalFrom(ear, m)]));
      return { effective_annual: ear, continuous: Math.log(1 + ear), ...to, real_rate_exact: inflation === undefined ? undefined : (1 + ear) / (1 + inflation) - 1, real_rate_approx: inflation === undefined ? undefined : ear - inflation };
    },
  },
  {
    name: "growing_annuity",
    title: "Growing annuity and perpetuity",
    description: "Value a growing annuity (present and future value) or a growing perpetuity whose first payment arrives in one period.",
    keywords: "growing annuity perpetuity gordon present value future value growth payments",
    input: z.object({
      payment: z.number().describe("First payment, e.g. 1000."),
      rate: z.number().gt(-1).lt(10).describe("Discount rate per period."),
      growth: z.number().gt(-1).lt(10).optional().describe("Payment growth per period; default 0."),
      periods: z.number().int().positive().max(100000).optional().describe("Number of payments; omit for a perpetuity."),
    }).strict(),
    run({ payment: c, rate: r, growth: g = 0, periods: n }) {
      if (n === undefined) { if (!(r > g)) throw new Error("A growing perpetuity needs rate > growth."); return { present_value: c / (r - g) }; }
      const pv = Math.abs(r - g) < 1e-12 ? c * n / (1 + r) : c / (r - g) * (1 - ((1 + g) / (1 + r)) ** n);
      return { present_value: pv, future_value: pv * (1 + r) ** n };
    },
  },
  {
    name: "payback_period",
    title: "Payback and discounted payback",
    description: "Compute simple and discounted payback periods, interpolated within the period that recovers the investment.",
    keywords: "payback period discounted payback breakeven time recover investment capital budgeting",
    input: z.object({ cashflows, rate: rate.optional() }).strict(),
    run({ cashflows: cf, rate: r = 0 }) {
      const pb = (disc) => {
        let cum = 0;
        for (let t = 0; t < cf.length; t++) {
          const c = disc ? cf[t] / (1 + r) ** t : cf[t], prev = cum;
          cum += c;
          if (t > 0 && prev < 0 && cum >= 0) return t - 1 + -prev / c;
        }
        return null;
      };
      return { payback: pb(false), discounted_payback: pb(true), note: "null means the flows never recover the investment." };
    },
  },
  {
    name: "equivalent_annual_annuity",
    title: "Equivalent annual annuity",
    description: "Convert a project's NPV into an equivalent level annual amount, to compare projects with different lives.",
    keywords: "equivalent annual annuity eaa equivalent annual cost unequal lives project comparison",
    input: z.object({ rate, cashflows }).strict(),
    run({ rate: r, cashflows: cf }) {
      const npv = npvAt(r, cf), n = cf.length - 1;
      return { npv, equivalent_annual_annuity: r === 0 ? npv / n : npv * r / (1 - (1 + r) ** -n) };
    },
  },
  {
    name: "wacc",
    title: "Weighted average cost of capital",
    description: "Compute WACC from market values and costs of equity, debt and preferred, with after-tax cost of debt; cost of equity can come from CAPM.",
    keywords: "wacc weighted average cost of capital cost of equity cost of debt capm tax shield discount rate",
    input: z.object({
      equity_value: z.number().min(0).describe("Market value of equity."),
      debt_value: z.number().min(0).describe("Market value of debt."),
      preferred_value: z.number().min(0).optional().describe("Market value of preferred; default 0."),
      cost_of_equity: z.number().gt(-1).lt(5).optional().describe("Or give beta, risk_free and market_premium."),
      beta: z.number().min(-5).max(10).optional().describe("Equity beta for CAPM."),
      risk_free: z.number().gt(-1).lt(1).optional().describe("Risk-free rate for CAPM."),
      market_premium: z.number().gt(-1).lt(1).optional().describe("Equity risk premium for CAPM, e.g. 0.055."),
      cost_of_debt: z.number().gt(-1).lt(5).describe("Pre-tax cost of debt."),
      cost_of_preferred: z.number().gt(-1).lt(5).optional().describe("Cost of preferred; default 0."),
      tax_rate: z.number().min(0).lt(1).describe("Marginal tax rate, e.g. 0.21."),
    }).strict(),
    run(a) {
      let ke = a.cost_of_equity;
      if (ke === undefined) {
        if ([a.beta, a.risk_free, a.market_premium].includes(undefined)) throw new Error("Send cost_of_equity, or beta, risk_free and market_premium.");
        ke = a.risk_free + a.beta * a.market_premium;
      }
      const P = a.preferred_value ?? 0, V = a.equity_value + a.debt_value + P;
      if (!(V > 0)) throw new Error("Total capital must be positive.");
      const kd = a.cost_of_debt * (1 - a.tax_rate);
      return { wacc: (a.equity_value * ke + a.debt_value * kd + P * (a.cost_of_preferred ?? 0)) / V, cost_of_equity: ke, after_tax_cost_of_debt: kd, weight_equity: a.equity_value / V, weight_debt: a.debt_value / V, weight_preferred: P / V };
    },
  },
  {
    name: "levered_beta",
    title: "Unlever and relever beta",
    description: "Unlever an observed equity beta to an asset beta and relever it at a target debt-to-equity ratio (Hamada), for comparable-company cost of equity.",
    keywords: "levered unlevered beta hamada asset beta capital structure comparable",
    input: z.object({
      beta: z.number().min(-5).max(10).describe("Observed equity beta."),
      debt_to_equity: z.number().min(0).max(50).describe("Current debt / equity."),
      tax_rate: z.number().min(0).lt(1).describe("Tax rate."),
      target_debt_to_equity: z.number().min(0).max(50).optional().describe("Target debt / equity to relever at."),
      debt_beta: z.number().min(-1).max(2).optional().describe("Beta of debt; default 0."),
    }).strict(),
    run({ beta, debt_to_equity: de, tax_rate: t, target_debt_to_equity: td, debt_beta: bd = 0 }) {
      const asset = (beta + bd * (1 - t) * de) / (1 + (1 - t) * de);
      return { asset_beta: asset, relevered_beta: td === undefined ? undefined : asset + (asset - bd) * (1 - t) * td };
    },
  },
  {
    name: "break_even",
    title: "Break-even and operating leverage",
    description: "Compute break-even units and revenue, contribution margin, margin of safety and degree of operating leverage from price, variable cost and fixed costs.",
    keywords: "break even contribution margin operating leverage dol margin of safety cost volume profit",
    input: z.object({
      price: z.number().positive().describe("Price per unit."),
      variable_cost: z.number().min(0).describe("Variable cost per unit."),
      fixed_costs: z.number().min(0).describe("Fixed costs per period."),
      units: z.number().min(0).optional().describe("Expected units, for margin of safety and leverage."),
      target_profit: z.number().optional().describe("Profit to reach; default 0."),
    }).strict(),
    run({ price, variable_cost: v, fixed_costs: F, units, target_profit = 0 }) {
      const cm = price - v;
      if (!(cm > 0)) throw new Error("Price must exceed variable cost.");
      const be = (F + target_profit) / cm;
      const ebit = units === undefined ? undefined : units * cm - F;
      return { contribution_margin: cm, contribution_margin_ratio: cm / price, break_even_units: be, break_even_revenue: be * price, operating_profit: ebit, margin_of_safety: units === undefined ? undefined : (units - F / cm) / units, operating_leverage: units === undefined || !ebit ? undefined : units * cm / ebit };
    },
  },
  {
    name: "loan_true_cost",
    title: "Loan APR with fees",
    description: "Find a loan's true annual cost when upfront fees reduce the cash received: the payment, the nominal APR and effective annual rate implied by the fees, and the total cost.",
    keywords: "apr annual percentage rate loan fees points origination true cost effective rate",
    input: z.object({
      principal: z.number().positive().describe("Amount borrowed."),
      annual_rate: z.number().min(0).lt(1).describe("Quoted nominal rate."),
      years: z.number().positive().max(50).describe("Term."),
      upfront_fees: z.number().min(0).describe("Fees deducted or paid at the start."),
      payments_per_year: z.number().int().min(1).max(52).optional().describe("Default 12."),
    }).strict(),
    run({ principal: P, annual_rate: ar, years, upfront_fees: f, payments_per_year: m = 12 }) {
      const n = Math.round(years * m), r = ar / m, pay = r === 0 ? P / n : P * r / (1 - (1 + r) ** -n);
      if (!(f < P)) throw new Error("Fees must be less than the principal.");
      const per = bracketRoot((x) => (Math.abs(x) < 1e-14 ? pay * n : pay * (1 - (1 + x) ** -n) / x) - (P - f), Math.max(r, 1e-6), r + 0.01, { min: -0.99, max: 10 });
      return { payment: pay, apr: per * m, effective_annual_rate: (1 + per) ** m - 1, quoted_effective_rate: (1 + r) ** m - 1, total_interest_and_fees: pay * n - P + f };
    },
  },
  {
    name: "retirement_projection",
    title: "Savings and withdrawal projection",
    description: "Project a savings balance with yearly contributions growing with salary, then sustainable inflation-adjusted withdrawals; reports the balance at retirement, how long withdrawals last and the safe level spending.",
    keywords: "retirement projection savings plan withdrawals safe withdrawal rate financial planning compound growth",
    input: z.object({
      balance: z.number().min(0).describe("Current savings."),
      annual_contribution: z.number().min(0).describe("Contribution this year."),
      contribution_growth: z.number().gt(-1).lt(1).optional().describe("Yearly growth of contributions; default 0."),
      years_to_retirement: z.number().int().min(0).max(80).describe("Years of saving."),
      return_rate: z.number().gt(-1).lt(1).describe("Annual nominal return."),
      inflation: z.number().gt(-1).lt(1).optional().describe("Annual inflation; default 0.02."),
      annual_withdrawal: z.number().min(0).optional().describe("First-year withdrawal in today's money; omit to only solve the level that lasts."),
      years_in_retirement: z.number().int().min(1).max(80).optional().describe("Years withdrawals must last; default 30."),
    }).strict(),
    run({ balance, annual_contribution: c, contribution_growth: g = 0, years_to_retirement: n, return_rate: r, inflation: inf = 0.02, annual_withdrawal: wd, years_in_retirement: m = 30 }) {
      let b = balance;
      for (let t = 0; t < n; t++) b = b * (1 + r) + c * (1 + g) ** t;
      const atRet = b, real = (1 + r) / (1 + inf) - 1, infl = (1 + inf) ** n;
      // Level real withdrawal at the start of each retirement year that exhausts the balance in m years.
      const level = Math.abs(real) < 1e-14 ? atRet / m : atRet * real / ((1 - (1 + real) ** -m) * (1 + real));
      let lasts = null;
      if (wd !== undefined) {
        let x = atRet; lasts = 0;
        for (let t = 0; t < 200; t++) { const w = wd * infl * (1 + inf) ** t; if (x < w) break; x = (x - w) * (1 + r); lasts = t + 1; }
      }
      return { balance_at_retirement: atRet, balance_today_money: atRet / infl, sustainable_withdrawal_nominal_first_year: level, sustainable_withdrawal_today_money: level / infl, withdrawal_rate: level / atRet, years_withdrawals_last: lasts };
    },
  },
];
