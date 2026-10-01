#!/usr/bin/env node
// canli-execution-mcp: checks orders before they are sent. check_orders estimates each order's cost
// and checks it against the trader's limits, the market state and the kill switch; it rejects with
// every reason and never resizes. This build places no orders: it has no broker code at all.
//
// Order-check state lives in a trader-controlled directory (CANLI_HOME, default ~/.canli).
// Tools never edit these files:
//   limits.json  the trader's own limits; a request can only tighten them, never loosen them;
//   KILL         while this file exists, every order is rejected as kill_switch_engaged.
// check_orders reads both on every call; size_position reads limits.json.
// Journal head/verify only read. Export can create private files under exports,
// including retained partial files on failure; it never edits the source journal.
// Local initialize/append require CANLI_EXEC_JOURNAL_WRITE=1 and the owner's journal.key.
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";

import { effectiveLimits } from "./core/js/pretrade-core.js";
import { SERVER_INFO, SERVER_NAME, SERVER_VERSION } from "./info.mjs";
import { advertised, CHECK_ORDERS_DESCRIPTION, CHECK_ORDERS_JSON, CHECK_ORDERS_OUTPUT, checkOrdersInput, limitsDigest, limitsFileSchema, parseInput, runCheckOrders } from "./check-orders.mjs";
import { JOURNAL_DESCRIPTION, JOURNAL_JSON, JOURNAL_OUTPUT, journalInput, runJournal } from "./journal.mjs";
import { configuredJournalWrites, isJournalWrite, JOURNAL_WRITABLE_JSON, JOURNAL_WRITABLE_OUTPUT, JOURNAL_WRITE_DESCRIPTION, JOURNAL_WRITE_INSTRUCTIONS, journalWritableInput, runJournalWrite } from "./journal-write.mjs";
import { runSizePosition, SIZE_POSITION_DESCRIPTION, SIZE_POSITION_JSON, SIZE_POSITION_OUTPUT, sizePositionInput } from "./size-position.mjs";
import { runShortfall, SHORTFALL_DESCRIPTION, SHORTFALL_JSON, SHORTFALL_OUTPUT, shortfallInput } from "./measure-shortfall.mjs";

// Sent once in initialize; byte-stable across runs (a test pins it).
export const SERVER_INSTRUCTIONS = "Plans and checks supplied orders. size_position turns a stated budget into a position within caps; check_orders estimates costs and checks limits, market state and kill switch, rejecting with every reason and never resizing. measure_shortfall decomposes supplied fills; missing fees stay unknown. Limits come from the trader's file and calls can only tighten them. journal export needs account.v0 opening cash/positions, fees and marks; validate the record with CANLI_LOCAL=1 and journal_file. Every number comes from supplied inputs; omissions are listed. Signing is self-attestation. Nothing here is investment advice.";

// Toolsets, chosen with CANLI_EXEC_TOOLSETS (comma-separated names, or "all"); an unknown name is
// refused, so a typo cannot silently drop a tool.
export const TOOLSETS = Object.freeze({ plan: Object.freeze(["size_position", "check_orders", "measure_shortfall"]), journal: Object.freeze(["journal"]) });

export function configuredToolsets(value) {
  const v = value?.trim();
  if (!v || v.toLowerCase() === "all") return Object.keys(TOOLSETS);
  const names = v.split(",").map((s) => s.trim()).filter(Boolean);
  const unknown = names.filter((n) => !Object.hasOwn(TOOLSETS, n));
  if (unknown.length || !names.length) throw new Error(`Unknown toolset ${unknown.join(", ") || "(none)"}; choose from ${Object.keys(TOOLSETS).join(", ")} or all`);
  return names;
}

export function createSession({ home, toolsets, now, journalWrites } = {}) {
  const writes = journalWrites === undefined ? configuredJournalWrites(process.env.CANLI_EXEC_JOURNAL_WRITE) : journalWrites;
  if (typeof writes !== 'boolean') throw new Error('journalWrites must be boolean');
  return {
    home: home ?? process.env.CANLI_HOME ?? join(homedir(), ".canli"),
    toolsets: toolsets ?? configuredToolsets(process.env.CANLI_EXEC_TOOLSETS),
    now: now ?? (() => new Date()),
    journalWrites: writes,
  };
}

/** The trader's limits file, read fresh: {} when there is none; an unreadable or invalid file refuses. */
export function readLimitsFile(session) {
  const path = join(session.home, "limits.json");
  if (!existsSync(path)) return { path: null, limits: {} };
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`the limits file ${path} could not be read as JSON (${error.message}); checks refuse rather than run without it`);
  }
  const valid = limitsFileSchema.safeParse(parsed);
  if (!valid.success) throw new Error(`the limits file ${path} is not valid (${valid.error.issues.map((i) => `${i.path.join(".") || "file"}: ${i.message}`).join("; ")}); checks refuse rather than run without it`);
  return { path, limits: valid.data, mtime: statSync(path).mtime.toISOString() };
}

export function killState(session) {
  const path = join(session.home, "KILL");
  return { engaged: existsSync(path), source: path };
}

export { SERVER_INFO, SERVER_NAME, SERVER_VERSION };

const asText = (value) => ({ content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value });

export async function toolCheckOrders(session, args) {
  const input = parseInput(checkOrdersInput, args, "check_orders");
  const file = readLimitsFile(session);
  const result = runCheckOrders(input, { baseLimits: file.limits, kill: killState(session), now: session.now });
  return asText({ ...result, limits_file: file.path });
}

export async function toolSizePosition(session, args) {
  const input = parseInput(sizePositionInput, args, "size_position");
  const file = readLimitsFile(session);
  return asText({ ...runSizePosition(input, { baseLimits: file.limits }), limits_file: file.path });
}

export async function toolJournal(session, args) {
  if (isJournalWrite(args?.action)) {
    try { return asText(runJournalWrite(args, { home: session.home, enabled: session.journalWrites })); }
    catch (error) {
      if (!['JOURNAL_STORE_UNCERTAIN', 'JOURNAL_STORE_BUSY', 'JOURNAL_STORE_REFUSED'].includes(error.code)) throw error;
      return { ...asText({ action: args.action, error: { code: error.code, message: error.message,
        ...(error.code === 'JOURNAL_STORE_UNCERTAIN' ? { journal_persistence_attempted: error.journal_persistence_attempted } : {}) } }), isError: true };
    }
  }
  return asText(runJournal(parseInput(journalInput, args, "journal"), { home: session.home, now: session.now }));
}

export async function toolShortfall(args) {
  return asText(runShortfall(parseInput(shortfallInput, args, "measure_shortfall")));
}

const CHECK = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

export function registerTools(server, session) {
  const enabled = new Set(session.toolsets.flatMap((name) => TOOLSETS[name]));
  if (enabled.has("size_position")) {
    server.registerTool("size_position", { title: "Size a position", annotations: { title: "Size a position", ...CHECK }, description: SIZE_POSITION_DESCRIPTION, inputSchema: advertised(sizePositionInput, SIZE_POSITION_JSON), outputSchema: SIZE_POSITION_OUTPUT }, (args) => toolSizePosition(session, args));
  }
  if (enabled.has("check_orders")) {
    server.registerTool("check_orders", { title: "Check orders", annotations: { title: "Check orders", ...CHECK }, description: CHECK_ORDERS_DESCRIPTION, inputSchema: advertised(checkOrdersInput, CHECK_ORDERS_JSON), outputSchema: CHECK_ORDERS_OUTPUT }, (args) => toolCheckOrders(session, args));
  }
  if (enabled.has("measure_shortfall")) {
    server.registerTool("measure_shortfall", { title: "Measure execution shortfall", annotations: { title: "Measure execution shortfall", ...CHECK }, description: SHORTFALL_DESCRIPTION, inputSchema: advertised(shortfallInput, SHORTFALL_JSON), outputSchema: SHORTFALL_OUTPUT }, (args) => toolShortfall(args));
  }
  if (enabled.has("journal")) {
    const input = session.journalWrites ? journalWritableInput : journalInput;
    const json = session.journalWrites ? JOURNAL_WRITABLE_JSON : JOURNAL_JSON;
    const description = session.journalWrites ? JOURNAL_WRITE_DESCRIPTION : JOURNAL_DESCRIPTION;
    const output = session.journalWrites ? JOURNAL_WRITABLE_OUTPUT : JOURNAL_OUTPUT;
    server.registerTool("journal", { title: "Trade journal", annotations: { title: "Trade journal", ...CHECK, readOnlyHint: false, idempotentHint: false }, description, inputSchema: advertised(input, json), outputSchema: output }, (args) => toolJournal(session, args));
  }
}

// The limits file and the journal head as resources: read-only, and free of tool-list tokens.
export function registerResources(server, session) {
  server.registerResource("journal-head", "execution://journal/head", { title: "Journal head", description: "The trader's journal: its last hash, entry count and signing key, from the first and last lines (not verified).", mimeType: "application/json" }, async (uri) => ({ contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(runJournal({ action: "head" }, { home: session.home })) }] }));
  server.registerResource("limits", "execution://limits", { title: "Effective limits", description: "The trader's limits file as check_orders reads it: path, modification time, limits and their digest.", mimeType: "application/json" }, async (uri) => {
    const file = readLimitsFile(session);
    return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify({ path: file.path ?? join(session.home, "limits.json"), exists: file.path !== null, mtime: file.mtime ?? null, limits: effectiveLimits(file.limits, {}), limits_digest: limitsDigest(effectiveLimits(file.limits, {})), kill_switch: killState(session).engaged ? "engaged" : "clear" }) }] };
  });
}

const isMain = (() => {
  try {
    return realpathSync(process.argv[1] ?? "") === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (isMain) {
  const session = createSession();
  const instructions = session.journalWrites ? `${SERVER_INSTRUCTIONS} ${JOURNAL_WRITE_INSTRUCTIONS}` : SERVER_INSTRUCTIONS;
  const server = new McpServer(SERVER_INFO, { instructions });
  registerTools(server, session);
  registerResources(server, session);
  await server.connect(new StdioServerTransport());
}
