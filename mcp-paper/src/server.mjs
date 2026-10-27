#!/usr/bin/env node
// canli-paper-trading-mcp: sends orders to an Alpaca paper account only after a pre-trade check and
// a confirmation token (src/broker.mjs). Paper only; no live host exists in this package.
import { readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";

import { verifyAttestation } from "./attest.mjs";
import { createBroker } from "./broker.mjs";

export const SERVER_NAME = "canli-paper-trading-mcp";
export const SERVER_VERSION = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
export const SERVER_INFO = Object.freeze({
  name: SERVER_NAME, version: SERVER_VERSION, title: "Canli Paper Trading", websiteUrl: "https://canlicapital.com/developers",
  icons: [{ src: "https://canlicapital.com/icon-512.png", mimeType: "image/png", sizes: ["512x512"] }, { src: "https://canlicapital.com/favicon.svg", mimeType: "image/svg+xml", sizes: ["any"] }],
});
export const SERVER_INSTRUCTIONS = "Alpaca paper trading only. Every check and send returns a signed attestation (verify_attestation checks one); with CANLI_PAPER_PRIVATE=1 the account's figures are committed, never shown. Preview first: preview_paper_orders or rebalance_to_weights run pre-trade checks (your limits file, market clock, kill switch) and return a five-minute token only when every order passes; send_paper_orders needs that token. Never live money.";

const order = z.object({
  symbol: z.string().regex(/^[A-Z][A-Z0-9.]{0,9}$/, "a US equity ticker, e.g. AAPL").describe("Ticker, e.g. AAPL."),
  side: z.enum(["buy", "sell"]).describe("buy or sell."),
  qty: z.number().positive().max(1e7).describe("Shares."),
  type: z.enum(["market", "limit"]).optional().describe("Default market."),
  limit_price: z.number().positive().optional().describe("Required for limit orders."),
  tif: z.enum(["day", "gtc", "ioc"]).optional().describe("Time in force; default day."),
}).strict();
const fees = z.object({ commission_bps: z.number().min(0).optional().describe("Commission in bp."), per_share_usd: z.number().min(0).optional().describe("Per-share fee."), as_of: z.string().max(40).describe("Date you read the schedule.") }).strict().optional().describe("Your fee schedule, if any (Alpaca equities: no commission).");
const limits = z.record(z.string(), z.unknown()).optional().describe("Tighten your limits file for this call only (e.g. {\"max_order_notional\": 5000}).");

export const INPUTS = {
  paper_account: z.object({}).strict(),
  preview_paper_orders: z.object({ orders: z.array(order).min(1).max(50).describe("Orders to check."), fees, limits }).strict(),
  rebalance_to_weights: z.object({
    target_weights: z.record(z.string().regex(/^[A-Z][A-Z0-9.]{0,9}$/), z.number().min(-1).max(1)).describe("Target weight per ticker as a fraction of equity, e.g. {\"SPY\": 0.6, \"TLT\": 0.4}."),
    cash_buffer: z.number().min(0).max(0.5).optional().describe("Equity kept in cash; default 0.02."),
    min_trade_usd: z.number().min(0).optional().describe("Skip smaller changes; default 50."),
    liquidate_others: z.boolean().optional().describe("Sell holdings not in target_weights; default false."),
    allow_short: z.boolean().optional().describe("Allow negative weights; default false."),
    allow_leverage: z.boolean().optional().describe("Allow gross weight above 1; default false."),
    fees, limits,
  }).strict(),
  verify_attestation: z.object({
    attestation: z.looseObject({}).describe("An attestation object a check or send returned."),
    public_key_pem: z.string().max(2000).optional().describe("The signer's public key (PEM); default this machine's CANLI_HOME/attest-ed25519.pub.pem."),
    pq_public_key_pem: z.string().max(6000).optional().describe("The signer's ML-DSA-65 public key (PEM), for an attestation also signed post-quantum; default this machine's CANLI_HOME/attest-ml-dsa-65.pub.pem."),
    openings: z.array(z.object({ label: z.string().max(40), commitment: z.string().regex(/^[0-9a-f]{64}$/), salt: z.string().regex(/^[0-9a-f]{32}$/), value: z.unknown() }).strict()).max(10).optional().describe("Commitments to open: label, commitment, salt and value, from the trader's commitments.jsonl."),
  }).strict(),
  send_paper_orders: z.object({ token: z.string().max(4000).optional().describe("Confirmation token from preview_paper_orders or rebalance_to_weights."), cancel_order_ids: z.array(z.string().max(64)).max(100).optional().describe("Open paper order ids to cancel instead (no token needed).") }).strict(),
};

const DESCRIPTIONS = {
  paper_account: "Read your Alpaca paper account: equity, cash, buying power, positions, open orders, the market clock, the kill switch and the local order log's verified head.",
  preview_paper_orders: "Check orders against your paper account, live quotes, the market clock, your limits file and the kill switch; when every order passes, return a five-minute confirmation token for exactly these orders.",
  rebalance_to_weights: "Turn target portfolio weights into the whole-share orders that move your paper account there (sells first), check them, and return a confirmation token when all pass.",
  verify_attestation: "Check an attestation a pre-trade check or send returned: that it was signed by the trader's keys (Ed25519 and, where present, post-quantum ML-DSA-65; both must hold) and not altered, and, given openings from the trader's commitments file, that committed account figures are what they claim. Offline; reads nothing from Alpaca.",
  send_paper_orders: "Send previewed orders to your Alpaca paper account with their confirmation token (the kill switch is read again first), or cancel open paper orders by id. Every send is logged, hash-chained.",
};
const ANNOTATIONS = {
  paper_account: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  preview_paper_orders: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  rebalance_to_weights: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  verify_attestation: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  send_paper_orders: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
};
const TITLES = { paper_account: "Paper account", preview_paper_orders: "Preview paper orders", rebalance_to_weights: "Rebalance to weights", send_paper_orders: "Send paper orders", verify_attestation: "Verify an attestation" };

export function registerAll(server, { broker, home }) {
  const run = { paper_account: () => broker.account(), preview_paper_orders: (a) => broker.preview(a), rebalance_to_weights: (a) => broker.rebalance(a), send_paper_orders: (a) => broker.send(a), verify_attestation: (a) => { const dir = home ?? join(homedir(), ".canli"), local = (f) => { try { return readFileSync(join(dir, f), "utf8"); } catch { return null; } }; return verifyAttestation(a.attestation, a.public_key_pem ?? local("attest-ed25519.pub.pem"), a.openings ?? [], a.pq_public_key_pem ?? (a.public_key_pem ? null : local("attest-ml-dsa-65.pub.pem"))); } };
  for (const name of Object.keys(INPUTS)) {
    server.registerTool(name, { title: TITLES[name], description: DESCRIPTIONS[name], annotations: { title: TITLES[name], ...ANNOTATIONS[name] }, inputSchema: INPUTS[name], outputSchema: z.looseObject({}) }, async (args) => {
      try { const v = await run[name](args ?? {}); return { content: [{ type: "text", text: JSON.stringify(v) }], structuredContent: v }; }
      catch (e) { return { isError: true, content: [{ type: "text", text: String(e?.message ?? e) }] }; }
    });
  }
}

const isMain = (() => { try { return realpathSync(process.argv[1] ?? "") === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();

if (isMain) {
  const home = process.env.CANLI_HOME ?? join(homedir(), ".canli");
  const server = new McpServer(SERVER_INFO, { instructions: SERVER_INSTRUCTIONS });
  registerAll(server, { broker: createBroker({ home }), home });
  await server.connect(new StdioServerTransport());
}
