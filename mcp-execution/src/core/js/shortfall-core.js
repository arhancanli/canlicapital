// Implementation shortfall: positive means cost. All parts use decision notional as their
// denominator, including arrival/at-open comparisons. Fees are USD per fill, never an assumed rate.
// The stationary bootstrap resamples ordered orders as geometric circular blocks (Politis/Romano).
export const MAX_MOVE = 0.30;
const BPS = 10000;

export function sum(values) {
  let total = 0, compensation = 0;
  for (const value of values) {
    const adjusted = value - compensation;
    const next = total + adjusted;
    compensation = (next - total) - adjusted;
    total = next;
  }
  return total;
}

export function seededRandom(seed) {
  let state = (seed >>> 0) || 0x6d2b79f5;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

export function stationaryIndices(starts, uniforms, restartProbability) {
  const indices = [...starts];
  for (let i = 1; i < indices.length; i++) {
    if (uniforms[i] >= restartProbability) indices[i] = (indices[i - 1] + 1) % indices.length;
  }
  return indices;
}

const quantile = (sorted, p) => {
  const position = (sorted.length - 1) * p;
  const low = Math.floor(position), high = Math.ceil(position);
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
};

export function bootstrapInterval(costs, notionals, { seed = 20261001, block_length = Math.min(5, costs.length), resamples = 499 } = {}, random = seededRandom(seed)) {
  if (costs.length !== notionals.length || costs.length < 2) throw new RangeError("bootstrap needs at least two aligned cost/notional observations");
  if (!costs.every(Number.isFinite) || !notionals.every((x) => Number.isFinite(x) && x > 0)) throw new RangeError("bootstrap needs finite costs and positive notionals");
  if (!(block_length >= 1 && block_length <= costs.length) || !Number.isInteger(resamples) || resamples < 99 || resamples > 1999) throw new RangeError("bootstrap block_length must be 1..orders and resamples 99..1999");
  const n = costs.length;
  if (n * resamples > 5000000) throw new RangeError("bootstrap exceeds 5,000,000 sampled observations; reduce resamples or orders");
  const samples = [];
  for (let b = 0; b < resamples; b++) {
    const starts = Array.from({ length: n }, () => Math.floor(random() * n));
    const uniforms = Array.from({ length: n }, random);
    const indices = stationaryIndices(starts, uniforms, 1 / block_length);
    samples.push(sum(indices.map((i) => costs[i])) / sum(indices.map((i) => notionals[i])) * BPS);
  }
  samples.sort((a, b) => a - b);
  return { method: "stationary_percentile", confidence: 0.95, low_bps: quantile(samples, 0.025), high_bps: quantile(samples, 0.975), seed, resamples, block_length, observations: n };
}

const validPrice = (x) => Number.isFinite(x) && x > 0;
const unknownSum = (rows, field) => rows.some((row) => row[field] === null) ? null : sum(rows.map((row) => row[field]));
const finiteAmounts = (amounts, context) => {
  if (Object.values(amounts).some((value) => value !== null && !Number.isFinite(value))) throw new RangeError(`${context}: derived monetary values must be finite`);
};

export function measureShortfall(input) {
  const benchmark = input.benchmark ?? "decision";
  if (!["decision", "arrival", "at_open"].includes(benchmark)) throw new RangeError("benchmark must be decision, arrival or at_open");
  if (!Array.isArray(input.orders) || !input.orders.length || input.orders.length > 10000) throw new RangeError("orders must contain 1..10000 orders");
  const ids = new Set();
  const rows = [], excluded = [];
  let fillsRead = 0;
  for (const [index, order] of input.orders.entries()) {
    const prefix = `orders.${index}`;
    if (typeof order.id !== "string" || !order.id || ids.has(order.id)) throw new RangeError(`${prefix}.id must be non-empty and unique`);
    ids.add(order.id);
    if (!["buy", "sell"].includes(order.side)) throw new RangeError(`${prefix}.side must be buy or sell`);
    if (!Number.isFinite(order.qty) || order.qty < 0) throw new RangeError(`${prefix}.qty must be finite and non-negative`);
    if (!Array.isArray(order.fills)) throw new RangeError(`${prefix}.fills must be an array`);
    fillsRead += order.fills.length;
    if (fillsRead > 50000) throw new RangeError("orders exceed 50,000 fills");
    for (const [f, fill] of order.fills.entries()) {
      if (!(Number.isFinite(fill.qty) && fill.qty > 0) || !validPrice(fill.price) || (fill.fee !== undefined && !Number.isFinite(fill.fee))) throw new RangeError(`${prefix}.fills.${f} needs positive finite quantity/price and a finite fee when stated`);
      if (fill.ts !== undefined && (!Number.isFinite(Date.parse(fill.ts)) || !Number.isFinite(Date.parse(order.decision_ts)) || Date.parse(fill.ts) < Date.parse(order.decision_ts))) throw new RangeError(`${prefix}.fills.${f}.ts must not precede decision_ts`);
    }
    const filledQty = sum(order.fills.map((fill) => fill.qty));
    if (filledQty - order.qty > Number.EPSILON * Math.max(filledQty, order.qty) * 16) throw new RangeError(`${prefix}.fills quantity exceeds order quantity`);
    const exclude = (reason) => excluded.push({ id: order.id, reason });
    if (!order.qty) { exclude("zero_quantity"); continue; }
    const remaining = Math.max(0, order.qty - filledQty);
    const reference = benchmark === "decision" ? order.decision_price : benchmark === "arrival" ? order.arrival_mid : order.open_price;
    if (!validPrice(order.decision_price) || !validPrice(reference) || (remaining > 0 && !validPrice(order.horizon_price))) { exclude("no_price"); continue; }
    const prices = [reference, order.arrival_mid, order.open_price, order.horizon_price, ...order.fills.map((fill) => fill.price)].filter((price) => price !== undefined);
    if (prices.some((price) => !validPrice(price))) { exclude("no_price"); continue; }
    if (prices.some((price) => Math.abs(price / order.decision_price - 1) > MAX_MOVE + 1e-12)) { exclude("implausible_move"); continue; }
    const direction = order.side === "buy" ? 1 : -1;
    const trading = direction * sum(order.fills.map((fill) => fill.qty * (fill.price - reference)));
    const opportunity = remaining ? direction * remaining * (order.horizon_price - reference) : 0;
    const delay = benchmark !== "decision" || !filledQty ? 0 : validPrice(order.arrival_mid) ? direction * filledQty * (order.arrival_mid - reference) : null;
    const execution = delay === null ? null : trading - delay;
    const fees = order.fills.every((fill) => fill.fee !== undefined) ? sum(order.fills.map((fill) => fill.fee)) : null;
    const priceCost = trading + opportunity;
    const amounts = { decision_notional_usd: order.qty * order.decision_price, filled_notional_usd: filledQty * order.decision_price,
      fill_fraction: filledQty / order.qty, delay_usd: delay, execution_usd: execution, opportunity_usd: opportunity, fees_usd: fees,
      price_cost_usd: priceCost, total_usd: fees === null ? null : priceCost + fees };
    finiteAmounts(amounts, prefix);
    if (amounts.decision_notional_usd <= 0) throw new RangeError(`${prefix}: decision notional must be representable and positive`);
    rows.push({ id: order.id, side: order.side, ...amounts });
  }
  const notional = sum(rows.map((row) => row.decision_notional_usd));
  const toBps = (value) => value === null || !notional ? null : value * BPS / notional;
  const feeUsd = unknownSum(rows, "fees_usd"), totalUsd = unknownSum(rows, "total_usd");
  const aggregate = {
    decision_notional_usd: notional,
    delay_bps: toBps(unknownSum(rows, "delay_usd")), execution_bps: toBps(unknownSum(rows, "execution_usd")),
    opportunity_bps: toBps(unknownSum(rows, "opportunity_usd")), fees_bps: toBps(feeUsd),
    price_cost_bps: toBps(sum(rows.map((row) => row.price_cost_usd))), total_bps: toBps(totalUsd),
    fill_rate_by_count: rows.length ? rows.filter((row) => row.fill_fraction > 0).length / rows.length : null,
    fill_rate_by_notional: notional ? sum(rows.map((row) => row.filled_notional_usd)) / notional : null,
  };
  finiteAmounts(aggregate, "aggregate");
  const excess = aggregate.total_bps !== null && input.backtest_cost_bps !== undefined ? aggregate.total_bps - input.backtest_cost_bps : null;
  finiteAmounts({ excess }, "cost comparison");
  const notMeasurable = [];
  if (rows.some((row) => row.fees_usd === null)) notMeasurable.push("fees and total: at least one fill has no stated fee; price_cost_bps excludes fees");
  if (rows.some((row) => row.delay_usd === null)) notMeasurable.push("delay/execution split: at least one filled order has no arrival_mid; combined price cost remains measurable");
  if (!rows.length) notMeasurable.push("no usable orders remain after exclusions");
  let interval = null;
  if (input.bootstrap) {
    if (rows.length < 2) notMeasurable.push("bootstrap: fewer than two usable orders");
    else interval = { ...bootstrapInterval(rows.map((row) => totalUsd === null ? row.price_cost_usd : row.total_usd), rows.map((row) => row.decision_notional_usd), { ...input.bootstrap, seed: input.seed }), basis: totalUsd === null ? "price_cost_excluding_fees" : "total_including_stated_fees" };
  }
  return { benchmark, basis: "basis_points_of_decision_notional_positive_is_cost", orders_read: input.orders.length, orders: rows.length, aggregate,
    excess_over_assumption_bps: excess,
    bootstrap_ci: interval, excluded, not_measurable: notMeasurable, rows };
}
