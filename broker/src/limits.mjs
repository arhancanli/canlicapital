// The caps a person writes for their own live trading. Live orders are refused without this file, and
// nothing in an order file or from a model can change it: it is read from the person's own folder.
import { existsSync, readFileSync } from "node:fs";

import { money, Refused } from "./util.mjs";

export function loadLimits(file) {
  if (!existsSync(file)) throw new Refused(`Live orders need your limits file at ${file}. See the README: it states the most you allow, and turning live on is written there by you.`);
  let l;
  try { l = JSON.parse(readFileSync(file, "utf8")); } catch { throw new Refused(`${file} is not JSON.`); }
  if (l?.live_enabled !== true) throw new Refused(`${file} does not have "live_enabled": true.`);
  for (const k of ["max_order_usd", "max_day_usd"]) if (!(typeof l[k] === "number" && l[k] > 0)) throw new Refused(`${file} needs ${k} as a positive number.`);
  if (!(l.allowed_symbols === "any" || (Array.isArray(l.allowed_symbols) && l.allowed_symbols.length))) throw new Refused(`${file} needs allowed_symbols: a list of symbols, or "any".`);
  return l;
}

// Every reason a set of priced orders breaks the limits; all of them, so a person can fix them at once.
export function checkLimits(priced, limits, spentToday) {
  const problems = [];
  let total = 0;
  for (const p of priced) {
    const label = `${p.order.side} ${p.order.symbol}`;
    if (limits.allowed_symbols !== "any" && !limits.allowed_symbols.includes(p.order.symbol)) problems.push(`${label}: ${p.order.symbol} is not in allowed_symbols.`);
    if (p.value_usd === null) { problems.push(`${label}: no price could be read, so its size cannot be checked.`); continue; }
    if (p.value_usd > limits.max_order_usd) problems.push(`${label}: ${money(p.value_usd)} is over max_order_usd of ${money(limits.max_order_usd)}.`);
    total += p.value_usd;
  }
  if (spentToday + total > limits.max_day_usd) problems.push(`These come to ${money(total)}, and with ${money(spentToday)} already sent today that is over max_day_usd of ${money(limits.max_day_usd)}.`);
  return problems;
}
