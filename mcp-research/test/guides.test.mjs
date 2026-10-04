// The prompts and code resources an agent sees: every tool has a schema and a working example whose
// arguments its own input schema accepts, and every prompt fills in its arguments.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { McpServer } from "@modelcontextprotocol/server";

import { EXAMPLE_ARGS, EXAMPLE_LANGUAGES, HOSTED_URL, exampleCode } from "../src/guides.mjs";
import { RESEARCH_LIMITS, SERVER_INFO, createSession, registerAll } from "../src/server.mjs";

const ENTRY = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/server.mjs");

test("every tool has example arguments its own input schema accepts", () => {
  const catalog = registerAll(new McpServer(SERVER_INFO), createSession({ fetchImpl: async () => { throw new Error("no network"); } }));
  assert.deepEqual(Object.keys(EXAMPLE_ARGS).sort(), Object.keys(catalog).sort());
  for (const [tool, entry] of Object.entries(catalog)) {
    const parsed = entry.inputSchema.safeParse(EXAMPLE_ARGS[tool]);
    assert.equal(parsed.success, true, `${tool}: ${JSON.stringify(parsed.error?.issues)}`);
  }
});

test("examples call the hosted endpoint in each language, and an unknown language is refused", () => {
  for (const language of EXAMPLE_LANGUAGES) {
    const code = exampleCode(language, "search_research");
    assert.ok(code.includes(HOSTED_URL), language);
    assert.ok(code.includes("search_research"), language);
  }
  assert.match(exampleCode("python", "get_paper"), /"slug": "crypto-carry-lineage"/);
  assert.match(exampleCode("curl", "list_topics"), /"method":"tools\/call"/);
  assert.throws(() => exampleCode("cobol", "list_topics"), /No example language cobol/);
});

test("over stdio: three prompts, the limits resource, both templates, and each resolves", async (t) => {
  const client = new Client({ name: "guides-test", version: "0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [ENTRY], env: { ...process.env } }));
  t.after(() => client.close());
  const { prompts } = await client.listPrompts();
  assert.deepEqual(prompts.map((p) => p.name).sort(), ["audit_canli_record", "literature_review", "preflight_idea"]);
  const filled = await client.getPrompt({ name: "preflight_idea", arguments: { idea: "insider purchases" } });
  assert.match(filled.messages[0].content.text, /"insider purchases"/);
  const { resources } = await client.listResources();
  assert.deepEqual(resources.map((r) => r.uri), ["canli://limits"]);
  const limits = JSON.parse((await client.readResource({ uri: "canli://limits" })).contents[0].text);
  assert.deepEqual(limits.limits, [...RESEARCH_LIMITS]);
  const { resourceTemplates } = await client.listResourceTemplates();
  assert.deepEqual(resourceTemplates.map((r) => r.uriTemplate).sort(), ["canli://examples/{language}/{tool}", "canli://schemas/{tool}"]);
  const schema = JSON.parse((await client.readResource({ uri: "canli://schemas/get_paper" })).contents[0].text);
  assert.equal(schema.tool, "get_paper");
  assert.ok(schema.input_schema.properties.slug, "the input schema names slug");
  const example = (await client.readResource({ uri: "canli://examples/javascript/trial_ledger" })).contents[0].text;
  assert.match(example, /StreamableHTTPClientTransport/);
});
