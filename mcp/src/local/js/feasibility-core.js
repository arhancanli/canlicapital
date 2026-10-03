// =============================================================================
// feasibility-core.js
// -----------------------------------------------------------------------------
// Would this strategy survive contact with a real broker and a real order book? A backtest assumes
// every order fills at the close for a flat cost. This checks the things that break that
// assumption first, each one stated with the number it rests on:
//
//   order rate      the broker's published API limit against the strategy's burst of orders
//   minimum order   the smallest order the broker accepts against the strategy's typical order
//   settlement and  US equities settle T+1; FINRA retired the pattern day trader rule on 4 June
//   day trading     2026 (firms may phase in the replacement until 20 October 2027)
//   participation   each order's share of the asset's daily volume, with every copy of the
//                   strategy trading the same signal counted
//   market impact   the square-root law: impact ~ Y x daily volatility x sqrt(participation),
//                   Y of order one (Toth et al. 2011; Bouchaud et al. 2018); Y is an input
//   capacity        the capital at which costs and impact eat the expected gross return
//
// Broker facts carry the date they were checked and their source. They change; the BROKER_FACTS
// table is the one place to update them.
// =============================================================================

export const FACTS_CHECKED = "2026-10-03";

export const BROKER_FACTS = Object.freeze({
  alpaca: {
    name: "Alpaca",
    orders_per_minute: 200,
    orders_per_minute_note: "Trading API: 200 requests per minute per account; HTTP 429 above it.",
    min_order_usd: 1,
    min_order_note: "Fractional and notional orders: at least 1 USD notional.",
    day_trading_note: "Alpaca retired pattern day trader restrictions on 4 June 2026 and applies FINRA's intraday margin framework.",
    sources: [
      "https://alpaca.markets/support/usage-limit-api-calls",
      "https://alpaca.markets/support/can-we-submit-orders-smaller-than-1-usd-in-notional-value",
      "https://docs.alpaca.markets/us/docs/understanding-finras-new-intraday-margin-rule-and-the-end-of-pdt",
    ],
  },
  ibkr: {
    name: "Interactive Brokers",
    orders_per_minute: 3000,
    orders_per_minute_note: "TWS API: 50 messages per second by default (market data lines / 2), about 3,000 a minute.",
    min_order_usd: null,
    min_order_note: "No single minimum order value is published for every product; check the contract.",
    day_trading_note: "FINRA allows firms to phase in the intraday margin standard until 20 October 2027; check the account's current day-trading treatment.",
    sources: ["https://www.interactivebrokers.com/docs/tws-api/doc/pacing-limitations/introduction"],
  },
  other: {
    name: "Other broker",
    orders_per_minute: null,
    orders_per_minute_note: "No published limit on file; send orders_per_minute_limit.",
    min_order_usd: null,
    min_order_note: "No minimum on file.",
    day_trading_note: "FINRA allows firms to phase in the intraday margin standard until 20 October 2027; check the account's current day-trading treatment.",
    sources: [],
  },
});

export const RULE_SOURCES = Object.freeze({
  finra_intraday_margin: [
    "https://www.sec.gov/files/rules/sro/finra/2026/34-105226.pdf",
    "https://www.finra.org/rules-guidance/notices/26-10",
  ],
  square_root_impact: [
    "Toth, Lemperiere, Deremble, de Lataillade, Kockelkoren and Bouchaud, Anomalous price impact and the critical nature of liquidity in financial markets, Physical Review X 1, 2011",
    "Bouchaud, Bonart, Donier and Gould, Trades, Quotes and Prices, Cambridge University Press, 2018",
  ],
});

const ASSET_CLASSES = ["us_equity", "crypto", "futures", "fx", "options"];
const ACCOUNTS = ["cash", "margin"];

const num = (name, value, { min = 0, max = Number.MAX_SAFE_INTEGER, optional = false, integer = false } = {}) => {
  if (value === undefined || value === null) {
    if (optional) return undefined;
    throw new RangeError(`${name} is required`);
  }
  const v = Number(value);
  if (!Number.isFinite(v) || v < min || v > max || (integer && !Number.isInteger(v))) {
    throw new RangeError(`${name} must be ${integer ? "a whole number" : "a number"} from ${min} to ${max}; got ${JSON.stringify(value)}`);
  }
  return v;
};

const round = (x, digits = 2) => (Number.isFinite(x) ? Number(x.toFixed(digits)) : null);
// Significant figures, for quantities like participation that can be a few millionths.
const sig = (x, digits = 4) => (Number.isFinite(x) ? Number(x.toPrecision(digits)) : null);

/** Square-root market impact of one order, in basis points. */
export function impactBps({ dailyVolatility, participation, coefficient = 1 }) {
  return coefficient * dailyVolatility * Math.sqrt(Math.max(0, participation)) * 10000;
}

export function checkFeasibility(input) {
  const broker = String(input.broker ?? "other").toLowerCase();
  if (!BROKER_FACTS[broker]) throw new RangeError(`broker must be one of ${Object.keys(BROKER_FACTS).join(", ")}`);
  const assetClass = String(input.asset_class ?? "us_equity");
  if (!ASSET_CLASSES.includes(assetClass)) throw new RangeError(`asset_class must be one of ${ASSET_CLASSES.join(", ")}`);
  const account = String(input.account ?? "margin");
  if (!ACCOUNTS.includes(account)) throw new RangeError(`account must be one of ${ACCOUNTS.join(", ")}`);
  const capital = num("capital_usd", input.capital_usd, { min: 1, max: 1e13 });
  const ordersPerRebalance = num("orders_per_rebalance", input.orders_per_rebalance, { min: 1, max: 1e6, integer: true });
  const rebalancesPerYear = num("rebalances_per_year", input.rebalances_per_year, { min: 1, max: 100000 });
  const turnover = num("turnover_per_year", input.turnover_per_year, { min: 0, max: 100000 });
  const adv = num("adv_usd", input.adv_usd, { min: 1, max: 1e13 });
  const vol = num("daily_volatility", input.daily_volatility, { min: 0.0001, max: 1 });
  const copies = num("copies", input.copies ?? 1, { min: 1, max: 1e6, integer: true });
  const coefficient = num("impact_coefficient", input.impact_coefficient ?? 1, { min: 0.05, max: 5 });
  const feesBps = num("spread_and_fees_bps", input.spread_and_fees_bps ?? 0, { min: 0, max: 1000 });
  const minutesPerRebalance = num("minutes_per_rebalance", input.minutes_per_rebalance ?? 1, { min: 1, max: 1440 });
  const edge = num("expected_gross_return", input.expected_gross_return, { min: -1, max: 10, optional: true });
  const facts = BROKER_FACTS[broker];
  const rateLimit = num("orders_per_minute_limit", input.orders_per_minute_limit ?? facts.orders_per_minute ?? undefined, { min: 1, max: 1e7, optional: true });

  const ordersPerYear = ordersPerRebalance * rebalancesPerYear;
  const avgOrder = (capital * turnover) / ordersPerYear;
  const participation = (avgOrder * copies) / adv;
  const checks = [];
  const add = (name, status, finding, numbers = {}) => checks.push({ name, status, finding, ...numbers });

  // Order rate: a rebalance's orders spread over minutes_per_rebalance.
  if (rateLimit) {
    const peak = Math.ceil(ordersPerRebalance / minutesPerRebalance);
    const minutesNeeded = Math.ceil(ordersPerRebalance / rateLimit);
    add("order_rate", peak > rateLimit ? "blocking" : peak > 0.5 * rateLimit ? "warning" : "ok",
      peak > rateLimit
        ? `${peak} orders a minute exceeds ${facts.name}'s ${rateLimit} a minute; spread each rebalance over at least ${minutesNeeded} minutes.`
        : `${peak} orders a minute against a limit of ${rateLimit}${peak > 0.5 * rateLimit ? ", over half of it, leaving little room for cancels and retries" : ""}.`,
      { peak_orders_per_minute: peak, limit_per_minute: rateLimit });
  } else {
    add("order_rate", "unknown", "No order-rate limit is on file for this broker; send orders_per_minute_limit.");
  }

  // Minimum order.
  if (facts.min_order_usd) {
    add("minimum_order", avgOrder < facts.min_order_usd ? "blocking" : "ok",
      avgOrder < facts.min_order_usd
        ? `The average order is ${avgOrder.toFixed(2)} USD, below ${facts.name}'s ${facts.min_order_usd} USD minimum.`
        : `The average order is ${Math.round(avgOrder).toLocaleString("en-GB")} USD, above the ${facts.min_order_usd} USD minimum.`,
      { average_order_usd: round(avgOrder) });
  } else {
    add("minimum_order", "unknown", facts.min_order_note, { average_order_usd: round(avgOrder) });
  }

  // Settlement and day trading.
  if (assetClass === "us_equity") {
    if (account === "cash" && rebalancesPerYear > 252) {
      add("settlement", "warning", "US equities settle T+1. In a cash account, selling a position bought with unsettled funds before they settle is a good-faith violation; intraday rebalancing needs a margin account.");
    } else {
      add("day_trading", "ok", `FINRA's pattern day trader rule and its 25,000 USD minimum were retired on 4 June 2026 in favour of intraday margin standards; firms may phase the change in until 20 October 2027. ${facts.day_trading_note}`, { sources: RULE_SOURCES.finra_intraday_margin });
    }
  }

  // Participation and impact.
  const impact = impactBps({ dailyVolatility: vol, participation, coefficient });
  const impactAlone = impactBps({ dailyVolatility: vol, participation: avgOrder / adv, coefficient });
  add("participation", participation > 0.1 ? "blocking" : participation > 0.01 ? "warning" : "ok",
    `Each order is ${(participation * 100).toFixed(3)}% of the asset's daily dollar volume${copies > 1 ? ` with ${copies} copies of the strategy trading together` : ""}${participation > 0.1 ? "; above a tenth of the day's volume the order moves the price it is trying to get" : participation > 0.01 ? "; above 1% impact is no longer a rounding error" : ""}.`,
    { participation: sig(participation) });
  const annualCost = ((impact + feesBps) / 10000) * turnover;
  add("market_impact", impact > 50 ? "warning" : "ok",
    `Square-root impact of about ${impact.toFixed(1)} bps an order${copies > 1 ? ` (${impactAlone.toFixed(1)} bps if this were the only copy; ${copies} copies multiply impact by about ${Math.sqrt(copies).toFixed(2)})` : ""}; with ${feesBps} bps of spread and fees and a turnover of ${turnover} times capital a year, costs take about ${(annualCost * 100).toFixed(2)}% a year.`,
    { impact_bps_per_order: sig(impact), annual_cost_drag: sig(annualCost), ...(copies > 1 ? { impact_bps_single_copy: sig(impactAlone), crowding_multiplier: sig(Math.sqrt(copies)) } : {}) });

  // Capacity: costs grow with sqrt(capital) through participation. Solve for the capital where
  // fees + impact, times turnover, equal the expected gross return.
  let capacity = null;
  if (edge !== undefined) {
    if (turnover === 0) {
      add("capacity", "ok", "No turnover, so trading costs do not limit capacity.");
    } else {
      const perTradeBudget = edge / turnover - feesBps / 10000;
      if (perTradeBudget <= 0) {
        add("capacity", "blocking", `Spread and fees alone (${feesBps} bps x ${turnover} turnover) consume the expected gross return of ${(edge * 100).toFixed(2)}% before any impact.`);
      } else {
        // impact fraction = coefficient * vol * sqrt(C * turnover * copies / (ordersPerYear * adv))
        capacity = (ordersPerYear * adv / (turnover * copies)) * (perTradeBudget / (coefficient * vol)) ** 2;
        add("capacity", capital > capacity ? "blocking" : capital > capacity / 2 ? "warning" : "ok",
          `Costs would equal the expected gross return of ${(edge * 100).toFixed(2)}% at about ${Math.round(capacity).toLocaleString("en-GB")} USD of capital${copies > 1 ? " shared across the copies' signal" : ""}; this plan uses ${Math.round(capital).toLocaleString("en-GB")}.`,
          { capacity_usd: round(capacity, 0), net_return_after_costs: round(edge - annualCost, 4) });
      }
    }
  }

  const blocking = checks.filter((c) => c.status === "blocking");
  const warnings = checks.filter((c) => c.status === "warning");
  const verdict = blocking.length ? "not feasible as specified" : warnings.length ? "feasible with changes" : "feasible on these checks";
  return {
    schema: "canli.feasibility.v1",
    verdict,
    broker: facts.name,
    asset_class: assetClass,
    account,
    plan: { capital_usd: capital, orders_per_year: ordersPerYear, average_order_usd: round(avgOrder), copies },
    checks,
    to_change: [...blocking, ...warnings].map((c) => `${c.name}: ${c.finding}`),
    facts_checked: FACTS_CHECKED,
    sources: { broker: facts.sources, ...RULE_SOURCES },
    plain_reading: `${verdict[0].toUpperCase()}${verdict.slice(1)}: ${blocking.length} blocking and ${warnings.length} warning finding${blocking.length + warnings.length === 1 ? "" : "s"} across ${checks.length} checks. Market impact is a model (square-root law, coefficient ${coefficient}); broker limits were checked on ${FACTS_CHECKED} and can change.`,
  };
}

export const FEASIBILITY_LIMITS_TEXT = Object.freeze([
  "Checks the plan as described against published broker limits and a market-impact model; it never contacts a broker or sees an account.",
  "Impact uses the square-root law with the stated coefficient; real impact varies by asset, time of day and order type.",
  "Broker rules change; each fact carries the date it was checked and its source.",
]);
