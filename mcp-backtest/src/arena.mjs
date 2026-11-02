// The arena: a paper market for AI agents to trade in. Made-up assets and made-up money, cleared in a
// uniform-price call auction each step, reproducible from a seed. It is here so agents' behaviour
// together can be studied: who supplies liquidity, who gets picked off, what a crowd does to a price.
//
// It touches nothing real. No real security, token or currency is represented, no order leaves the
// file, and nothing here can be turned into a real market: running one needs registration as an
// exchange or as a broker-dealer running an alternative trading system.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";

export const ARENA_LIMITS_TEXT = Object.freeze([
  "Paper only: made-up assets and made-up money. Nothing here represents or can reach a real security, token or currency.",
  "A simulated market leaves out most of what moves real ones, so behaviour here is a sketch for study and does not predict results in real markets.",
]);

const file = z.string().min(1).max(1000);
const assetId = z.string().regex(/^ART[0-9]{1,2}$/, "an arena asset, such as ART1");
// Names become keys in the state file, so ones every JavaScript object already answers to are refused.
const agentId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{1,39}$/).refine((n) => !(n in {}), "that name is reserved");
export const arenaNewInput = z.object({
  arena_file: file.describe("The arena's state file; must not exist yet."),
  seed: z.number().int().min(0).max(2 ** 31 - 2).optional().describe("The same seed and the same orders give the same market. Default 1."),
  assets: z.number().int().min(1).max(20).optional().describe("Made-up assets. Default 3."),
  starting_cash: z.number().positive().max(1e9).optional().describe("Made-up money each agent starts with. Default 100000."),
  bots: z.number().int().min(0).max(50).optional().describe("Scripted traders that keep the market moving: noise, value and momentum in turn. Default 6."),
}).strict();
export const arenaOrdersInput = z.object({
  arena_file: file,
  agent: agentId,
  orders: z.array(z.object({ asset: assetId, side: z.enum(["buy", "sell"]), quantity: z.number().int().positive().max(1e7), limit: z.number().positive().max(1e7) }).strict()).max(50).describe("Replaces this agent's orders for the coming step. No short selling and no borrowing."),
}).strict();
export const arenaStepInput = z.object({ arena_file: file, steps: z.number().int().min(1).max(1000).optional().describe("Default 1.") }).strict();

const SHARES_PER_AGENT = 100;
const load = (f) => { if (!existsSync(f)) throw new RangeError(`${f} is not an arena yet: call arena_new`); let s = null; try { s = JSON.parse(readFileSync(f, "utf8")); } catch { /* a parse error quotes the file, so it stays here */ } if (s?.schema !== "canli.arena.v1") throw new RangeError(`${f} is not an arena file`); return s; };
// Every order in a step comes from an agent in the file, however the file was written.
const orderLines = (state) => Object.entries(state.orders).filter(([agent]) => Object.hasOwn(state.agents, agent));
const save = (f, s) => writeFileSync(f, JSON.stringify(s));
function rng(state) { state.rng = (state.rng * 16807) % 2147483647; return state.rng / 2147483647; }
const gauss = (s) => Math.sqrt(-2 * Math.log(rng(s))) * Math.cos(2 * Math.PI * rng(s));
const newAgent = (s) => ({ cash: s.starting_cash, holdings: Object.fromEntries(s.assets.map((x) => [x.id, SHARES_PER_AGENT])), start_worth: s.starting_cash + s.assets.reduce((n, x) => n + SHARES_PER_AGENT * x.last, 0) });
const round2 = (x) => Math.round(x * 100) / 100;

export function arenaNew(args) {
  const a = arenaNewInput.parse(args);
  if (existsSync(a.arena_file)) throw new RangeError(`${a.arena_file} already exists`);
  const state = { schema: "canli.arena.v1", paper_only: true, step: 0, rng: (a.seed ?? 1) + 1, starting_cash: a.starting_cash ?? 100000, assets: [], agents: {}, orders: {}, history: [] };
  for (let i = 0; i < (a.assets ?? 3); i += 1) { const value = round2(50 + 100 * rng(state)); state.assets.push({ id: `ART${i + 1}`, value, last: value }); }
  const kinds = ["noise", "value", "momentum"];
  state.bots = Array.from({ length: a.bots ?? 6 }, (_, i) => ({ name: `bot-${kinds[i % 3]}-${i}`, kind: kinds[i % 3] }));
  for (const b of state.bots) state.agents[b.name] = newAgent(state);
  save(a.arena_file, state);
  return { arena_file: a.arena_file, assets: state.assets.map((x) => ({ id: x.id, last: x.last })), bots: state.bots.length, plain_reading: "A new paper arena: made-up assets and made-up money. Send orders with arena_orders, then call arena_step.", limits: ARENA_LIMITS_TEXT };
}

// Refused if the agent could not pay for its buys or deliver its sells even if all of them filled.
export function checkOrders(state, agent, orders) {
  const me = Object.hasOwn(state.agents, agent) ? state.agents[agent] : newAgent(state), known = new Set(state.assets.map((x) => x.id));
  let spend = 0;
  const selling = {};
  for (const o of orders) {
    if (!known.has(o.asset)) throw new RangeError(`no asset ${o.asset} in this arena`);
    if (o.side === "buy") spend += o.quantity * o.limit; else selling[o.asset] = (selling[o.asset] ?? 0) + o.quantity;
  }
  if (spend > me.cash + 1e-9) throw new RangeError(`these buys could cost ${round2(spend)} and ${agent} has ${round2(me.cash)}: no borrowing here`);
  for (const [k, q] of Object.entries(selling)) if (q > (me.holdings[k] ?? 0)) throw new RangeError(`${agent} holds ${me.holdings[k] ?? 0} ${k} and is selling ${q}: no short selling here`);
}
export function arenaOrders(args) {
  const a = arenaOrdersInput.parse(args), state = load(a.arena_file);
  if (state.bots.some((b) => b.name === a.agent)) throw new RangeError(`${a.agent} is one of the arena's scripted traders`);
  checkOrders(state, a.agent, a.orders);
  if (!Object.hasOwn(state.agents, a.agent)) state.agents[a.agent] = newAgent(state);
  state.orders[a.agent] = a.orders;
  save(a.arena_file, state);
  return { agent: a.agent, orders_waiting: a.orders.length, step: state.step, plain_reading: `${a.orders.length} paper orders wait for step ${state.step + 1}.`, limits: ARENA_LIMITS_TEXT };
}

// The uniform-price call auction: the price where the most can trade; among those, where the
// imbalance is smallest, then nearest the last price. Best limits fill first, earliest first at a tie.
export function clearAuction(orders, last) {
  const buys = orders.filter((o) => o.side === "buy").sort((a, b) => b.limit - a.limit || a.at - b.at);
  const sells = orders.filter((o) => o.side === "sell").sort((a, b) => a.limit - b.limit || a.at - b.at);
  const candidates = [...new Set(orders.map((o) => o.limit))];
  let best = null;
  for (const p of candidates) {
    const demand = buys.filter((o) => o.limit >= p).reduce((n, o) => n + o.quantity, 0), supply = sells.filter((o) => o.limit <= p).reduce((n, o) => n + o.quantity, 0);
    const volume = Math.min(demand, supply), imbalance = Math.abs(demand - supply), gap = Math.abs(p - last);
    if (volume > 0 && (!best || volume > best.volume || (volume === best.volume && (imbalance < best.imbalance || (imbalance === best.imbalance && gap < best.gap))))) best = { price: p, volume, imbalance, gap };
  }
  if (!best) return { price: null, volume: 0, fills: [] };
  const fills = [];
  const take = (list, side) => { let left = best.volume; for (const o of list) { if (left <= 0) break; if (side === "buy" ? o.limit < best.price : o.limit > best.price) continue; const q = Math.min(o.quantity, left); fills.push({ agent: o.agent, side, quantity: q }); left -= q; } };
  take(buys, "buy");
  take(sells, "sell");
  return { price: best.price, volume: best.volume, fills };
}

function botOrders(state, bot, asset, previous, left) {
  const me = state.agents[bot.name], qty = 1 + Math.floor(rng(state) * 5), noise = 1 + 0.01 * gauss(state);
  let side, limit;
  if (bot.kind === "value") { side = asset.last < asset.value ? "buy" : "sell"; limit = (asset.last + asset.value) / 2; }
  else if (bot.kind === "momentum") { side = previous !== null && asset.last >= previous ? "buy" : "sell"; limit = asset.last * (side === "buy" ? 1.01 : 0.99); }
  else { side = rng(state) < 0.5 ? "buy" : "sell"; limit = asset.last * noise; }
  limit = Math.max(0.01, round2(limit));
  if (side === "buy") { if (left.cash < qty * limit) return null; left.cash -= qty * limit; }
  if (side === "sell" && (me.holdings[asset.id] ?? 0) < qty) return null;
  return { asset: asset.id, side, quantity: qty, limit };
}

export function stepOnce(state) {
  state.step += 1;
  // Buys are held against cash across assets in this step, so no agent can overspend across auctions.
  const all = [];
  let at = 0;
  for (const [agent, orders] of orderLines(state)) for (const o of orders) all.push({ ...o, agent, at: at++ });
  const previous = state.history.at(-1)?.prices_before ?? {};
  // What a bot could pay is held across its auctions in a step, as an agent's buys are at arena_orders.
  for (const bot of state.bots) { const left = { cash: state.agents[bot.name].cash }; for (const asset of state.assets) { const o = botOrders(state, bot, asset, previous[asset.id] ?? null, left); if (o) all.push({ ...o, agent: bot.name, at: at++ }); } }
  const record = { step: state.step, prices_before: Object.fromEntries(state.assets.map((x) => [x.id, x.last])), auctions: {} };
  for (const asset of state.assets) {
    const r = clearAuction(all.filter((o) => o.asset === asset.id), asset.last);
    record.auctions[asset.id] = { price: r.price, volume: r.volume };
    if (r.price !== null) {
      for (const f of r.fills) {
        const me = state.agents[f.agent], cost = f.quantity * r.price;
        if (f.side === "buy") { me.cash -= cost; me.holdings[asset.id] = (me.holdings[asset.id] ?? 0) + f.quantity; }
        else { me.cash += cost; me.holdings[asset.id] -= f.quantity; }
      }
      asset.last = r.price;
    }
    // The made-up value drifts on its own each step: there is no real company behind it.
    asset.value = Math.max(1, round2(asset.value * (1 + 0.01 * gauss(state))));
  }
  state.orders = {};
  state.history.push(record);
  if (state.history.length > 500) state.history.shift();
}

export function standings(state) {
  const worth = (me) => me.cash + state.assets.reduce((n, x) => n + (me.holdings[x.id] ?? 0) * x.last, 0);
  return Object.entries(state.agents).map(([agent, me]) => ({ agent, bot: state.bots.some((b) => b.name === agent), worth: round2(worth(me)), gain: round2(worth(me) - me.start_worth), cash: round2(me.cash), holdings: me.holdings })).sort((a, b) => b.gain - a.gain);
}

export function arenaStep(args) {
  const a = arenaStepInput.parse(args), state = load(a.arena_file);
  for (let i = 0; i < (a.steps ?? 1); i += 1) stepOnce(state);
  save(a.arena_file, state);
  const last = state.history.at(-1);
  return { step: state.step, prices: Object.fromEntries(state.assets.map((x) => [x.id, x.last])), last_auctions: last.auctions, standings: standings(state).slice(0, 25), plain_reading: `Paper step ${state.step} cleared. No real asset or money is involved.`, limits: ARENA_LIMITS_TEXT };
}
