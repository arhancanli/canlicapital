// The packs: each published Canli server, loaded in this process on first use. A pack's loader
// returns its tools as { name, pack, title, description, keywords, input (zod), annotations, run }.
// Nothing here runs at startup; the server searches a prebuilt index (index.json) until a tool is
// described or run.
import { homedir } from "node:os";
import { join } from "node:path";

import { z } from "zod";

// What each pack sends off this machine and keeps on disk. Stated in canli://privacy and checked
// by test/privacy.test.mjs (offline packs must run with the network disabled).
export const PACKS = Object.freeze({
  quant: { title: "Quant finance (235 tools, 399 strategy sleeves)", package: "canli-quant-mcp", network: "none", disk: "none", offline: true },
  validation: { title: "Backtest validation (deflated Sharpe, PBO, Reality Check, leakage, placebos)", package: "canli-validation-mcp", network: "none: runs in private local mode", disk: "reads a returns file only when you pass its path", offline: true },
  fundamentals: { title: "SEC fundamentals point in time", package: "canli-fundamentals-mcp", network: "downloads public SEC company data from canlicapital.com (sends the company and measure asked for, never your data)", disk: "caches that public data in ~/.cache/canli-fundamentals (CANLI_CACHE_DIR=\"\" keeps nothing)", offline: false },
  research: { title: "Canli Capital's open research record", package: "canli-research-mcp", network: "downloads public research pages from canlicapital.com (sends the search words)", disk: "none", offline: false },
  backtest: { title: "Point-in-time factor backtests on your prices", package: "canli-backtest-mcp", network: "public SEC data as the fundamentals pack; your prices and signals stay local", disk: "your trial ledgers in ~/.canli/ledgers and outputs where you ask", offline: false },
  markets: { title: "Market data from the sources: SEC filings, insider trades, 13F holdings, Treasury yields, FRED, prices", package: "canli-markets-mcp", network: "SEC EDGAR, the US Treasury and FRED directly (sends the company, form, dates or series asked for); prices from Yahoo Finance's public chart data, or Alpaca or Tiingo with your key", disk: "none", offline: false },
  paper: { title: "Alpaca paper trading behind pre-trade checks", package: "canli-paper-trading-mcp", network: "Alpaca's paper API only (paper-api.alpaca.markets, data.alpaca.markets) with your paper keys", disk: "a hash-chained order log in CANLI_HOME (default ~/.canli)", offline: false },
});

// Tools renamed in the combined catalog because two packs use the same name.
export const RENAMES = Object.freeze({ validation: { stress_test: "strategy_stress_test" } });
// Tools left out of the combined catalog, with the reason.
export const OMITTED = Object.freeze({
  validation: {
    get_key: "the combined server runs validation locally, so no key is needed",
    service_status: "reports the hosted endpoint, which local mode does not use",
  },
});

const isSchema = (s) => s && typeof s.safeParse === "function";

// Captures registerTool calls from a published server's own registration code.
function capture() {
  const tools = [];
  const noop = () => ({});
  return { tools, server: { registerTool: (name, config, handler) => { tools.push({ name, config, handler }); return {}; }, registerPrompt: noop, registerResource: noop, tool: noop, prompt: noop, resource: noop } };
}

function fromRegistered(pack, captured, keywords = {}) {
  const rename = RENAMES[pack] ?? {}, omit = OMITTED[pack] ?? {};
  return captured.filter((t) => !omit[t.name]).map(({ name, config, handler }) => {
    const input = isSchema(config.inputSchema) ? config.inputSchema : z.object(config.inputSchema ?? {});
    return {
      name: rename[name] ?? name, original: name, pack, title: config.title ?? name, description: config.description ?? "", keywords: keywords[name] ?? "", input, annotations: config.annotations ?? {},
      async run(args) {
        const r = await handler(args, {});
        const text = r?.content?.find?.((c) => c.type === "text")?.text;
        if (r?.isError) throw new Error(text ?? `${name} failed`);
        if (r?.structuredContent) return r.structuredContent;
        try { return JSON.parse(text); } catch { return { text }; }
      },
    };
  });
}

const LOADERS = {
  async quant() {
    const { CATALOG, runTool } = await import("canli-quant-mcp/src/registry.mjs");
    return CATALOG.map((t) => ({ name: t.name, original: t.name, pack: "quant", toolset: t.toolset, title: t.title, description: t.description, keywords: t.keywords ?? "", input: t.input, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }, run: async (args, opts) => runTool(t.name, args, opts) }));
  },
  async validation() {
    const v = await import("canli-validation-mcp/src/server.mjs");
    const session = v.createSession({ local: true, toolsets: v.DEFAULT_TOOLSETS });
    const c = capture(); v.registerTools(c.server, session);
    return fromRegistered("validation", c.tools);
  },
  async fundamentals() {
    const f = await import("canli-fundamentals-mcp/src/server.mjs");
    const c = capture(); f.registerTools(c.server, f.createSession());
    return fromRegistered("fundamentals", c.tools);
  },
  async research() {
    const r = await import("canli-research-mcp/src/server.mjs");
    const c = capture(); r.registerTools(c.server, r.createSession());
    return fromRegistered("research", c.tools);
  },
  async backtest() {
    const b = await import("canli-backtest-mcp/src/server.mjs");
    const c = capture(); b.registerTools(c.server, b.createSession());
    return fromRegistered("backtest", c.tools);
  },
  async markets() {
    const m = await import("canli-markets-mcp/src/server.mjs");
    const { createSession } = await import("canli-markets-mcp/src/sources.mjs");
    const c = capture(); m.registerTools(c.server, createSession());
    return fromRegistered("markets", c.tools, m.TOOL_KEYWORDS);
  },
  async paper() {
    const { registerAll } = await import("canli-paper-trading-mcp/src/server.mjs");
    const { createBroker } = await import("canli-paper-trading-mcp/src/broker.mjs");
    const c = capture(); registerAll(c.server, { broker: createBroker({ home: process.env.CANLI_HOME ?? join(homedir(), ".canli") }) });
    return fromRegistered("paper", c.tools);
  },
};

const loaded = new Map();
export function loadPack(name) {
  if (!LOADERS[name]) throw new Error(`No pack ${name}.`);
  if (!loaded.has(name)) loaded.set(name, LOADERS[name]().then((tools) => new Map(tools.map((t) => [t.name, t]))));
  return loaded.get(name);
}
export const loadedPacks = () => [...loaded.keys()];

// Which packs this process offers. CANLI_PACKS lists them (or "all"); CANLI_OFFLINE=1 keeps only
// the packs that never touch the network; paper is on only with Alpaca paper keys (or when listed).
export function enabledPacks(env = process.env) {
  const all = Object.keys(PACKS);
  let names;
  const raw = String(env.CANLI_PACKS ?? "").trim().toLowerCase();
  if (raw === "all") names = all;
  else if (raw) {
    names = raw.split(",").map((s) => s.trim()).filter(Boolean);
    for (const n of names) if (!PACKS[n]) throw new Error(`CANLI_PACKS: no pack ${n}; packs are ${all.join(", ")}, all`);
  } else names = all.filter((n) => n !== "paper" || Boolean(env.ALPACA_PAPER_KEY_ID));
  if (/^(1|true|yes)$/i.test(String(env.CANLI_OFFLINE ?? ""))) names = names.filter((n) => PACKS[n].offline);
  return names;
}
