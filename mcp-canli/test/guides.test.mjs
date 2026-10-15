import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";

import { closeGuideClients, discoverPackGuides, loadedGuidePacks } from "../src/guides.mjs";
import { PACKS } from "../src/packs.mjs";
import { PROMPTS } from "../src/prompts.mjs";
import { registerAll } from "../src/server.mjs";

const CATALOG = JSON.parse(readFileSync(new URL("../src/guides.json", import.meta.url), "utf8"));

async function connect(t, packs = Object.keys(PACKS)) {
  const server = new McpServer({ name: "test-flagship", version: "0" });
  registerAll(server, packs);
  const client = new Client({ name: "test-guides", version: "0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  t.after(async () => { await client.close(); await server.close(); await closeGuideClients(); });
  return client;
}

test("listing the full guide catalog loads no pack code and keeps three front tools", async (t) => {
  assert.deepEqual(loadedGuidePacks(), []);
  const client = await connect(t);
  const prompts = (await client.listPrompts()).prompts;
  assert.equal(prompts.length, Object.keys(PROMPTS).length + Object.values(CATALOG).reduce((n, g) => n + g.prompts.length, 0));
  assert.equal(new Set(prompts.map((p) => p.name)).size, prompts.length);
  assert.deepEqual((await client.listTools()).tools.map((tool) => tool.name), ["find_tool", "describe_tool", "run_tool"]);
  const resources = (await client.listResources()).resources;
  assert.equal(resources.length, 4 + Object.values(CATALOG).reduce((n, g) => n + g.resources.length, 0), "catalog, packs, privacy and the result viewer, then the packs' own");
  assert.equal(new Set(resources.map((r) => r.uri)).size, resources.length);
  assert.equal((await client.listResourceTemplates()).resourceTemplates.length, 1 + Object.values(CATALOG).reduce((n, g) => n + g.templates.length, 0));
  assert.deepEqual(loadedGuidePacks(), []);
});

test("known-on-date guides retain source validation, resource schemas and completion", async (t) => {
  const client = await connect(t);
  const result = await client.getPrompt({ name: "fundamentals.known_on_date", arguments: { company: "AAPL", as_of: "2020-01-01" } });
  assert.match(result.messages[0].content.text, /run_tool/);
  assert.match(result.messages[0].content.text, /2020-01-01/);
  await assert.rejects(client.getPrompt({ name: "fundamentals.known_on_date", arguments: { company: "AAPL" } }), /required|Invalid|as_of/i);
  const resource = await client.readResource({ uri: "canli-fundamentals://schemas/cross_section" });
  assert.equal(resource.contents[0].uri, "canli-fundamentals://schemas/cross_section");
  assert.match(resource.contents[0].text, /cross_section/);
  const result2 = await client.complete({ ref: { type: "ref/resource", uri: "canli-fundamentals://schemas/{tool}" }, argument: { name: "tool", value: "known" } });
  assert.ok(result2.completion.values.includes("known_as_of"));
  const concepts = await client.complete({ ref: { type: "ref/prompt", name: "fundamentals.peers_as_of" }, argument: { name: "concept", value: "re" } });
  assert.ok(concepts.completion.values.includes("revenue"));
  await assert.rejects(client.readResource({ uri: "canli-fundamentals://schemas/constructor" }), /unknown|no tool/i);
  assert.deepEqual(loadedGuidePacks(), ["fundamentals"]);
});

test("renamed validation tools work in prompts, schemas and resource completion", async (t) => {
  const client = await connect(t, ["validation"]);
  const result = await client.getPrompt({ name: "validation.stress_my_strategy", arguments: { returns_file: "returns.csv" } });
  assert.match(result.messages[0].content.text, /strategy_stress_test/);
  assert.doesNotMatch(result.messages[0].content.text, /\bstress_test\b/);
  const schema = await client.readResource({ uri: "canli-validation://schemas/strategy_stress_test" });
  assert.equal(schema.contents[0].uri, "canli-validation://schemas/strategy_stress_test");
  assert.match(schema.contents[0].text, /strategy_stress_test/);
  const complete = await client.complete({ ref: { type: "ref/resource", uri: "canli-validation://schemas/{tool}" }, argument: { name: "tool", value: "strategy_stress" } });
  assert.deepEqual(complete.completion.values, ["strategy_stress_test"]);
  const example = await client.readResource({ uri: "canli-validation://examples/javascript/strategy_stress_test" });
  assert.match(example.contents[0].text, /\bstress_test\b/);
  assert.match(example.contents[0].text, /canli-validation-mcp/);
  await assert.rejects(client.readResource({ uri: "canli-validation://schemas/get_key" }), /omitted/);
  await assert.rejects(client.readResource({ uri: "canli-validation://schemas/get%5Fkey" }), /omitted/);
  const encoded = await client.readResource({ uri: "canli-validation://schemas/strategy%5Fstress_test" });
  assert.match(encoded.contents[0].text, /strategy_stress_test/);
  const hidden = await client.complete({ ref: { type: "ref/resource", uri: "canli-validation://schemas/{tool}" }, argument: { name: "tool", value: "get_key" } });
  assert.deepEqual(hidden.completion.values, []);
  await assert.rejects(client.getPrompt({ name: "fundamentals.known_on_date", arguments: { company: "AAPL", as_of: "2020-01-01" } }));
});

test("quant recipes, sleeve specifications and research schemas retain their native handlers", async (t) => {
  const client = await connect(t);
  const recipe = await client.complete({ ref: { type: "ref/prompt", name: "quant.audit_backtest" }, argument: { name: "recipe", value: "ma_" } });
  assert.ok(recipe.completion.values.includes("ma_crossover"));
  const sleeves = JSON.parse((await client.readResource({ uri: "canli-quant://sleeves" })).contents[0].text);
  assert.equal(sleeves.sleeves, 399);
  const id = sleeves.rows[0][0];
  const spec = await client.readResource({ uri: `canli-quant://sleeves/${id}` });
  assert.match(spec.contents[0].text, new RegExp(id));
  const research = await client.getPrompt({ name: "research.audit_canli_record", arguments: {} });
  assert.match(research.messages[0].content.text, /run_tool/);
  await assert.rejects(client.readResource({ uri: "canli-research://schemas/constructor" }), /unknown|no tool/i);
});

test("the build-time guides match the exact installed packs' actual MCP listings", async (t) => {
  t.after(closeGuideClients);
  assert.deepEqual(await discoverPackGuides(), CATALOG);
});
