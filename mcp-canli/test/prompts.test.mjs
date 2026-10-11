// The workflow prompts: each one offered names only tools this build has, and every call it asks
// for passes that tool's own argument schema, so a client that picks a prompt gets a batch that runs.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { loadPack, PACKS } from "../src/packs.mjs";
import { PROMPTS, availablePrompts, registerPrompts } from "../src/prompts.mjs";

const INDEX = JSON.parse(readFileSync(new URL("../src/index.json", import.meta.url), "utf8"));
const BY_NAME = new Map(INDEX.tools.map(([name, pack]) => [name, { name, pack }]));
const ALL = Object.keys(PACKS);
const ARGS = { ticker: "AAPL", returns_file: "returns.csv", trials: "40" };
const argsFor = (p) => Object.fromEntries(Object.keys(p.args).map((k) => [k, ARGS[k]]));

test("every prompt offered asks only for calls its tools accept", async () => {
  const offered = availablePrompts(BY_NAME, ALL);
  assert.ok(offered.length >= 3, `${offered.length} prompts offered`);
  for (const [name, p] of offered) {
    for (const call of p.calls(argsFor(p))) {
      const tool = (await loadPack(BY_NAME.get(call.name).pack)).get(call.name);
      const parsed = tool.input.safeParse(call.arguments);
      assert.ok(parsed.success, `${name}: ${call.name} ${JSON.stringify(call.arguments)}: ${parsed.error?.issues?.map((i) => i.message).join("; ")}`);
    }
    const text = p.ask(argsFor(p));
    const batch = JSON.parse(text.slice(text.indexOf("{\"calls\""), text.indexOf("\n", text.indexOf("{\"calls\""))));
    assert.deepEqual(batch.calls, p.calls(argsFor(p)), `${name}: the text asks for exactly these calls`);
  }
});

test("a prompt that names a tool this build lacks, or a disabled pack, is not offered", () => {
  const offered = new Set(availablePrompts(BY_NAME, ALL).map(([n]) => n));
  for (const [name, p] of Object.entries(PROMPTS)) {
    const missing = p.calls(argsFor(p)).filter((c) => !BY_NAME.has(c.name)).map((c) => c.name);
    assert.equal(offered.has(name), missing.length === 0, `${name} (missing: ${missing.join(", ") || "none"})`);
  }
  const offline = availablePrompts(BY_NAME, ["quant", "validation"]).map(([n]) => n);
  assert.deepEqual(offline, ["backtest_check"], "with only the offline packs, only the backtest check");
});

test("prompts register with their argument schemas and render a user message", () => {
  const got = {};
  registerPrompts({ registerPrompt: (name, config, cb) => { got[name] = { config, cb }; } }, BY_NAME, ALL);
  for (const [name, { config, cb }] of Object.entries(got)) {
    assert.ok(config.title && config.description, name);
    const msg = cb(argsFor(PROMPTS[name])).messages[0];
    assert.equal(msg.role, "user");
    assert.match(msg.content.text, /run_tool/);
  }
});
