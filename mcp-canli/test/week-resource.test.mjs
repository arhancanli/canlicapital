// Resources a host attaches to a conversation: canli://week/{holdings*}, my_week over the holdings in the address
// with the sentinel's events of the same seven days from this machine, and canli://company/{company}, a company by
// its address. With a holdout set, which hides the present, neither answers.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const ENTRY = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/server.mjs");

test("the week as a resource: each holding named in the address, this week's sentinel events, and nothing while a holdout is set", async () => {
  const home = mkdtempSync(path.join(tmpdir(), "week-"));
  mkdirSync(path.join(home, "sentinel"));
  const event = (id, daysAgo) => JSON.stringify({ id, rule: "filing-1", kind: "filing", at: new Date(Date.now() - daysAgo * 86400000).toISOString(), headline: `event ${id}` });
  writeFileSync(path.join(home, "sentinel", "events.jsonl"), `${event("recent", 1)}\n${event("old", 9)}\n`);
  const c = new Client({ name: "week-test", version: "0" });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: [ENTRY], env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", CANLI_HOME: home, CANLI_CACHE_DIR: "", CANLI_OFFLINE: "1" } }));
  try {
    const { resourceTemplates } = await c.listResourceTemplates();
    assert.ok(resourceTemplates.some((t) => t.uriTemplate === "canli://week/{holdings*}"));
    const read = async (uri) => JSON.parse((await c.readResource({ uri })).contents[0].text);
    const week = await read("canli://week/AAPL,NVDA");
    assert.equal(week.rows.length, 2, "one row a holding");
    assert.deepEqual(week.sentinel_events.map((e) => e.id), ["recent"], "the last seven days only");
    assert.equal((await read("canli://week/VOO")).rows.length, 1);
    assert.ok(resourceTemplates.some((t) => t.uriTemplate === "canli://company/{company}"), "a company by its address");
    await c.callTool({ name: "run_tool", arguments: { name: "holdout_set", arguments: { from: "2024-01-01" } } });
    await assert.rejects(c.readResource({ uri: "canli://week/AAPL" }), /holdout from 2024-01-01 hides/);
    await assert.rejects(c.readResource({ uri: "canli://company/AAPL" }), /holdout from 2024-01-01 hides/);
  } finally {
    await c.close();
    rmSync(home, { recursive: true, force: true });
  }
});
