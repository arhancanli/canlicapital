// `canli-mcp upstream add|list|remove`: the other MCP servers this one connects to, kept in
// CANLI_HOME/upstreams.json, readable only by its owner. Keys go in as ${NAME} and are read from the
// environment when canli-mcp starts, so the file need hold no secret.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { UPSTREAM_NAME, readUpstreams, whereIs } from "../src/upstreams.mjs";

const fileOf = (home) => join(home, "upstreams.json");
const saved = (home) => { try { return JSON.parse(readFileSync(fileOf(home), "utf8")); } catch { return {}; } };
const save = (home, all) => {
  mkdirSync(home, { recursive: true, mode: 0o700 });
  writeFileSync(fileOf(home), `${JSON.stringify(all, null, 1)}\n`, { mode: 0o600 });
};
// A header or variable written out in full rather than as ${NAME}, when it looks like a key.
const looksLikeKey = (v) => !/\$\{[A-Za-z_][A-Za-z0-9_]*\}/.test(v) && /[A-Za-z0-9_\-]{20,}/.test(v);

// Vendors' own MCP servers, by name, so `canli-mcp upstream add <name>` needs nothing more than the key. The
// addresses and how each takes its key are from the vendors' docs, read on 2026-11-04; the keyless ones were
// also connected that day, through this gateway. A vendor that signs in only by OAuth in a browser (Finnhub,
// Twelve Data, EODHD's hosted server, DefiLlama) is not here: add it in your MCP client directly.
export const PRESETS = Object.freeze({
  coingecko: { url: "https://mcp.api.coingecko.com/mcp", about: "CoinGecko: coin prices, markets and on-chain data (keyless)" },
  coinpaprika: { url: "https://mcp.coinpaprika.com/streamable-http", about: "CoinPaprika: coins, exchanges, events (keyless free tier)" },
  dexpaprika: { url: "https://mcp.dexpaprika.com/streamable-http", about: "DexPaprika: DEX pools, tokens and trades (keyless)" },
  cryptocom: { url: "https://mcp.crypto.com/market-data/mcp", about: "Crypto.com Exchange: instruments, books, trades, candles (keyless)" },
  etherscan: { url: "https://mcp-keyless.etherscan.io/mcp", about: "Etherscan: balances, transactions, contracts across EVM chains (keyless)" },
  blockscout: { url: "https://mcp.blockscout.com/mcp", about: "Blockscout: blocks, addresses, tokens on many chains (keyless)" },
  kalshi: { url: "https://api.elections.kalshi.com/mcp", about: "Kalshi: prediction markets' events and odds (keyless for public data)" },
  gate: { url: "https://api.gatemcp.ai/mcp", about: "Gate: public spot and futures market data (keyless)" },
  fmp: { url: "https://financialmodelingprep.com/mcp?apikey=${FMP_API_KEY}", about: "Financial Modeling Prep: statements, estimates, transcripts, calendars" },
  alphavantage: { url: "https://mcp.alphavantage.co/mcp?apikey=${ALPHAVANTAGE_API_KEY}", about: "Alpha Vantage: prices, fundamentals, indicators, news sentiment, transcripts" },
  financialdatasets: { url: "https://mcp.financialdatasets.ai/api", headers: { "X-API-KEY": "${FINANCIAL_DATASETS_API_KEY}" }, about: "Financial Datasets: statements, prices, filings, insider trades" },
  unusualwhales: { url: "https://api.unusualwhales.com/api/mcp", headers: { Authorization: "Bearer ${UW_API_KEY}" }, about: "Unusual Whales: options flow, dark pool, congress trades (paid)" },
  quiver: { url: "https://mcp.quiverquant.com/", headers: { Authorization: "Bearer ${QUIVER_API_KEY}" }, about: "Quiver Quantitative: congress, lobbying, government contracts, alternative data (paid)" },
  valuein: { url: "https://mcp.valuein.biz/mcp", headers: { Authorization: "Bearer ${VALUEIN_TOKEN}" }, about: "Valuein: SEC EDGAR fundamentals" },
  coinmarketcap: { url: "https://mcp.coinmarketcap.com/mcp", headers: { "X-CMC-MCP-API-KEY": "${CMC_API_KEY}" }, about: "CoinMarketCap: listings, quotes, global metrics" },
  dune: { url: "https://api.dune.com/mcp/v1", headers: { "x-dune-api-key": "${DUNE_API_KEY}" }, about: "Dune: on-chain SQL queries and dashboards" },
});
const needs = (entry) => [...new Set(JSON.stringify(entry).match(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g) ?? [])].map((v) => v.slice(2, -1));

export const USAGE = `usage:
  canli-mcp upstream add <preset> [--tools a,b*] [--write]     (canli-mcp upstream presets lists them)
  canli-mcp upstream add <name> <url> [--header "Name: value"]... [--tools a,b*] [--write]
  canli-mcp upstream add <name> -- <command> [args...]   (with --env NAME=value before the --)
  canli-mcp upstream list
  canli-mcp upstream remove <name>
Write keys as \${NAME}: canli-mcp reads them from its environment when it starts.`;

export function upstreamCommand(home, argv) {
  const [verb, name, ...rest] = argv;
  if (verb === "presets") {
    return { presets: Object.entries(PRESETS).map(([id, p]) => ({ name: id, about: p.about, needs: needs(p) })), how: "canli-mcp upstream add <name>, then set the variables it needs in canli-mcp's environment (your MCP client's env for it) and restart." };
  }
  if (verb === "list") {
    const all = readUpstreams({}, home);
    return { file: fileOf(home), servers: all.map((u) => ({ name: u.name, where: whereIs(u), ...(u.tools ? { tools: u.tools } : {}), write: Boolean(u.write) })) };
  }
  if (verb === "remove") {
    const all = saved(home);
    if (!all[name]) throw new Error(`No upstream named ${name}.`);
    delete all[name];
    save(home, all);
    return { removed: name, file: fileOf(home) };
  }
  if (verb !== "add" || !name) throw new Error(USAGE);
  if (!UPSTREAM_NAME.test(name)) throw new Error(`The name "${name}" must be 2-24 lowercase letters; it becomes the pack's name.`);
  const dash = rest.indexOf("--");
  const opts = dash >= 0 ? rest.slice(0, dash) : rest, command = dash >= 0 ? rest.slice(dash + 1) : [];
  const entry = {}, warnings = [];
  for (let i = 0; i < opts.length; i += 1) {
    const o = opts[i];
    if (o === "--write") entry.write = true;
    else if (o === "--tools") entry.tools = String(opts[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (o === "--header") {
      const h = String(opts[++i] ?? ""), at = h.indexOf(":");
      if (at < 1) throw new Error(`--header takes "Name: value", not "${h}".`);
      (entry.headers ??= {})[h.slice(0, at).trim()] = h.slice(at + 1).trim();
    } else if (o === "--env") {
      const kv = String(opts[++i] ?? ""), at = kv.indexOf("=");
      if (at < 1) throw new Error(`--env takes NAME=value, not "${kv}".`);
      (entry.env ??= {})[kv.slice(0, at)] = kv.slice(at + 1);
    } else if (!entry.url && /^https?:\/\//.test(o)) entry.url = o;
    else throw new Error(`${o}?\n${USAGE}`);
  }
  if (command.length) { entry.command = command[0]; if (command.length > 1) entry.args = command.slice(1); }
  // A known vendor's name with no address of its own is that vendor's server.
  const preset = !entry.url && !entry.command && PRESETS[name];
  if (preset) { const { about, ...where } = preset; Object.assign(entry, JSON.parse(JSON.stringify(where))); }
  if (!entry.url && !entry.command) throw new Error(`${name} is not a preset (${Object.keys(PRESETS).join(", ")}): give its url, or -- and its command.\n${USAGE}`);
  for (const [k, v] of [...Object.entries(entry.headers ?? {}), ...Object.entries(entry.env ?? {}), ["url", entry.url ?? ""]]) {
    if (looksLikeKey(v)) warnings.push(`${k} is written out in full in ${fileOf(home)}; write it as \${NAME} to keep it in your environment instead.`);
  }
  const all = { ...saved(home), [name]: entry };
  readUpstreams({ CANLI_UPSTREAMS: JSON.stringify(all) });
  save(home, all);
  const vars = needs(entry);
  return { added: name, where: whereIs(entry), file: fileOf(home), ...(vars.length ? { set_first: vars } : {}), next: `${vars.length ? `Set ${vars.join(" and ")} in canli-mcp's environment, then restart` : "Restart"} canli-mcp (your MCP client restarts it): the server's tools then join find_tool and run_tool.`, ...(warnings.length ? { warnings } : {}) };
}
