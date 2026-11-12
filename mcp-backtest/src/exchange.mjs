// The agent exchange: a closed paper market where different AI agents, and scripted personas beside
// them, trade against each other in limit order books. It is for seeing what agents do together: who
// supplies liquidity, who runs when it goes, and how forced selling feeds on itself. Made-up assets and
// made-up money, and nothing can leave the file.
//
// The rules are the protocol (docs/AGENT_EXCHANGE.md). Time moves in steps, not milliseconds, so no
// agent wins by being on a faster machine: everyone acts on the same view, and the order they act in
// within a step comes from the seed. The tape of every trade is hash-chained, so the same seed and the
// same orders give the same hash on any machine, and anyone can check a claimed run by replaying it.
//
// Running a real market like this needs registration as an exchange or a broker-dealer. This is not one.
import { createHash, randomBytes } from "node:crypto";
import { closeSync, existsSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { z } from "zod";

export const EXCHANGE_LIMITS_TEXT = Object.freeze([
  "Paper only: made-up assets and made-up money. Nothing here represents or can reach a real security, token or currency.",
  "A simulated market leaves out most of what moves real ones: no real news, no real funding, no real people. It shows how a set of rules can behave together, and it does not predict any real market.",
  "Personas are simple scripts with parameters someone chose. Different parameters give different cascades, so a result here is a question to ask of a real system, not an answer about it.",
]);

const file = z.string().min(1).max(1000).regex(/^[^\0]+$/, "a file path");
const agentId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{1,39}$/).refine((n) => !(n in {}), "that name is reserved");
const assetId = z.string().regex(/^ART[0-9]{1,2}$/, "an exchange asset, such as ART1");
const PERSONAS = ["market_maker", "value", "momentum", "noise", "deleverager", "stop_loss", "levered_long"];

export const exchangeNewInput = z.object({
  exchange_file: file.describe("The exchange's state file; must not exist yet."),
  seed: z.number().int().min(0).max(2 ** 31 - 2).optional().describe("The same seed and the same orders give the same market. Default 1."),
  assets: z.number().int().min(1).max(10).optional().describe("Made-up assets. Default 1."),
  personas: z.object(Object.fromEntries(PERSONAS.map((p) => [p, z.number().int().min(0).max(200).optional()]))).strict().optional().describe("How many scripted traders of each kind. Default 8 market makers, 8 value, 6 momentum, 8 noise, 4 deleveragers, 4 stop-loss, 4 levered longs."),
  starting_cash: z.number().positive().max(1e9).optional().describe("Made-up money each agent starts with. Default 100000."),
  maintenance_margin: z.number().min(0.05).max(0.9).optional().describe("An agent whose equity falls below this share of its gross positions is sold out by force. Default 0.25."),
  leverage: z.number().min(1).max(10).optional().describe("How many times its equity an agent may hold in positions when it opens them. Default 2."),
  shocks: z.array(z.object({
    step: z.number().int().min(1).max(100000),
    kind: z.enum(["value", "liquidity", "block_sale"]).describe("value: the asset's true worth jumps. liquidity: market makers pull their quotes for some steps. block_sale: one large holder sells at market."),
    asset: assetId.optional(),
    percent: z.number().min(-90).max(500).optional().describe("For value: how far it jumps."),
    steps: z.number().int().min(1).max(1000).optional().describe("For liquidity: how long; default 10."),
    quantity: z.number().int().positive().max(1e7).optional().describe("For block_sale."),
  }).strict()).max(200).optional().describe("Things that happen at set steps. Agents see them only through prices."),
}).strict();

const order = z.discriminatedUnion("type", [
  z.object({ type: z.literal("limit"), asset: assetId, side: z.enum(["buy", "sell"]), quantity: z.number().int().positive().max(1e7), price: z.number().positive().max(1e7) }).strict(),
  z.object({ type: z.literal("market"), asset: assetId, side: z.enum(["buy", "sell"]), quantity: z.number().int().positive().max(1e7) }).strict(),
  z.object({ type: z.literal("cancel"), order_id: z.number().int().positive().optional().describe("Without it, all your resting orders go.") }).strict(),
]);
export const exchangeJoinInput = z.object({ exchange_file: file, agent: agentId, about: z.string().max(200).optional().describe("What this agent is, such as its model and its brief. Shown in the report.") }).strict();
const access = { exchange_file: file, agent: agentId, token: z.string().min(16).max(80).describe("The token exchange_join gave this agent, so no agent can act as another.") };
export const exchangeViewInput = z.object({ ...access, depth: z.number().int().min(1).max(20).optional().describe("Price levels to show on each side; default 5.") }).strict();
export const exchangeOrdersInput = z.object({ ...access, orders: z.array(order).max(50).describe("What to do in the coming step. An empty list says you are passing, so the step can close.") }).strict();
export const exchangeStepInput = z.object({ exchange_file: file, steps: z.number().int().min(1).max(5000).optional().describe("Default 1."), force: z.boolean().optional().describe("Close the step even though a joined agent has not acted.") }).strict();
export const exchangeReportInput = z.object({ exchange_file: file }).strict();

// One writer at a time, whichever process or host it is: each joined agent may run its own server.
function locked(path, work) {
  const lock = `${path}.lock`;
  for (let tries = 0; ; tries += 1) {
    try { closeSync(openSync(lock, "wx")); break; } catch (err) {
      if (err.code !== "EEXIST") throw err;
      try { if (Date.now() - statSync(lock).mtimeMs > 15000) { rmSync(lock, { force: true }); continue; } } catch { continue; }
      if (tries > 400) throw new Error(`${path} is held by another writer.`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
  try { return work(); } finally { rmSync(lock, { force: true }); }
}
const load = (f) => { if (!existsSync(f)) throw new RangeError(`${f} is not an exchange yet: call exchange_new`); let s = null; try { s = JSON.parse(readFileSync(f, "utf8")); } catch { /* a parse error quotes the file, so it stays here */ } if (s?.schema !== "canli.exchange.v1") throw new RangeError(`${f} is not an agent exchange file`); return s; };
const save = (f, s) => { const tmp = `${f}.${process.pid}.tmp`; writeFileSync(tmp, JSON.stringify(s)); renameSync(tmp, f); };

const cents = (x) => Math.round(x * 100) / 100;
function uniform(s) { s.rng = (s.rng * 16807) % 2147483647; return s.rng / 2147483647; }
const gauss = (s) => Math.sqrt(-2 * Math.log(uniform(s))) * Math.cos(2 * Math.PI * uniform(s));
const sha = (x) => createHash("sha256").update(x).digest("hex");

const worth = (s, me) => me.cash + s.assets.reduce((n, a) => n + (me.holdings[a.id] ?? 0) * a.last, 0);
const gross = (s, me) => s.assets.reduce((n, a) => n + Math.abs(me.holdings[a.id] ?? 0) * a.last, 0);

// Everyone starts with a stake worth half its cash in each asset between them, so positions and money
// are of the same size and no one is a giant by accident.
function addAgent(s, name, persona, about, holdings = null) {
  const each = s.config.starting_cash * 0.5 / s.assets.length;
  s.agents[name] = { cash: s.config.starting_cash, holdings: holdings ?? Object.fromEntries(s.assets.map((a) => [a.id, Math.round(each / a.last)])), persona, ...(about ? { about } : {}), forced: 0, trades: 0 };
  s.agents[name].start = worth(s, s.agents[name]);
}

export function exchangeNew(args) {
  const a = exchangeNewInput.parse(args);
  if (existsSync(a.exchange_file)) throw new RangeError(`${a.exchange_file} already exists`);
  const s = createExchange(a);
  save(a.exchange_file, s);
  return { exchange_file: a.exchange_file, assets: s.assets.map((x) => ({ id: x.id, last: x.last })), personas: Object.keys(s.agents).length, shocks: s.shocks.length, plain_reading: "A new paper exchange: made-up assets and made-up money. Each agent calls exchange_join, then exchange_view and exchange_orders; exchange_step moves time and exchange_report sums it up.", limits: EXCHANGE_LIMITS_TEXT };
}

export function createExchange(a) {
  const s = {
    schema: "canli.exchange.v1", paper_only: true, seed: a.seed ?? 1, rng: (a.seed ?? 1) + 1, step: 0, next_order: 1,
    config: { starting_cash: a.starting_cash ?? 100000, maintenance_margin: a.maintenance_margin ?? 0.25, leverage: a.leverage ?? 2 },
    assets: [], books: {}, agents: {}, tokens: {}, joined: [], pending: {}, tape: [], tape_count: 0, tape_hash: sha(`canli.exchange.v1|${a.seed ?? 1}`),
    shocks: a.shocks ?? [], withdrawn_until: 0, history: [], rejected: 0,
  };
  for (let i = 0; i < (a.assets ?? 1); i += 1) {
    const value = cents(50 + 100 * uniform(s)), id = `ART${i + 1}`;
    s.assets.push({ id, value, last: value, peak: value });
    s.books[id] = { bids: [], asks: [] };
  }
  const counts = { market_maker: 8, value: 8, momentum: 6, noise: 8, deleverager: 4, stop_loss: 4, levered_long: 4, ...(a.personas ?? {}) };
  for (const kind of PERSONAS) for (let i = 0; i < (counts[kind] ?? 0); i += 1) addAgent(s, `${kind}-${i}`, kind);
  // Whoever makes a block sale holds the block from the start, so nothing appears from nowhere.
  const blocks = s.shocks.filter((x) => x.kind === "block_sale");
  if (blocks.length) {
    const held = Object.fromEntries(s.assets.map((x) => [x.id, 0]));
    for (const b of blocks) { const id = b.asset ?? s.assets[0].id; held[id] += b.quantity ?? 1000; }
    addAgent(s, "block-seller", "block_seller", null, held);
  }
  return s;
}

const tokenHash = (t) => sha(`exchange-token|${t}`);
export function exchangeJoin(args) {
  const a = exchangeJoinInput.parse(args);
  return locked(a.exchange_file, () => {
    const s = load(a.exchange_file);
    if (Object.hasOwn(s.agents, a.agent)) throw new RangeError(`${a.agent} is already in this exchange.`);
    if (s.step > 0 && s.joined.length === 0 && Object.keys(s.tokens).length === 0) { /* late joiners are allowed; they start with the same stake */ }
    addAgent(s, a.agent, "agent", a.about);
    const token = randomBytes(24).toString("hex");
    s.tokens[a.agent] = tokenHash(token);
    s.joined.push(a.agent);
    save(a.exchange_file, s);
    return { agent: a.agent, token, step: s.step, plain_reading: "Keep the token: every call you make needs it. Call exchange_view to see the market, then exchange_orders each step, an empty list to pass.", limits: EXCHANGE_LIMITS_TEXT };
  });
}
const check = (s, agent, token) => { if (s.tokens[agent] !== tokenHash(token)) throw new RangeError(`That token is not ${agent}'s.`); };

const levels = (side, depth) => {
  const out = [];
  for (const o of side) { if (out.length && out.at(-1)[0] === o.price) out.at(-1)[1] += o.quantity; else if (out.length < depth) out.push([o.price, o.quantity]); else break; }
  return out;
};

// An agent sees the public market and its own account: no other agent's positions, and no true value.
export function exchangeView(args) {
  const a = exchangeViewInput.parse(args), s = load(a.exchange_file);
  check(s, a.agent, a.token);
  const me = s.agents[a.agent], depth = a.depth ?? 5;
  const open = [];
  for (const asset of s.assets) for (const side of ["bids", "asks"]) for (const o of s.books[asset.id][side]) if (o.agent === a.agent) open.push({ order_id: o.id, asset: asset.id, side: side === "bids" ? "buy" : "sell", quantity: o.quantity, price: o.price });
  const equity = worth(s, me), pos = gross(s, me);
  return {
    step: s.step,
    market: s.assets.map((x) => ({ asset: x.id, last: x.last, bids: levels(s.books[x.id].bids, depth), asks: levels(s.books[x.id].asks, depth) })),
    recent_trades: s.tape.slice(-20).map((t) => ({ step: t.step, asset: t.asset, price: t.price, quantity: t.quantity })),
    you: { cash: cents(me.cash), holdings: me.holdings, open_orders: open, equity: cents(equity), margin: pos ? Number((equity / pos).toFixed(3)) : null, forced_sales: me.forced },
    rules: `Positions may reach ${s.config.leverage} times equity when opened. Below ${s.config.maintenance_margin} equity to gross positions, an account is sold out at market. Orders go in for the coming step.`,
    waiting_for: s.joined.filter((n) => !Object.hasOwn(s.pending, n)),
  };
}

export function exchangeOrders(args) {
  const a = exchangeOrdersInput.parse(args);
  return locked(a.exchange_file, () => {
    const s = load(a.exchange_file);
    check(s, a.agent, a.token);
    const known = new Set(s.assets.map((x) => x.id));
    for (const o of a.orders) if (o.asset && !known.has(o.asset)) throw new RangeError(`No asset ${o.asset} in this exchange.`);
    s.pending[a.agent] = a.orders;
    save(a.exchange_file, s);
    return { agent: a.agent, orders_waiting: a.orders.length, step: s.step, waiting_for: s.joined.filter((n) => !Object.hasOwn(s.pending, n)), plain_reading: `Your ${a.orders.length} orders go in at step ${s.step + 1}.` };
  });
}

// ---------------------------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------------------------
function trade(s, asset, buyer, seller, price, quantity, forced) {
  const b = s.agents[buyer], c = s.agents[seller], cost = cents(price * quantity);
  b.cash = cents(b.cash - cost); c.cash = cents(c.cash + cost);
  b.holdings[asset.id] = (b.holdings[asset.id] ?? 0) + quantity;
  c.holdings[asset.id] = (c.holdings[asset.id] ?? 0) - quantity;
  b.trades += 1; c.trades += 1;
  asset.last = price;
  asset.peak = Math.max(asset.peak, price);
  const line = { step: s.step, asset: asset.id, price, quantity, buyer, seller, ...(forced ? { forced: true } : {}) };
  s.tape_count += 1;
  s.tape_hash = sha(`${s.tape_hash}|${s.step}|${asset.id}|${price}|${quantity}|${buyer}|${seller}|${forced ? 1 : 0}`);
  s.tape.push(line);
  if (s.tape.length > 2000) s.tape.shift();
  s.now.volume[asset.id] = (s.now.volume[asset.id] ?? 0) + quantity;
  if (forced) s.now.forced_volume += quantity;
}

// Price, then time. A trade happens at the resting order's price. An order never trades with its own
// agent: the resting one goes.
function match(s, asset, side, agent, quantity, limit, forced) {
  const book = s.books[asset.id], against = side === "buy" ? book.asks : book.bids;
  let left = quantity;
  while (left > 0 && against.length) {
    const top = against[0];
    if (limit != null && (side === "buy" ? top.price > limit : top.price < limit)) break;
    if (top.agent === agent) { against.shift(); continue; }
    const q = Math.min(left, top.quantity);
    if (side === "buy") trade(s, asset, agent, top.agent, top.price, q, forced); else trade(s, asset, top.agent, agent, top.price, q, forced);
    left -= q; top.quantity -= q;
    if (top.quantity === 0) against.shift();
  }
  return left;
}
const MOST_RESTING = 2000;
function rest(s, asset, side, agent, quantity, price) {
  const list = side === "buy" ? s.books[asset.id].bids : s.books[asset.id].asks;
  // A book this deep is refused more orders, so no one can make matching slow for everyone.
  if (list.length >= MOST_RESTING) { s.rejected += 1; return null; }
  const o = { id: s.next_order, agent, quantity, price };
  s.next_order += 1;
  let i = list.length;
  while (i > 0 && (side === "buy" ? list[i - 1].price < price : list[i - 1].price > price)) i -= 1;
  list.splice(i, 0, o);
  return o;
}
function cancelAll(s, agent, assetId = null) {
  for (const a of s.assets) {
    if (assetId && a.id !== assetId) continue;
    for (const side of ["bids", "asks"]) s.books[a.id][side] = s.books[a.id][side].filter((o) => o.agent !== agent);
  }
}

// Would this order, if all of it filled, keep positions within the leverage limit? A trade that only
// shrinks a position is always allowed.
function allowed(s, agent, assetObj, side, quantity, price) {
  const me = s.agents[agent], have = me.holdings[assetObj.id] ?? 0, after = have + (side === "buy" ? quantity : -quantity);
  if (Math.abs(after) <= Math.abs(have)) return true;
  const equity = worth(s, me), others = gross(s, me) - Math.abs(have) * assetObj.last;
  return equity > 0 && (others + Math.abs(after) * (price ?? assetObj.last)) <= equity * s.config.leverage;
}

function apply(s, agent, o) {
  if (o.type === "cancel") {
    if (o.order_id) for (const a of s.assets) for (const side of ["bids", "asks"]) s.books[a.id][side] = s.books[a.id][side].filter((x) => !(x.id === o.order_id && x.agent === agent));
    else cancelAll(s, agent);
    return;
  }
  const asset = s.assets.find((x) => x.id === o.asset);
  if (!allowed(s, agent, asset, o.side, o.quantity, o.price)) { s.rejected += 1; return; }
  if (o.type === "market") { match(s, asset, o.side, agent, o.quantity, null, false); return; }
  const price = Math.max(0.01, cents(o.price)), left = match(s, asset, o.side, agent, o.quantity, price, false);
  if (left > 0) rest(s, asset, o.side, agent, left, price);
}

// Accounts below the maintenance margin are sold down until they are back above it, at market, into
// whatever is left in the book. Each sale moves the price, which can put the next account under: a
// cascade, counted in rounds.
function enforceMargin(s) {
  for (let round = 1; round <= 25; round += 1) {
    let any = false;
    for (const name of Object.keys(s.agents)) {
      const me = s.agents[name], pos = gross(s, me);
      if (!pos || worth(s, me) / pos >= s.config.maintenance_margin) continue;
      const before = pos;
      cancelAll(s, name);
      for (const asset of s.assets) {
        const have = me.holdings[asset.id] ?? 0;
        if (!have) continue;
        const q = Math.max(1, Math.ceil(Math.abs(have) / 2));
        const left = match(s, asset, have > 0 ? "sell" : "buy", name, q, null, true);
        if (left < q) { any = true; me.forced += 1; s.now.forced_accounts.add(name); }
      }
      if (gross(s, me) === before) continue;
    }
    if (!any) break;
    s.now.cascade_rounds = round;
  }
}

// ---------------------------------------------------------------------------------------------
// Personas: simple scripts, each seeing what any agent sees (the persona value also sees a noisy
// version of true worth). Their numbers are stated here because they are the assumptions.
// ---------------------------------------------------------------------------------------------
const recentReturn = (s, id, k) => { const h = s.history.slice(-k), first = h[0]?.prices?.[id]; const last = s.assets.find((a) => a.id === id).last; return first ? last / first - 1 : 0; };
function personaOrders(s, name, me) {
  const out = [];
  if (me.bust) return out;
  const withdrawn = s.step < s.withdrawn_until;
  const equity = worth(s, me);
  if (equity <= 0) { me.bust = true; return [{ type: "cancel" }]; }
  // Makers lift all their quotes once and post afresh, so quoting one asset does not cancel another's.
  if (me.persona === "market_maker") out.push({ type: "cancel" });
  for (const asset of s.assets) {
    const last = asset.last, have = me.holdings[asset.id] ?? 0, id = asset.id;
    // A size as a share of this agent's own equity, in shares, at least one.
    const shares = (part) => Math.max(1, Math.floor(equity * part / s.assets.length / last));
    if (me.persona === "market_maker") {
      // Makers step back on their own when prices are moving fast, as well as when a shock tells them to.
      const moving = Math.abs(recentReturn(s, id, 3)) > 0.03;
      if (withdrawn || moving) continue;
      const home = Math.round(equity * 0.33 / s.assets.length / last), lean = Math.max(-1, Math.min(1, (have - home) / Math.max(1, home)));
      const half = last * 0.001 * (1 + uniform(s)), mid = last * (1 - lean * 0.002), size = shares(0.01 + uniform(s) * 0.01);
      for (let level = 0; level < 3; level += 1) {
        out.push({ type: "limit", asset: id, side: "buy", quantity: size, price: Math.max(0.01, cents(mid - half * (level + 1))) });
        out.push({ type: "limit", asset: id, side: "sell", quantity: size, price: cents(mid + half * (level + 1)) });
      }
    } else if (me.persona === "value") {
      const seen = asset.value * (1 + 0.02 * gauss(s)), gap = seen / last - 1;
      if (Math.abs(gap) > 0.01) out.push({ type: "limit", asset: id, side: gap > 0 ? "buy" : "sell", quantity: shares(Math.min(0.03, Math.abs(gap) * 0.2)), price: cents(last * (1 + gap / 4)) });
    } else if (me.persona === "momentum") {
      const signal = recentReturn(s, id, 5);
      if (Math.abs(signal) > 0.005) out.push({ type: "market", asset: id, side: signal > 0 ? "buy" : "sell", quantity: shares(Math.min(0.02, Math.abs(signal) * 0.5)) });
    } else if (me.persona === "noise") {
      if (uniform(s) < 0.5) out.push({ type: uniform(s) < 0.3 ? "market" : "limit", asset: id, side: uniform(s) < 0.5 ? "buy" : "sell", quantity: shares(0.002 + uniform(s) * 0.003), price: cents(last * (1 + 0.003 * gauss(s))) });
      if (uniform(s) < 0.1) out.push({ type: "cancel" });
    } else if (me.persona === "deleverager") {
      // Keeps its risk level: sells as volatility rises, buys back when it falls.
      const h = s.history.slice(-10).map((x) => x.prices[id]).filter(Boolean);
      let vol = 0.003;
      if (h.length > 2) { const r = h.slice(1).map((p, i) => p / h[i] - 1), m = r.reduce((x, y) => x + y, 0) / r.length; vol = Math.sqrt(r.reduce((x, y) => x + (y - m) ** 2, 0) / r.length); }
      const target = Math.floor(Math.min(s.config.leverage * 0.8, 0.004 / Math.max(vol, 0.0005)) * equity / s.assets.length / last);
      const trim = target - have, most = shares(0.03);
      if (Math.abs(trim) >= most / 4) out.push({ type: "market", asset: id, side: trim > 0 ? "buy" : "sell", quantity: Math.min(most, Math.abs(trim)) });
    } else if (me.persona === "stop_loss") {
      const high = Math.max(last, ...s.history.slice(-100).map((x) => x.prices[id]).filter(Boolean));
      if (have > 0 && last < high * 0.93) out.push({ type: "market", asset: id, side: "sell", quantity: have });
      else if (have === 0 && last > high * 0.99) out.push({ type: "market", asset: id, side: "buy", quantity: shares(0.33) });
    } else if (me.persona === "levered_long") {
      // Borrows up to the limit and holds, whatever happens, until the margin rule sells it out.
      const target = Math.floor(s.config.leverage * equity * 0.97 / s.assets.length / last);
      if (target > have) out.push({ type: "market", asset: id, side: "buy", quantity: Math.min(target - have, shares(0.02)) });
    }
  }
  return out;
}

function applyShocks(s) {
  for (const x of s.shocks) {
    if (x.step !== s.step) continue;
    const asset = s.assets.find((a) => a.id === (x.asset ?? s.assets[0].id));
    if (!asset) continue;
    if (x.kind === "value") asset.value = Math.max(1, cents(asset.value * (1 + (x.percent ?? -10) / 100)));
    if (x.kind === "liquidity") { s.withdrawn_until = s.step + (x.steps ?? 10); for (const n of Object.keys(s.agents)) if (s.agents[n].persona === "market_maker") cancelAll(s, n); }
    if (x.kind === "block_sale") { const seller = s.agents["block-seller"]; const q = Math.min(x.quantity ?? 1000, seller.holdings[asset.id] ?? 0); if (q > 0) match(s, asset, "sell", "block-seller", q, null, false); }
  }
}

export function stepExchange(s) {
  s.step += 1;
  s.now = { volume: {}, forced_volume: 0, forced_accounts: new Set(), cascade_rounds: 0 };
  applyShocks(s);
  // Everyone acts on the market as it stood at the start of the step, in an order drawn from the seed.
  const plans = Object.entries(s.agents).filter(([, me]) => !["agent", "block_seller"].includes(me.persona)).map(([name, me]) => [name, personaOrders(s, name, me)]);
  for (const name of s.joined) plans.push([name, s.pending[name] ?? []]);
  for (let i = plans.length - 1; i > 0; i -= 1) { const j = Math.floor(uniform(s) * (i + 1)); [plans[i], plans[j]] = [plans[j], plans[i]]; }
  for (const [name, orders] of plans) for (const o of orders) apply(s, name, o);
  s.pending = {};
  enforceMargin(s);
  for (const a of s.assets) a.value = Math.max(1, cents(a.value * (1 + 0.002 * gauss(s))));
  s.history.push({
    step: s.step,
    prices: Object.fromEntries(s.assets.map((a) => [a.id, a.last])),
    spread: Object.fromEntries(s.assets.map((a) => { const b = s.books[a.id].bids[0], c = s.books[a.id].asks[0]; return [a.id, b && c ? cents(c.price - b.price) : null]; })),
    depth: Object.fromEntries(s.assets.map((a) => [a.id, s.books[a.id].bids.reduce((n, o) => n + o.quantity, 0) + s.books[a.id].asks.reduce((n, o) => n + o.quantity, 0)])),
    volume: s.now.volume, forced_volume: s.now.forced_volume, forced_accounts: s.now.forced_accounts.size, cascade_rounds: s.now.cascade_rounds,
  });
  if (s.history.length > 5000) s.history.shift();
  delete s.now;
}

export function exchangeStep(args) {
  const a = exchangeStepInput.parse(args);
  return locked(a.exchange_file, () => {
    const s = load(a.exchange_file);
    const missing = s.joined.filter((n) => !Object.hasOwn(s.pending, n));
    if (missing.length && !a.force) throw new RangeError(`Still waiting for ${missing.join(", ")}. Each must call exchange_orders, an empty list to pass; or pass force to close the step without them.`);
    for (let i = 0; i < (a.steps ?? 1); i += 1) stepExchange(s);
    save(a.exchange_file, s);
    const last = s.history.at(-1);
    return { step: s.step, prices: last.prices, spread: last.spread, volume: last.volume, forced_volume: last.forced_volume, tape_hash: s.tape_hash, plain_reading: `Paper step ${s.step}. ${s.joined.length ? "Joined agents act again before the next step." : ""}`.trim() };
  });
}

// ---------------------------------------------------------------------------------------------
// What happened
// ---------------------------------------------------------------------------------------------
const pct = (x) => Number((x * 100).toFixed(2));
export function report(s) {
  const assets = s.assets.map((asset) => {
    const series = s.history.map((h) => h.prices[asset.id]).filter(Boolean);
    let peak = series[0] ?? asset.last, worst = 0, troughAt = 0, peakAt = 0, peakOfWorst = 0;
    series.forEach((p, i) => { if (p > peak) { peak = p; peakAt = i; } const d = p / peak - 1; if (d < worst) { worst = d; troughAt = i; peakOfWorst = peakAt; } });
    const pre = series[peakOfWorst];
    const back = worst < 0 ? series.slice(troughAt).findIndex((p) => p >= pre * 0.95) : -1;
    const spreads = s.history.map((h) => h.spread[asset.id]).filter((x) => x != null).sort((x, y) => x - y);
    const depth = s.history.map((h) => h.depth[asset.id]);
    return {
      asset: asset.id, last: asset.last, true_value: asset.value, worst_fall_percent: pct(worst), worst_fall_from_step: s.history[peakOfWorst]?.step ?? null, worst_fall_to_step: s.history[troughAt]?.step ?? null,
      steps_to_recover_to_within_5_percent: worst < 0 ? (back >= 0 ? back : "not within this run") : null,
      median_spread: spreads[Math.floor(spreads.length / 2)] ?? null, widest_spread: spreads.at(-1) ?? null,
      thinnest_book: depth.length ? Math.min(...depth) : null, usual_book: depth.length ? [...depth].sort((x, y) => x - y)[Math.floor(depth.length / 2)] : null,
    };
  });
  const groups = {};
  for (const [name, me] of Object.entries(s.agents)) {
    const key = me.persona === "agent" ? name : me.persona;
    const g = groups[key] ??= { agents: 0, gain: 0, forced_sales: 0, trades: 0, ...(me.about ? { about: me.about } : {}) };
    g.agents += 1; g.gain += worth(s, me) - me.start; g.forced_sales += me.forced; g.trades += me.trades;
  }
  const forcedVolume = s.history.reduce((n, h) => n + h.forced_volume, 0), volume = s.history.reduce((n, h) => n + Object.values(h.volume).reduce((x, y) => x + y, 0), 0);
  return {
    steps: s.step, seed: s.seed, trades: s.tape_count, tape_hash: s.tape_hash, assets,
    who: { columns: ["who", "agents", "gain", "gain_per_agent", "forced_sales", "trades", "about"], rows: Object.entries(groups).map(([k, g]) => [k, g.agents, cents(g.gain), cents(g.gain / g.agents), g.forced_sales, g.trades, g.about ?? null]).sort((x, y) => y[3] - x[3]) },
    cascades: { forced_share_of_volume_percent: volume ? pct(forcedVolume / volume) : 0, accounts_forced_at_the_worst_step: Math.max(0, ...s.history.map((h) => h.forced_accounts)), longest_chain_in_one_step: Math.max(0, ...s.history.map((h) => h.cascade_rounds)), steps_with_forced_sales: s.history.filter((h) => h.forced_volume > 0).length },
    orders_refused_by_the_margin_rule: s.rejected,
    how_to_check: "The tape_hash chains every trade. Rerun with the same seed, personas, shocks and joined agents' orders and the hash must match.",
    limits: EXCHANGE_LIMITS_TEXT,
  };
}
export function exchangeReport(args) {
  const a = exchangeReportInput.parse(args);
  return report(load(a.exchange_file));
}

// One whole run with only scripted personas, in one call: for comparing set-ups.
export const exchangeRunInput = exchangeNewInput.omit({ exchange_file: true }).extend({ steps: z.number().int().min(1).max(20000).describe("How many steps to run.") }).strict();
// About ten seconds of work: one call cannot hold a process, or the hosted server, for long.
const MOST_WORK = 3e6, MOST_MS = 20000;
export function exchangeRun(args) {
  const { steps, ...rest } = exchangeRunInput.parse(args);
  const s = createExchange(rest);
  const work = steps * Object.keys(s.agents).length * s.assets.length;
  if (work > MOST_WORK) throw new RangeError(`That is ${work.toLocaleString("en-US")} agent-steps, and one call does at most ${MOST_WORK.toLocaleString("en-US")}. Use fewer steps, agents or assets.`);
  // Steps with deep books cost more than the count above can see, so time is watched too. A run this
  // slow fails whole: a part of a run would not match anyone's replay.
  const began = Date.now();
  for (let i = 0; i < steps; i += 1) {
    stepExchange(s);
    if (Date.now() - began > MOST_MS) throw new RangeError(`This run was still going at step ${s.step} after ${MOST_MS / 1000} seconds. Use fewer steps, agents or assets.`);
  }
  return report(s);
}
