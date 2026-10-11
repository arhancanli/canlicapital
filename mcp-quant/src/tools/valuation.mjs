// Valuation and fundamental scores: discounted cash flow (forward and reverse), dividend discount
// models, residual income, the enterprise-value bridge and multiples, Altman Z, Piotroski F,
// Beneish M, DuPont and Graham. Every input is a number the caller already has from statements.
import { z } from "zod";

import { bracketRoot } from "../math.mjs";

const money = (what) => z.number().describe(what);
const rate = (what) => z.number().gt(-1).lt(5).describe(what);

function dcf({ free_cash_flows: f, discount_rate: r, terminal_growth: g, terminal_multiple: m, terminal_metric, mid_year = false, net_debt = 0, shares }) {
  if ((g === undefined) === (m === undefined)) throw new Error("Send exactly one of terminal_growth or terminal_multiple.");
  if (g !== undefined && !(r > g)) throw new Error("discount_rate must exceed terminal_growth.");
  const N = f.length, shift = mid_year ? 0.5 : 0;
  const pvF = f.reduce((s, c, i) => s + c / (1 + r) ** (i + 1 - shift), 0);
  const tv = g !== undefined ? f[N - 1] * (1 + g) / (r - g) : m * (terminal_metric ?? f[N - 1]);
  const pvTv = tv / (1 + r) ** N;
  const ev = pvF + pvTv, eq = ev - net_debt;
  return { enterprise_value: ev, equity_value: eq, per_share: shares ? eq / shares : undefined, pv_forecast: pvF, terminal_value: tv, pv_terminal: pvTv, terminal_share_of_value: pvTv / ev };
}

const growthFlows = (base, g, n) => Array.from({ length: n }, (_, i) => base * (1 + g) ** (i + 1));

const altmanVariants = {
  public_manufacturing: { w: [1.2, 1.4, 3.3, 0.6, 1.0], safe: 2.99, distress: 1.81, x4: "market value of equity / total liabilities" },
  private: { w: [0.717, 0.847, 3.107, 0.42, 0.998], safe: 2.9, distress: 1.23, x4: "book equity / total liabilities" },
  non_manufacturing: { w: [6.56, 3.26, 6.72, 1.05, 0], safe: 2.6, distress: 1.1, x4: "book equity / total liabilities" },
};

const year = z.object({
  net_income: money("Net income."),
  operating_cash_flow: money("Cash flow from operations."),
  total_assets: z.number().positive().describe("Total assets at year end."),
  total_assets_begin: z.number().positive().optional().describe("Total assets at the start of the year; default year-end."),
  long_term_debt: z.number().min(0).describe("Long-term debt."),
  current_assets: z.number().min(0).describe("Current assets."),
  current_liabilities: z.number().positive().describe("Current liabilities."),
  shares_outstanding: z.number().positive().describe("Shares outstanding."),
  revenue: z.number().positive().describe("Revenue."),
  gross_profit: money("Gross profit."),
}).strict();

const beneishYear = z.object({
  receivables: z.number().min(0).describe("Net receivables."),
  revenue: z.number().positive().describe("Revenue."),
  cost_of_goods_sold: z.number().min(0).describe("Cost of goods sold."),
  current_assets: z.number().min(0).describe("Current assets."),
  ppe: z.number().min(0).describe("Net property, plant and equipment."),
  securities: z.number().min(0).optional().describe("Long-term investments; default 0."),
  total_assets: z.number().positive().describe("Total assets."),
  depreciation: z.number().min(0).describe("Depreciation expense."),
  sga: z.number().min(0).describe("Selling, general and administrative expense."),
  current_liabilities: z.number().min(0).describe("Current liabilities."),
  long_term_debt: z.number().min(0).describe("Long-term debt."),
  net_income: money("Net income (from continuing operations)."),
  operating_cash_flow: money("Cash flow from operations."),
}).strict();

export const TOOLS = [
  {
    name: "dcf_valuation",
    title: "Discounted cash flow valuation",
    description: "Value a business from forecast free cash flows with a Gordon-growth or exit-multiple terminal value: enterprise and equity value, per-share value and a discount-rate by growth sensitivity grid.",
    keywords: "dcf discounted cash flow valuation intrinsic value terminal value gordon exit multiple fcf enterprise value per share",
    input: z.object({
      free_cash_flows: z.array(z.number()).min(1).max(100).describe("Forecast free cash flows for years 1..N."),
      discount_rate: rate("Discount rate (WACC for FCFF, cost of equity for FCFE), e.g. 0.09."),
      terminal_growth: rate("Perpetual growth after year N, e.g. 0.025; or send terminal_multiple.").optional(),
      terminal_multiple: z.number().positive().max(200).optional().describe("Exit multiple applied to terminal_metric (default last FCF)."),
      terminal_metric: z.number().optional().describe("Metric for the exit multiple, e.g. year-N EBITDA."),
      mid_year: z.boolean().optional().describe("Discount forecast flows at mid-year; default false. Terminal value at year N."),
      net_debt: z.number().optional().describe("Debt minus cash, subtracted for equity value; default 0."),
      shares: z.number().positive().optional().describe("Diluted shares, for per-share value."),
    }).strict(),
    run(a) {
      const base = dcf(a);
      let grid;
      if (a.terminal_growth !== undefined) {
        const rs = [-0.01, 0, 0.01].map((d) => a.discount_rate + d), gs = [-0.005, 0, 0.005].map((d) => a.terminal_growth + d);
        grid = { rows_discount_rate: rs, columns_terminal_growth: gs, values: rs.map((r) => gs.map((g) => (r > g ? (a.shares ? dcf({ ...a, discount_rate: r, terminal_growth: g }).per_share : dcf({ ...a, discount_rate: r, terminal_growth: g }).equity_value) : null))) };
      }
      return { ...base, sensitivity: grid };
    },
  },
  {
    name: "reverse_dcf",
    title: "Reverse DCF (implied growth)",
    description: "Solve the free-cash-flow growth rate the current share price implies over a forecast horizon, given a discount rate and terminal growth.",
    keywords: "reverse dcf implied growth market expectations price implied",
    input: z.object({
      price: z.number().positive().describe("Share price."),
      shares: z.number().positive().describe("Diluted shares."),
      net_debt: z.number().optional().describe("Debt minus cash; default 0."),
      base_free_cash_flow: z.number().positive().describe("Latest annual free cash flow (year 0)."),
      discount_rate: rate("Discount rate, e.g. 0.09."),
      terminal_growth: rate("Growth after the horizon, e.g. 0.025."),
      years: z.number().int().min(1).max(50).optional().describe("Forecast horizon; default 10."),
    }).strict(),
    run({ price, shares, net_debt = 0, base_free_cash_flow: b, discount_rate: r, terminal_growth: tg, years: n = 10 }) {
      const target = price * shares + net_debt;
      const g = bracketRoot((g) => dcf({ free_cash_flows: growthFlows(b, g, n), discount_rate: r, terminal_growth: tg }).enterprise_value - target, 0, 0.1, { min: -0.99, max: 5 });
      return { implied_growth: g, enterprise_value: target, years: n };
    },
  },
  {
    name: "dividend_discount_model",
    title: "Dividend discount models",
    description: "Value a share with the Gordon growth, two-stage or H-model dividend discount model, or back out the required return the price implies (Gordon).",
    keywords: "ddm dividend discount model gordon growth two stage h model implied cost of equity",
    input: z.object({
      model: z.enum(["gordon", "two_stage", "h_model"]).describe("gordon, two_stage or h_model."),
      dividend: z.number().positive().describe("Current annual dividend D0."),
      required_return: rate("Required return on equity.").optional(),
      growth: rate("Long-run growth (gordon) or growth after the first stage."),
      high_growth: rate("First-stage growth (two_stage) or initial growth (h_model).").optional(),
      years: z.number().positive().max(100).optional().describe("First-stage length (two_stage) or half-life of the fade (h_model)."),
      price: z.number().positive().optional().describe("Market price, for the implied return (gordon)."),
    }).strict(),
    run({ model, dividend: d0, required_return: r, growth: g, high_growth: gh, years: n, price }) {
      if (model === "gordon") {
        const implied = price === undefined ? undefined : d0 * (1 + g) / price + g;
        if (r === undefined) { if (implied === undefined) throw new Error("Send required_return, or price for the implied return."); return { implied_required_return: implied }; }
        if (!(r > g)) throw new Error("required_return must exceed growth.");
        return { value: d0 * (1 + g) / (r - g), implied_required_return: implied };
      }
      if (r === undefined || gh === undefined || n === undefined) throw new Error(`${model} needs required_return, high_growth and years.`);
      if (!(r > g)) throw new Error("required_return must exceed growth.");
      if (model === "h_model") return { value: d0 * ((1 + g) + n * (gh - g)) / (r - g) };
      if (!Number.isInteger(n)) throw new Error("two_stage years must be whole.");
      let pv = 0, d = d0;
      for (let t = 1; t <= n; t++) { d *= 1 + gh; pv += d / (1 + r) ** t; }
      const tv = d * (1 + g) / (r - g);
      return { value: pv + tv / (1 + r) ** n, pv_first_stage: pv, pv_terminal: tv / (1 + r) ** n };
    },
  },
  {
    name: "residual_income_valuation",
    title: "Residual income valuation",
    description: "Value equity as book value plus discounted residual income (earnings above the cost of equity on opening book), with clean-surplus book values and a terminal value.",
    keywords: "residual income model abnormal earnings book value economic profit edwards bell ohlson",
    input: z.object({
      book_value: z.number().positive().describe("Book equity today."),
      earnings: z.array(z.number()).min(1).max(50).describe("Forecast net income for years 1..N."),
      dividends: z.array(z.number().min(0)).min(1).max(50).describe("Forecast dividends for years 1..N."),
      cost_of_equity: rate("Cost of equity."),
      terminal_growth: rate("Growth of residual income after year N; default 0. Use -1 < g, e.g. -0.2 for fading.").optional(),
      shares: z.number().positive().optional().describe("Shares, for per-share value."),
    }).strict(),
    run({ book_value: b0, earnings: e, dividends: d, cost_of_equity: r, terminal_growth: g = 0, shares }) {
      if (e.length !== d.length) throw new Error("earnings and dividends need the same length.");
      if (!(r > g)) throw new Error("cost_of_equity must exceed terminal_growth.");
      let b = b0, pv = 0, ri = 0;
      e.forEach((x, i) => { ri = x - r * b; pv += ri / (1 + r) ** (i + 1); b = b + x - d[i]; });
      const tv = ri * (1 + g) / (r - g) / (1 + r) ** e.length, v = b0 + pv + tv;
      return { value: v, per_share: shares ? v / shares : undefined, pv_residual_income: pv, pv_terminal: tv, ending_book_value: b };
    },
  },
  {
    name: "enterprise_value_multiples",
    title: "Enterprise value bridge and multiples",
    description: "Build enterprise value from market cap, debt, preferred, minority interest and cash, then EV/EBITDA, EV/EBIT, EV/sales, P/E, P/B, earnings yield and FCF yield.",
    keywords: "enterprise value ev ebitda multiple pe ratio price to book ev sales fcf yield earnings yield valuation multiples",
    input: z.object({
      market_cap: z.number().positive().describe("Equity market value."),
      total_debt: z.number().min(0).optional().describe("Debt; default 0."),
      cash: z.number().min(0).optional().describe("Cash and equivalents; default 0."),
      preferred: z.number().min(0).optional().describe("Preferred equity; default 0."),
      minority_interest: z.number().min(0).optional().describe("Non-controlling interest; default 0."),
      ebitda: z.number().optional().describe("EBITDA."),
      ebit: z.number().optional().describe("EBIT."),
      revenue: z.number().optional().describe("Revenue."),
      net_income: z.number().optional().describe("Net income."),
      book_equity: z.number().optional().describe("Book equity."),
      free_cash_flow: z.number().optional().describe("Free cash flow."),
    }).strict(),
    run(a) {
      const ev = a.market_cap + (a.total_debt ?? 0) + (a.preferred ?? 0) + (a.minority_interest ?? 0) - (a.cash ?? 0);
      const div = (x, y) => (y === undefined || y === 0 ? undefined : x / y);
      return { enterprise_value: ev, ev_to_ebitda: div(ev, a.ebitda), ev_to_ebit: div(ev, a.ebit), ev_to_sales: div(ev, a.revenue), price_to_earnings: div(a.market_cap, a.net_income), price_to_book: div(a.market_cap, a.book_equity), earnings_yield: div(a.net_income, a.market_cap), fcf_yield: div(a.free_cash_flow, a.market_cap), net_debt: (a.total_debt ?? 0) - (a.cash ?? 0) };
    },
  },
  {
    name: "altman_z_score",
    title: "Altman Z-score",
    description: "Compute the Altman Z-score bankruptcy predictor (public manufacturing, private-firm Z', or non-manufacturing Z'') with its five ratios and zone.",
    keywords: "altman z score bankruptcy distress credit risk solvency",
    input: z.object({
      variant: z.enum(["public_manufacturing", "private", "non_manufacturing"]).optional().describe("Default public_manufacturing."),
      working_capital: money("Current assets minus current liabilities."),
      retained_earnings: money("Retained earnings."),
      ebit: money("Earnings before interest and taxes."),
      equity_value: z.number().describe("Market value of equity (public) or book equity (private, non_manufacturing)."),
      total_liabilities: z.number().positive().describe("Total liabilities."),
      revenue: z.number().min(0).describe("Sales."),
      total_assets: z.number().positive().describe("Total assets."),
    }).strict(),
    run(a) {
      const v = altmanVariants[a.variant ?? "public_manufacturing"], TA = a.total_assets;
      const x = [a.working_capital / TA, a.retained_earnings / TA, a.ebit / TA, a.equity_value / a.total_liabilities, a.revenue / TA];
      const score = x.reduce((s, xi, i) => s + v.w[i] * xi, 0);
      return { z_score: score, zone: score > v.safe ? "safe" : score < v.distress ? "distress" : "grey", ratios: { x1_working_capital_to_assets: x[0], x2_retained_earnings_to_assets: x[1], x3_ebit_to_assets: x[2], x4_equity_to_liabilities: x[3], x5_sales_to_assets: x[4] }, thresholds: { safe_above: v.safe, distress_below: v.distress }, x4_definition: v.x4 };
    },
  },
  {
    name: "piotroski_f_score",
    title: "Piotroski F-score",
    description: "Score a company's financial strength 0-9 from two years of statements: profitability, leverage and liquidity, and operating efficiency signals, each shown.",
    keywords: "piotroski f score financial strength value investing quality signals",
    input: z.object({ current: year.describe("This year's figures."), prior: year.describe("Last year's figures.") }).strict(),
    run({ current: c, prior: p }) {
      const roa = (y) => y.net_income / (y.total_assets_begin ?? y.total_assets);
      const turn = (y) => y.revenue / (y.total_assets_begin ?? y.total_assets);
      const s = {
        roa_positive: roa(c) > 0, cfo_positive: c.operating_cash_flow > 0, roa_improved: roa(c) > roa(p), cfo_exceeds_net_income: c.operating_cash_flow > c.net_income,
        leverage_fell: c.long_term_debt / c.total_assets < p.long_term_debt / p.total_assets, current_ratio_rose: c.current_assets / c.current_liabilities > p.current_assets / p.current_liabilities,
        no_new_shares: c.shares_outstanding <= p.shares_outstanding, gross_margin_rose: c.gross_profit / c.revenue > p.gross_profit / p.revenue, asset_turnover_rose: turn(c) > turn(p),
      };
      return { f_score: Object.values(s).filter(Boolean).length, signals: s };
    },
  },
  {
    name: "beneish_m_score",
    title: "Beneish M-score",
    description: "Compute the eight-variable Beneish M-score earnings-manipulation screen from two years of statements, with every index; above -1.78 flags likely manipulation.",
    keywords: "beneish m score earnings manipulation accounting fraud accruals forensic",
    input: z.object({ current: beneishYear.describe("This year's figures."), prior: beneishYear.describe("Last year's figures.") }).strict(),
    run({ current: c, prior: p }) {
      const gm = (y) => (y.revenue - y.cost_of_goods_sold) / y.revenue;
      const aq = (y) => 1 - (y.current_assets + y.ppe + (y.securities ?? 0)) / y.total_assets;
      const dep = (y) => y.depreciation / (y.depreciation + y.ppe);
      const idx = {
        dsri: (c.receivables / c.revenue) / (p.receivables / p.revenue), gmi: gm(p) / gm(c), aqi: aq(c) / aq(p), sgi: c.revenue / p.revenue,
        depi: dep(p) / dep(c), sgai: (c.sga / c.revenue) / (p.sga / p.revenue),
        lvgi: ((c.current_liabilities + c.long_term_debt) / c.total_assets) / ((p.current_liabilities + p.long_term_debt) / p.total_assets),
        tata: (c.net_income - c.operating_cash_flow) / c.total_assets,
      };
      const m = -4.84 + 0.92 * idx.dsri + 0.528 * idx.gmi + 0.404 * idx.aqi + 0.892 * idx.sgi + 0.115 * idx.depi - 0.172 * idx.sgai + 4.679 * idx.tata - 0.327 * idx.lvgi;
      return { m_score: m, likely_manipulator: m > -1.78, threshold: -1.78, indexes: idx };
    },
  },
  {
    name: "dupont_analysis",
    title: "DuPont ROE decomposition",
    description: "Decompose return on equity into margin, asset turnover and leverage (three-step), and into tax burden, interest burden, operating margin, turnover and leverage (five-step).",
    keywords: "dupont roe return on equity decomposition margin turnover leverage tax burden interest burden",
    input: z.object({
      net_income: money("Net income."), revenue: z.number().positive().describe("Revenue."), total_assets: z.number().positive().describe("Total (or average) assets."),
      equity: z.number().positive().describe("Shareholders' equity (or average)."), pretax_income: money("Earnings before tax, for five-step.").optional(), ebit: money("EBIT, for five-step.").optional(),
    }).strict(),
    run({ net_income: ni, revenue: s, total_assets: ta, equity: e, pretax_income: ebt, ebit }) {
      const out = { roe: ni / e, net_margin: ni / s, asset_turnover: s / ta, equity_multiplier: ta / e, roa: ni / ta };
      if (ebt !== undefined && ebit !== undefined) Object.assign(out, { tax_burden: ni / ebt, interest_burden: ebt / ebit, operating_margin: ebit / s });
      return out;
    },
  },
  {
    name: "graham_valuation",
    title: "Graham number and growth formula",
    description: "Compute Benjamin Graham's number (sqrt 22.5 x EPS x book value per share) and his revised growth formula value, with margin of safety against a price.",
    keywords: "graham number intrinsic value benjamin graham growth formula margin of safety value investing",
    input: z.object({
      eps: z.number().describe("Earnings per share (trailing)."),
      book_value_per_share: z.number().optional().describe("Book value per share, for the Graham number."),
      growth_percent: z.number().min(-50).max(100).optional().describe("Expected 7-10 year growth in percent, e.g. 8 for 8%."),
      aaa_yield_percent: z.number().positive().max(30).optional().describe("Current AAA corporate yield in percent; default 4.4 (Graham's base)."),
      price: z.number().positive().optional().describe("Share price, for margin of safety."),
    }).strict(),
    run({ eps, book_value_per_share: b, growth_percent: g, aaa_yield_percent: y = 4.4, price }) {
      const number = b !== undefined && eps > 0 && b > 0 ? Math.sqrt(22.5 * eps * b) : undefined;
      const formula = g !== undefined ? eps * (8.5 + 2 * g) * 4.4 / y : undefined;
      const mos = (v) => (price && v ? 1 - price / v : undefined);
      return { graham_number: number, growth_formula_value: formula, margin_of_safety_number: mos(number), margin_of_safety_formula: mos(formula) };
    },
  },
];
