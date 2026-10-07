#!/usr/bin/env node
// canli-quant-mcp: quant finance tools computed on the caller's data, each checked against an
// independent reference in test/reference.test.mjs.
//
// Built so the catalog can grow to hundreds of tools without growing the prompt: by default the
// model sees three tools (find_tool, describe_tool, run_tool) and reaches every calculation through
// them. CANLI_TOOLSETS lists toolsets directly instead (comma-separated, or "all"). The tool list is
// byte-identical across launches, so providers can cache it.
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";

import { BY_NAME, CATALOG, TOOLSETS, findTools, inputJsonSchema, runTool } from "./registry.mjs";

export const SERVER_NAME = "canli-quant-mcp";
export const SERVER_VERSION = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
export const SERVER_INFO = Object.freeze({
  name: SERVER_NAME,
  version: SERVER_VERSION,
  title: "Canli Quant",
  websiteUrl: "https://canlicapital.com/developers",
  icons: [
    { src: "https://canlicapital.com/icon-512.png", mimeType: "image/png", sizes: ["512x512"] },
    { src: "https://canlicapital.com/favicon.svg", mimeType: "image/svg+xml", sizes: ["any"] },
  ],
});

export const SERVER_INSTRUCTIONS = `Quant finance calculations on data you send: ${CATALOG.length} tools in ${Object.keys(TOOLSETS).length} toolsets (${Object.keys(TOOLSETS).join(", ")}). Call find_tool with what you need in plain words, then run_tool with the tool's name and arguments; describe_tool gives a tool's exact input schema when unsure. Returns are simple fractions (0.01 = 1%), oldest first. Every result names its method.`;

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const open = z.looseObject({});

const ok = (result) => ({ content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result });
const fail = (err) => ({ isError: true, content: [{ type: "text", text: String(err?.message ?? err) }] });
const guard = (fn) => (args) => {
  try {
    return ok(fn(args));
  } catch (err) {
    return fail(err);
  }
};

export function selectedToolsets(env = process.env.CANLI_TOOLSETS) {
  const raw = String(env ?? "").trim().toLowerCase();
  if (!raw || raw === "discover") return [];
  if (raw === "all") return Object.keys(TOOLSETS);
  const names = raw.split(",").map((s) => s.trim()).filter(Boolean);
  for (const n of names) if (!TOOLSETS[n]) throw new Error(`CANLI_TOOLSETS: no toolset ${n}; toolsets are ${Object.keys(TOOLSETS).join(", ")}, all, discover`);
  return names;
}

export function registerAll(server, { toolsets = selectedToolsets() } = {}) {
  const toolsetNames = Object.keys(TOOLSETS);
  server.registerTool("find_tool", {
    title: "Find a tool",
    description: `Search the ${CATALOG.length} quant tools by what you need, e.g. "value at risk", "black scholes greeks", "max drawdown". Returns names, toolsets and one-line descriptions, best first.`,
    annotations: { title: "Find a tool", ...READ_ONLY },
    inputSchema: z.object({
      query: z.string().max(200).describe("What you need, in plain words."),
      toolset: z.enum(toolsetNames).optional().describe("Only this toolset."),
      limit: z.number().int().min(1).max(50).optional().describe("Default 8."),
    }).strict(),
    outputSchema: open,
  }, guard(({ query, toolset, limit }) => {
    const found = findTools(query, { toolset, limit });
    return { columns: ["name", "toolset", "description"], rows: found.map((t) => [t.name, t.toolset, t.description]), next: "run_tool with name and arguments; describe_tool for the input schema." };
  }));
  server.registerTool("describe_tool", {
    title: "Describe a tool",
    description: "Get one tool's full description and exact input JSON Schema before calling run_tool.",
    annotations: { title: "Describe a tool", ...READ_ONLY },
    inputSchema: z.object({ name: z.string().max(100).describe("A tool name from find_tool, e.g. value_at_risk.") }).strict(),
    outputSchema: open,
  }, guard(({ name }) => {
    const t = BY_NAME.get(name);
    if (!t) throw new Error(`No tool ${name}. find_tool searches by description.`);
    return { name: t.name, toolset: t.toolset, title: t.title, description: t.description, input_schema: inputJsonSchema(t) };
  }));
  server.registerTool("run_tool", {
    title: "Run a tool",
    description: "Run any quant tool by name with its arguments, e.g. {name: \"sharpe_ratio\", arguments: {returns: [0.01, -0.02, 0.015]}}.",
    annotations: { title: "Run a tool", ...READ_ONLY },
    inputSchema: z.object({
      name: z.string().max(100).describe("Tool name from find_tool."),
      arguments: z.record(z.string(), z.unknown()).optional().describe("The tool's arguments, as describe_tool gives them."),
    }).strict(),
    outputSchema: open,
  }, guard(({ name, arguments: args }) => runTool(name, args)));
  for (const toolset of toolsets) {
    for (const t of TOOLSETS[toolset].tools) {
      server.registerTool(t.name, { title: t.title, description: t.description, annotations: { title: t.title, ...READ_ONLY }, inputSchema: t.input, outputSchema: open }, guard((args) => runTool(t.name, args)));
    }
  }
}

const isMain = (() => {
  try {
    return realpathSync(process.argv[1] ?? "") === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (isMain) {
  const server = new McpServer(SERVER_INFO, { instructions: SERVER_INSTRUCTIONS });
  registerAll(server);
  await server.connect(new StdioServerTransport());
}
