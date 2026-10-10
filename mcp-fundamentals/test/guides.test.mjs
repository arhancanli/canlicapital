// The prompts, resources and completions an agent sees: every tool has a schema and a working example
// whose arguments its own input schema accepts, every prompt fills in its arguments, and prompt
// arguments complete.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { McpServer } from "@modelcontextprotocol/server";

import { EXAMPLE_ARGS, EXAMPLE_LANGUAGES, HOSTED_URL, exampleCode } from "../src/server.mjs";
import { DEFAULT_CONCEPTS, FRIENDLY, LIMITS, SERVER_INFO, createSession, registerAll } from "../src/server.mjs";

const ENTRY = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/server.mjs");
const offline = () => createSession({ fetchImpl: async () => { throw new Error("no network"); } });

test("every tool has example arguments its own input schema accepts", () => {
  const catalog = registerAll(new McpServer(SERVER_INFO), offline());
  assert.deepEqual(Object.keys(EXAMPLE_ARGS).sort(), Object.keys(catalog).sort());
  for (const [tool, entry] of Object.entries(catalog)) {
    const parsed = entry.inputSchema.safeParse(EXAMPLE_ARGS[tool]);
    assert.equal(parsed.success, true, `${tool}: ${JSON.stringify(parsed.error?.issues)}`);
  }
});

test("examples call the hosted endpoint in each language, and an unknown language is refused", () => {
  for (const language of EXAMPLE_LANGUAGES) {
    const code = exampleCode(language, "known_as_of");
    assert.ok(code.includes(HOSTED_URL), language);
    assert.ok(code.includes("known_as_of"), language);
  }
  assert.match(exampleCode("python", "find_company"), /"query": "Exxon Mobil"/);
  assert.match(exampleCode("curl", "history"), /"method":"tools\/call"/);
  assert.throws(() => exampleCode("cobol", "history"), /No example language cobol/);
});

test("over stdio: three prompts, two resources, two templates, completions, and each resolves", async (t) => {
  const client = new Client({ name: "guides-test", version: "0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [ENTRY], env: { ...process.env } }));
  t.after(() => client.close());
  assert.ok(client.getServerCapabilities()?.completions, "completions capability is advertised");
  const { prompts } = await client.listPrompts();
  assert.deepEqual(prompts.map((p) => p.name).sort(), ["known_on_date", "peers_as_of", "restatement_review"]);
  const known = await client.getPrompt({ name: "known_on_date", arguments: { company: "AAPL", as_of: "2019-01-01" } });
  assert.match(known.messages[0].content.text, /company "AAPL", as_of "2019-01-01"/);
  const peers = await client.getPrompt({ name: "peers_as_of", arguments: { companies: "AAPL, MSFT,", concept: "revenue", as_of: "2024-06-30" } });
  assert.match(peers.messages[0].content.text, /companies \["AAPL", "MSFT"\]/);
  const scan = await client.getPrompt({ name: "restatement_review", arguments: { company: "KO" } });
  assert.match(scan.messages[0].content.text, /no concept, to scan every measure/);
  const done = await client.complete({ ref: { type: "ref/prompt", name: "restatement_review" }, argument: { name: "concept", value: "eps" } });
  assert.deepEqual(done.completion.values, ["eps_basic", "eps_diluted"]);
  const { resources } = await client.listResources();
  assert.deepEqual(resources.map((r) => r.uri).sort(), ["canli://concepts", "canli://limits"]);
  const limits = JSON.parse((await client.readResource({ uri: "canli://limits" })).contents[0].text);
  assert.deepEqual(limits.limits, [...LIMITS]);
  const concepts = JSON.parse((await client.readResource({ uri: "canli://concepts" })).contents[0].text);
  assert.deepEqual(concepts.plain_names, JSON.parse(JSON.stringify(FRIENDLY)));
  assert.deepEqual(concepts.default_concepts, [...DEFAULT_CONCEPTS]);
  const { resourceTemplates } = await client.listResourceTemplates();
  assert.deepEqual(resourceTemplates.map((r) => r.uriTemplate).sort(), ["canli://examples/{language}/{tool}", "canli://schemas/{tool}"]);
  const schema = JSON.parse((await client.readResource({ uri: "canli://schemas/cross_section" })).contents[0].text);
  assert.equal(schema.tool, "cross_section");
  assert.ok(schema.input_schema.properties.as_of, "the input schema names as_of");
  const tools = await client.complete({ ref: { type: "ref/resource", uri: "canli://schemas/{tool}" }, argument: { name: "tool", value: "re" } });
  assert.deepEqual(tools.completion.values, ["restatements"]);
  const example = (await client.readResource({ uri: "canli://examples/javascript/vintages" })).contents[0].text;
  assert.match(example, /StreamableHTTPClientTransport/);
});
