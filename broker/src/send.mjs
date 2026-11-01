// One order file through one broker: every check first and all of them on the whole file, then a
// person's confirmation, then the orders one at a time. It stops at the first failure and says exactly
// what went out. Nothing here runs unless a person ran the command: this is not an MCP tool, on purpose.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { alpaca } from "./adapters/alpaca.mjs";
import { coinbase } from "./adapters/coinbase.mjs";
import { ibkr } from "./adapters/ibkr.mjs";
import { tradier } from "./adapters/tradier.mjs";
import { readIntent } from "./intent.mjs";
import { openJournal } from "./journal.mjs";
import { checkLimits, loadLimits } from "./limits.mjs";
import { clean, money, Refused } from "./util.mjs";

export const BROKERS = Object.freeze({ alpaca, tradier, ibkr, coinbase });
export const STOP_FILE = "BROKER_STOP";

const clientIdOf = (hash, index) => `canli-${hash.slice(0, 16)}-${index}`;
const stopped = (home) => existsSync(join(home, STOP_FILE));

export async function run({ command, file, broker: brokerName, live = false, limitsFile, yes = false, unknownNotPlaced = false, env, home, http, ask, print, now = () => new Date() }) {
  const mode = live ? "live" : "paper";
  if (!Object.hasOwn(BROKERS, brokerName ?? "")) throw new Refused(`Choose a broker with --broker: ${Object.keys(BROKERS).join(", ")}.`);
  if (stopped(home)) throw new Refused(`${join(home, STOP_FILE)} exists, so nothing is sent. Delete that file yourself to start again.`);
  if (live && yes) throw new Refused("--yes works only for paper. Live orders are always confirmed by typing.");
  const adapter = BROKERS[brokerName];
  const { intent, hash } = readIntent(readFileSync(file, "utf8"));
  const cfg = await adapter.setup(mode, env, http);

  // Whether every order can go through this broker as written. All or none.
  const notPossible = intent.orders.map((o, i) => [i, adapter.cannot(o)]).filter(([, why]) => why);
  if (notPossible.length) throw new Refused(notPossible.map(([i, why]) => `Order ${i + 1} (${intent.orders[i].symbol}): ${why}`).join("\n"));

  const priced = [];
  for (const order of intent.orders) {
    const last = order.type === "limit" ? order.limit_price : await adapter.price(cfg, http, order);
    priced.push({ order, price: last ?? null, value_usd: order.notional_usd ?? (last ? order.quantity * last : null) });
  }

  // No short selling: a sell must be covered by what the account holds, and an unknown holding is a refusal when live.
  const problems = [];
  for (const { order } of priced) {
    if (order.side !== "sell") continue;
    if (order.quantity === undefined) { if (live) problems.push(`sell ${order.symbol}: sells must give a quantity when live, so it can be checked against what you hold.`); continue; }
    const held = await adapter.position(cfg, http, order.symbol);
    if (held === null) { if (live) problems.push(`sell ${order.symbol}: what you hold could not be read.`); continue; }
    if (order.quantity > held) problems.push(`sell ${order.symbol}: selling ${order.quantity} and you hold ${held}. Short selling is refused.`);
  }

  const journal = openJournal(home), day = now().toISOString().slice(0, 10);
  if (live) problems.push(...checkLimits(priced, loadLimits(limitsFile ?? join(home, "broker-limits.json")), journal.spentOn(day, mode)));
  const standing = journal.state(hash, brokerName, mode);

  print(`\n${mode === "live" ? "LIVE" : "Paper"} orders on ${brokerName}${brokerName === "coinbase" && !live ? " (preview only: Coinbase has no paper account)" : ""}:`);
  for (const [i, p] of priced.entries()) {
    const o = p.order, size = o.quantity !== undefined ? `${o.quantity}` : money(o.notional_usd), price = o.type === "limit" ? `limit ${o.limit_price}` : `market, last ${p.price ?? "unknown"}`;
    print(`  ${i + 1}. ${o.side.toUpperCase()} ${size} ${o.symbol}, ${price}, ${o.time_in_force}, about ${money(p.value_usd)}${standing.get(i) === "sent" ? " [already sent]" : ""}`);
  }
  const total = priced.reduce((n, p) => n + (p.value_usd ?? 0), 0);
  print(`  Total about ${money(total)}.`);
  print(`  The file's stated reason, which nobody has checked: ${intent.reason || "none given"}`);
  if (problems.length) throw new Refused(`Nothing was sent:\n  ${problems.join("\n  ")}`);
  if (command === "check") { print("\nChecked. Nothing was sent."); return { sent: 0 }; }

  const waiting = priced.map((p, i) => [p, i]).filter(([, i]) => standing.get(i) !== "sent");
  if (!waiting.length) { print("\nEvery order in this file was already sent. Nothing to do."); return { sent: 0 }; }
  const unknown = waiting.filter(([, i]) => standing.get(i) === "unknown").map(([, i]) => i + 1);
  if (unknown.length && !unknownNotPlaced) throw new Refused(`An earlier run started order ${unknown.join(", ")} and never heard back. Look in your ${brokerName} account. If the order is not there, run again with --unknown-not-placed.`);

  // A person, at a terminal. Live needs a phrase tied to this exact file, so an old answer cannot fit a new one.
  if (live) {
    const phrase = `SEND ${waiting.length} LIVE ${hash.slice(0, 4).toUpperCase()}`;
    if (!await ask(`\nThese are real orders with real money. To send them, type exactly: ${phrase}\n> `, phrase)) throw new Refused("Not confirmed. Nothing was sent.");
  } else if (!yes && !await ask("\nSend these paper orders? Type yes: ", "yes")) throw new Refused("Not confirmed. Nothing was sent.");

  const results = [];
  for (const [p, i] of waiting) {
    if (stopped(home)) throw new Refused(`${STOP_FILE} appeared, so this stopped after ${results.length} ${results.length === 1 ? "order" : "orders"}.`);
    const base = { at: now().toISOString(), broker: brokerName, mode, intent: hash, index: i, symbol: p.order.symbol, side: p.order.side, value_usd: p.value_usd };
    journal.add({ ...base, event: "sending" });
    try {
      const r = await adapter.place(cfg, http, p.order, clientIdOf(hash, i), { ask });
      journal.add({ ...base, event: "sent", order_id: r.id, status: clean(r.status, 120) });
      print(`  ${i + 1}. ${p.order.symbol}: ${clean(r.status, 120)}${r.id ? `, order ${clean(r.id, 60)}` : ""}${r.already ? " (it was already there)" : ""}`);
      results.push(r);
    } catch (err) {
      // A definite refusal is a failure; anything else may have reached the broker and stays unknown.
      if (err instanceof Refused || /\bsaid (?:4\d\d|200)\b|rejected/.test(err.message)) journal.add({ ...base, event: "failed", why: clean(err.message, 300) });
      throw new Refused(`Order ${i + 1} (${p.order.symbol}) did not go through: ${clean(err.message, 400)}\n${results.length} sent before it. Nothing after it was sent.`);
    }
  }
  print(`\n${results.length} ${results.length === 1 ? "order" : "orders"} handed to ${brokerName}. Check them there: being accepted is not being filled.`);
  return { sent: results.length };
}
