// The sentinel: conditions a person or a model sets, watched from this machine, and a block of context
// the moment one is met. It streams where a free stream exists (Coinbase's public trades for crypto,
// Alpaca's trades for US stocks with your keys) and reads on a timer where none does (Yahoo's chart
// data, Cboe's delayed option quotes, EDGAR's feed). Every event says how it was seen and how late that
// can be.
//
// It tells; it never trades. Where an event goes (a webhook, a command, a Claude Code session) is set
// only by the person who starts it, on the command line. A rule, which a model can write, holds a
// condition and a note and nothing that can reach anything. A context block carries numbers, dates,
// form types and links and no text from outside, so a filing or a headline cannot talk to the model.
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import WebSocket from "ws";

import { asBlock, ruleInput } from "../src/sentinel.mjs";

const CRYPTO = /^[A-Z0-9]{2,10}-(USD|USDC|USDT|EUR|GBP)$/;
const COINBASE = "wss://ws-feed.exchange.coinbase.com";
const ALPACA = "wss://stream.data.alpaca.markets/v2/";
const SEEN = {
  coinbase: "Coinbase's public trade stream, live",
  alpaca: "Alpaca's trade stream, live, trades on that one feed only",
  polled: "Yahoo's chart data, read every 30 seconds; it can run late, by 15 minutes or more on some markets",
  cboe: "Cboe's delayed option quotes, read every 5 minutes; they run about 15 minutes late",
  edgar: "EDGAR's latest-filings feed, read every 60 seconds; a filing appears within a minute or two of acceptance",
};
const POLL_MS = { price: 30 * 1000, volatility: 5 * 60 * 1000, filing: 60 * 1000 };
const STALL_MS = 90 * 1000;

// A filer chooses its own name, so a name is outside text. It stays out of what a model reads, and what
// is kept for a person's logs is held to plain characters and a short length.
const plain = (v, max) => (v == null ? null : String(v).replace(/[^A-Za-z0-9 .,&'/-]/g, "").slice(0, max).trim() || null);
const secLink = (u) => (/^https:\/\/www\.sec\.gov\/[A-Za-z0-9/_.?=&-]+$/.test(String(u ?? "")) ? u : null);
const round = (x, d = 2) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(d)));
const upper = (s) => String(s).toUpperCase();
const within = (promise, ms) => Promise.race([promise, new Promise((_, no) => { const t = setTimeout(() => no(new Error("timed out")), ms); t.unref?.(); })]);
const describeRule = (r) => {
  if (r.kind === "price_move") return `${upper(r.symbol)} moves ${r.percent}% within ${r.within_minutes} minutes`;
  if (r.kind === "price_level") return `${upper(r.symbol)} goes${r.above ? ` above ${r.above}` : ""}${r.above && r.below ? " or" : ""}${r.below ? ` below ${r.below}` : ""}`;
  if (r.kind === "volatility_move") return `${upper(r.symbol)} 30-day implied volatility moves ${r.points} points within ${r.within_minutes} minutes`;
  return `a new filing${r.company ? ` by ${r.company}` : ""}${r.forms?.length ? ` on ${r.forms.join(" or ")}` : ""}${r.event ? ` about ${r.event}` : ""}`;
};

export function createSentinel({ home, call, env = process.env, now = () => Date.now(), WS = WebSocket, say = () => {} }) {
  const dir = join(home, "sentinel"), rulesFile = join(dir, "rules.json"), eventsFile = join(dir, "events.jsonl");
  const sinks = new Set();
  const state = new Map();
  const nextPoll = new Map();
  const sockets = new Set();
  let timer = null, stopped = true;

  const rules = () => { try { return JSON.parse(readFileSync(rulesFile, "utf8")).rules ?? []; } catch { return []; } };
  const save = (list) => { mkdirSync(dir, { recursive: true }); writeFileSync(rulesFile, `${JSON.stringify({ rules: list }, null, 2)}\n`); };
  const stateOf = (id) => { if (!state.has(id)) state.set(id, { window: [], seen: null, last: 0 }); return state.get(id); };

  function add(input) {
    const rule = ruleInput.parse(input);
    if (rule.kind === "price_level" && !rule.above && !rule.below) throw new Error("price_level needs above or below.");
    if (rule.kind === "filing" && !rule.company && !rule.forms?.length && !rule.event) throw new Error("A filing rule needs company, forms or event; every filing in the market is thousands a day.");
    const clean = "symbol" in rule ? { ...rule, symbol: upper(rule.symbol) } : rule;
    const { note: _note, cooldown_minutes: _cool, ...condition } = clean;
    const id = `${clean.kind}-${createHash("sha256").update(JSON.stringify(condition)).digest("hex").slice(0, 8)}`;
    const list = rules().filter((r) => r.id !== id);
    if (list.length >= 100) throw new Error("100 rules is the limit; remove one first.");
    const saved = { id, ...clean, ...(clean.note ? { note: plain(clean.note, 200) } : {}), added: new Date(now()).toISOString() };
    save([...list, saved]);
    return { added: saved, watching: `${describeRule(saved)}. Nothing is watched until the sentinel runs: canli-mcp sentinel run, or canli-mcp --channel for a Claude Code session.` };
  }
  function remove(id) {
    const list = rules();
    if (!list.some((r) => r.id === id)) throw new Error(`No rule ${id}.`);
    save(list.filter((r) => r.id !== id));
    state.delete(id);
    return { removed: id };
  }
  const list = () => ({ columns: ["id", "kind", "watching", "note"], rows: rules().map((r) => [r.id, r.kind, describeRule(r), r.note ?? null]) });
  function events({ last = 20, rule } = {}) {
    let lines = [];
    try { lines = readFileSync(eventsFile, "utf8").trim().split("\n").filter(Boolean); } catch { /* none yet */ }
    const parsed = lines.slice(-2000).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    return { events: (rule ? parsed.filter((e) => e.rule === rule) : parsed).slice(-Math.min(last, 100)) };
  }

  async function fire(rule, headline, seen, facts, context) {
    const s = stateOf(rule.id);
    const cool = (rule.cooldown_minutes ?? (rule.kind === "filing" ? 0 : 30)) * 60 * 1000;
    if (cool && s.last && now() - s.last < cool) return null;
    s.last = now();
    const event = { id: `${rule.id}-${now()}`, rule: rule.id, kind: rule.kind, at: new Date(now()).toISOString(), rule_text: describeRule(rule), ...(rule.note ? { note: rule.note } : {}), headline, seen_via: seen, facts };
    event.context = await context().catch((e) => ({ unavailable: String(e?.message ?? e).slice(0, 120) }));
    mkdirSync(dir, { recursive: true });
    appendFileSync(eventsFile, `${JSON.stringify(event)}\n`);
    for (const sink of sinks) { try { await sink(event); } catch (e) { say(`a sink failed: ${String(e?.message ?? e).slice(0, 200)}`); } }
    return event;
  }

  // Numbers and links only, each read given a few seconds; a slow source leaves its line out.
  const quiet = async (name, args, pick) => { try { return pick(await within(call(name, args), 8000)); } catch { return null; } };
  const daily = (sym, seconds) => quiet("price_history", { symbol: sym, start: new Date(now() - 120 * 86400000).toISOString().slice(0, 10), returns: true }, (r) => {
    const rets = (r.returns ?? []).slice(-60);
    if (rets.length < 20) return null;
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1));
    return { daily_volatility_percent: round(sd * 100), sessions: rets.length, ...(seconds != null && sd ? { move_in_daily_volatilities: round(Math.abs(seconds) / (sd * 100)) } : {}) };
  });
  const recentFilings = (company) => quiet("latest_filings", { company, limit: 5 }, (r) => {
    const at = (name) => r.columns?.indexOf(name) ?? -1, form = at("form"), accepted = at("accepted"), url = at("url");
    return { columns: ["form", "accepted", "url"], rows: (r.rows ?? []).slice(0, 5).map((row) => [plain(row[form], 20), plain(row[accepted], 30), secLink(row[url])]) };
  });
  const coverage = (company) => quiet("news", { company, days: 3, limit: 1, tone: true }, (r) => ({ articles_found: r.total ?? r.rows?.length ?? null, average_tone: r.tone?.average ?? null }));

  async function onPrice(sym, price, t, via) {
    const at = t ?? now();
    for (const rule of rules()) {
      if (rule.symbol !== sym) continue;
      const s = stateOf(rule.id);
      if (rule.kind === "price_level") {
        const before = s.price;
        s.price = price;
        const up = rule.above && price >= rule.above && !(before >= rule.above);
        const down = rule.below && price <= rule.below && !(before <= rule.below);
        if (up || down) await fire(rule, `${sym} at ${price}, ${up ? `at or above ${rule.above}` : `at or below ${rule.below}`}`, SEEN[via], { symbol: sym, price, time: new Date(at).toISOString() }, async () => ({ price_history: await daily(sym), ...(CRYPTO.test(sym) ? {} : { filings: await recentFilings(sym), coverage: await coverage(sym) }) }));
      } else if (rule.kind === "price_move") {
        const span = rule.within_minutes * 60 * 1000;
        s.window.push({ at, price });
        while (s.window.length && at - s.window[0].at > span) s.window.shift();
        if (s.window.length > 4000) s.window.splice(0, s.window.length - 4000);
        const high = s.window.reduce((a, b) => (b.price > a.price ? b : a)), low = s.window.reduce((a, b) => (b.price < a.price ? b : a));
        const fall = (price / high.price - 1) * 100, rise = (price / low.price - 1) * 100;
        const move = -fall >= rise ? fall : rise, from = -fall >= rise ? high : low;
        if (Math.abs(move) >= rule.percent) {
          const minutes = Math.max(1, Math.round((at - from.at) / 60000));
          const fired = await fire(rule, `${sym} ${move < 0 ? "fell" : "rose"} ${round(Math.abs(move))}% in ${minutes} minute${minutes === 1 ? "" : "s"}, from ${from.price} to ${price}`, SEEN[via], { symbol: sym, from: from.price, to: price, percent: round(move), minutes, time: new Date(at).toISOString() }, async () => ({ history: await daily(sym, move), ...(CRYPTO.test(sym) ? {} : { filings: await recentFilings(sym), coverage: await coverage(sym) }) }));
          if (fired) s.window = [{ at, price }];
        }
      }
    }
  }

  async function pollVolatility(rule) {
    const r = await within(call("volatility_surface", { symbol: rule.symbol, expirations: 8 }), 20000);
    const s = stateOf(rule.id), at = now(), iv = r.underlying?.iv30;
    if (!Number.isFinite(iv)) return;
    const span = rule.within_minutes * 60 * 1000, table = r.term_structure ?? { columns: [], rows: [] };
    s.window.push({ at, iv, rows: table.rows });
    while (s.window.length && at - s.window[0].at > span) s.window.shift();
    const far = s.window.reduce((a, b) => (Math.abs(b.iv - iv) > Math.abs(a.iv - iv) ? b : a));
    if (Math.abs(far.iv - iv) < rule.points) return;
    const minutes = Math.max(1, Math.round((at - far.at) / 60000));
    const col = (name) => table.columns.indexOf(name);
    const change = table.rows.map((row) => {
      const was = far.rows.find((x) => x[0] === row[0]);
      return [row[0], row[1], row[col("atm_iv")], was ? round(row[col("atm_iv")] - was[col("atm_iv")], 4) : null, row[col("risk_reversal")], was ? round(row[col("risk_reversal")] - was[col("risk_reversal")], 4) : null];
    });
    const fired = await fire(rule, `${rule.symbol} 30-day implied volatility ${iv > far.iv ? "rose" : "fell"} ${round(Math.abs(iv - far.iv))} points in ${minutes} minutes, from ${far.iv} to ${iv}`, SEEN.cboe, { symbol: rule.symbol, from: far.iv, to: iv, minutes, spot: r.underlying?.price ?? null, quotes_as_of: r.underlying?.as_of ?? null }, async () => ({ surface_change: { columns: ["expiration", "days", "atm_iv", "atm_iv_change", "risk_reversal", "risk_reversal_change"], rows: change }, filings: await recentFilings(rule.symbol), coverage: await coverage(rule.symbol) }));
    if (fired) s.window = [{ at, iv, rows: table.rows }];
  }

  async function pollFilings(rule) {
    const r = await within(call("latest_filings", { ...(rule.forms?.length ? { forms: rule.forms } : {}), ...(rule.company ? { company: rule.company } : {}), ...(rule.event ? { event: rule.event } : {}), limit: 100 }), 30000);
    const rows = (r.rows ?? []).map((row) => Object.fromEntries((r.columns ?? []).map((c, i) => [c, row[i]])));
    const s = stateOf(rule.id), first = s.seen === null;
    s.seen ??= new Set();
    for (const f of rows.filter((x) => x.accession && !s.seen.has(x.accession)).reverse()) {
      s.seen.add(f.accession);
      // The first read marks what is already there, so events start with what comes next.
      if (!first) {
        const form = plain(f.form, 20) ?? "a form", cik = plain(f.cik, 12), items = Array.isArray(f.items) ? f.items.filter((x) => /^\d\.\d{2}$/.test(x)) : [];
        await fire(rule, `${rule.company ? plain(rule.company, 60) : cik ? `CIK ${cik}` : "A company"} filed ${form}${items.length ? ` (items ${items.join(", ")})` : ""}`, SEEN.edgar, { form, company_as_filed: plain(f.company, 40), cik, accession: plain(f.accession, 25), accepted: plain(f.accepted, 30), items, url: secLink(f.url) }, async () => ({ filing: { form, cik, accession: plain(f.accession, 25), items, url: secLink(f.url) } }));
      }
    }
    if (s.seen.size > 5000) s.seen = new Set([...s.seen].slice(-3000));
  }

  async function pollPrice(sym) {
    const r = await within(call("latest_price", { symbol: sym }), 15000);
    if (Number.isFinite(r.price)) await onPrice(sym, r.price, now(), "polled");
  }

  const streamed = new Set();
  // One pass over whatever is due. The timer calls it; --once and the tests call it directly.
  async function pollDue() {
    const list = rules(), jobs = [];
    const due = (key, ms) => { if (now() < (nextPoll.get(key) ?? 0)) return false; nextPoll.set(key, now() + ms); return true; };
    const prices = new Set(list.filter((r) => r.kind === "price_move" || r.kind === "price_level").map((r) => r.symbol));
    for (const sym of prices) if (!streamed.has(sym) && due(`price:${sym}`, POLL_MS.price)) jobs.push(pollPrice(sym));
    for (const r of list) {
      if (r.kind === "volatility_move" && due(r.id, POLL_MS.volatility)) jobs.push(pollVolatility(r));
      if (r.kind === "filing" && due(r.id, POLL_MS.filing)) jobs.push(pollFilings(r));
    }
    for (const out of await Promise.allSettled(jobs)) if (out.status === "rejected") say(`a read failed: ${String(out.reason?.message ?? out.reason).slice(0, 200)}`);
  }

  // A stream that closes or goes quiet is opened again, waiting a little longer each time.
  function stream(name, url, onOpen, onMessage) {
    let wait = 1000, socket = null, watch = null;
    const open = () => {
      if (stopped) return;
      socket = new WS(url);
      sockets.add(socket);
      let last = now();
      socket.on("open", () => { wait = 1000; onOpen(socket); });
      socket.on("message", (data) => { last = now(); try { onMessage(JSON.parse(String(data)), socket); } catch (e) { say(`${name}: ${String(e?.message ?? e).slice(0, 200)}`); } });
      socket.on("error", (e) => say(`${name}: ${String(e?.message ?? e).slice(0, 200)}`));
      socket.on("close", () => {
        sockets.delete(socket);
        clearInterval(watch);
        if (!stopped) { const t = setTimeout(open, wait); t.unref?.(); wait = Math.min(wait * 2, 60000); }
      });
      clearInterval(watch);
      watch = setInterval(() => { if (now() - last > STALL_MS) socket.terminate?.(); }, 15000);
      watch.unref?.();
    };
    open();
  }

  function startStreams() {
    const symbols = [...new Set(rules().filter((r) => r.kind === "price_move" || r.kind === "price_level").map((r) => r.symbol))];
    const crypto = symbols.filter((s) => CRYPTO.test(s));
    if (crypto.length) {
      for (const s of crypto) streamed.add(s);
      stream("coinbase", COINBASE, (ws) => ws.send(JSON.stringify({ type: "subscribe", product_ids: crypto, channels: ["ticker"] })), (m) => {
        if (m.type === "ticker" && Number.isFinite(Number(m.price))) onPrice(m.product_id, Number(m.price), Date.parse(m.time) || now(), "coinbase").catch((e) => say(String(e?.message ?? e)));
      });
    }
    const key = env.ALPACA_API_KEY_ID ?? env.APCA_API_KEY_ID ?? env.ALPACA_PAPER_KEY_ID, secret = env.ALPACA_API_SECRET_KEY ?? env.APCA_API_SECRET_KEY ?? env.ALPACA_PAPER_SECRET_KEY;
    const stocks = symbols.filter((s) => !CRYPTO.test(s) && /^[A-Z.]{1,10}$/.test(s));
    if (key && secret && stocks.length) {
      for (const s of stocks) streamed.add(s);
      stream("alpaca", `${ALPACA}${env.ALPACA_DATA_FEED ?? "iex"}`, (ws) => ws.send(JSON.stringify({ action: "auth", key, secret })), (m, ws) => {
        for (const x of Array.isArray(m) ? m : [m]) {
          if (x.T === "success" && x.msg === "authenticated") ws.send(JSON.stringify({ action: "subscribe", trades: stocks }));
          if (x.T === "t") onPrice(x.S, Number(x.p), Date.parse(x.t) || now(), "alpaca").catch((e) => say(String(e?.message ?? e)));
        }
      });
    }
  }

  function start() {
    if (!stopped) return;
    stopped = false;
    startStreams();
    const beat = () => pollDue().catch((e) => say(String(e?.message ?? e)));
    beat();
    timer = setInterval(beat, 5000);
    timer.unref?.();
  }
  function stop() {
    stopped = true;
    clearInterval(timer);
    for (const s of sockets) { try { s.close(); } catch { /* going anyway */ } }
    sockets.clear();
  }

  return { add, remove, list, events, start, stop, pollDue, onPrice, sinks, rules, exists: () => existsSync(rulesFile) };
}

// Where events go. Each is chosen on the command line by the person running it, never by a rule.
export function webhookSink(url, fetchImpl = fetch) {
  return async (event) => {
    const r = await fetchImpl(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...event, block: asBlock(event) }), signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`webhook answered ${r.status}`);
  };
}
