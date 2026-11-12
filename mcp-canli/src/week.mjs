// A week across what someone holds, in plain words: how each one moved, what it filed, when it next reports.
// For someone who wants to look once a week and be done. It says what happened and stops there.
import { z } from "zod";

export const weekInput = z.object({
  holdings: z.array(z.string().min(1).max(20)).min(1).max(25).describe("Tickers, such as VOO, AAPL and NVDA."),
  days: z.number().int().min(1).max(31).optional().describe("How far back; default 7."),
}).strict();

export const WEEK_TOOL = Object.freeze({
  name: "my_week", pack: "desk", toolset: "desk", title: "This week across what you hold", input: weekInput, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  description: "One plain summary across up to 25 holdings: how each moved over the week, what it told the SEC about, and when it is expected to report next. What happened, with no view on what to do.",
  keywords: "my portfolio this week what happened to my stocks holdings summary digest catch up weekly family plain words",
  args: "holdings: string[], days?: integer",
});

const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const EVENT_WORDS = { earnings: "its results", regulation_fd: "news for investors", other_event: "other news", material_agreement: "a major agreement", new_debt: "new debt", officer_change: "a change of officers", acquisition_or_sale: "a purchase or sale" };

async function oneHolding(ctx, symbol, days, now) {
  const since = dayOf(now - days * 86400000);
  const quiet = (name, args) => Promise.race([ctx.call(name, args), new Promise((_, no) => { const t = setTimeout(() => no(new Error("too slow")), 20000); t.unref?.(); })]).catch(() => null);
  const [prices, events, calendar] = await Promise.all([
    quiet("price_history", { symbol, start: dayOf(now - (days + 7) * 86400000) }),
    quiet("company_events", { company: symbol, since }),
    quiet("earnings_calendar", { company: symbol }),
  ]);
  const dates = prices?.dates ?? [], close = prices?.close ?? [];
  let change = null, from = null, to = null;
  if (close.length > 1) {
    let start = dates.findIndex((d) => d >= since);
    if (start <= 0) start = 1;
    from = close[start - 1]; to = close.at(-1);
    change = Math.round((to / from - 1) * 10000) / 100;
  }
  // company_events reads 8-Ks: what each said it was about.
  const cols = events?.columns ?? [], eventsAt = cols.indexOf("events"), filedAt = cols.indexOf("filed");
  const happened = (events?.rows ?? []).slice(0, 8).flatMap((r) => (r[eventsAt] ?? []).map((e) => ({ what: EVENT_WORDS[e] ?? String(e).replace(/_/g, " "), filed: r[filedAt] })));
  const told = [...new Set(happened.map((h) => h.what))];
  const next = calendar?.next?.status === "upcoming" ? calendar.next.expected ?? null : null;
  const parts = [];
  if (change !== null) parts.push(`${change >= 0 ? "up" : "down"} ${Math.abs(change)}%`);
  else parts.push("no price to hand");
  if (told.length) parts.push(`told the SEC about ${told.join(", ")}`);
  if (next) parts.push(`expected to report around ${next}`);
  return { symbol, change_percent: change, close: to, events: told, next_report_expected: next, in_words: `${symbol}: ${parts.join("; ")}.` };
}

export async function runWeek(ctx, args, { now = Date.now() } = {}) {
  const a = weekInput.parse(args);
  const days = a.days ?? 7;
  const each = await Promise.all(a.holdings.map((s) => oneHolding(ctx, s.toUpperCase(), days, now)));
  const moved = each.filter((x) => x.change_percent !== null).sort((x, y) => Math.abs(y.change_percent) - Math.abs(x.change_percent));
  return {
    days,
    summary: each.map((x) => x.in_words),
    biggest_move: moved[0] ? { symbol: moved[0].symbol, change_percent: moved[0].change_percent } : null,
    columns: ["symbol", "change_percent", "close", "told_the_sec_about", "next_report_expected"],
    rows: each.map((x) => [x.symbol, x.change_percent, x.close, x.events, x.next_report_expected]),
    limits: ["What happened, with no view on what to do. Prices can run late. Funds file little, so most of what moves them is in what they hold: portfolio_xray opens them."],
  };
}
