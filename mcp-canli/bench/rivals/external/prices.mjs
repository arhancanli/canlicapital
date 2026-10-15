// What a run costs, for the budget guard: US dollars per million tokens, as listed on 2026-10-15.
// Check the providers' price pages before a paid run and correct these; a model not listed here runs
// only with PRICE_IN and PRICE_OUT set (dollars per million input and output tokens).
// Anthropic bills cache reads at a tenth of the input price and cache writes at 1.25 times it;
// OpenAI bills cached input at a tenth.
export const PRICES = Object.freeze({
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "gpt-5.5": { input: 5, output: 30 },
  "gpt-5.4-mini": { input: 0.75, output: 4.5 },
  mock: { input: 0, output: 0 },
});

export function priceOf(model, env = process.env) {
  if (env.PRICE_IN && env.PRICE_OUT) return { input: Number(env.PRICE_IN), output: Number(env.PRICE_OUT) };
  const p = PRICES[model];
  if (!p) throw new Error(`No price for ${model}: add it to prices.mjs or set PRICE_IN and PRICE_OUT, so the budget guard can work.`);
  return p;
}

// usage: { input, cache_read, cache_write, output } in tokens, input excluding the cached parts.
export function costOf(model, usage, env = process.env) {
  const p = priceOf(model, env);
  const m = 1e6;
  return ((usage.input ?? 0) * p.input + (usage.cache_read ?? 0) * p.input * 0.1 + (usage.cache_write ?? 0) * p.input * 1.25 + (usage.output ?? 0) * p.output) / m;
}
