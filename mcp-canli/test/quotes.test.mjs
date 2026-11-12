// canli://quote/{symbols*}: prices by address, and a subscription that notifies when they change (a local server
// checks every CANLI_QUOTE_SECONDS). test/quote-preload.mjs stands in for Yahoo's chart data.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

import { quoteSymbols } from "../src/quotes.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test("symbols in an address: up to ten, each once", () => {
  assert.deepEqual(quoteSymbols("aapl,MSFT+btc-usd AAPL"), ["AAPL", "MSFT", "BTC-USD"]);
  assert.equal(quoteSymbols(Array.from({ length: 12 }, (_, i) => `S${i}`).join(",")).length, 10);
});

test("prices by address, and a subscription that says when they change and stops when asked", async () => {
  const home = mkdtempSync(path.join(tmpdir(), "quote-"));
  const c = new Client({ name: "quote-test", version: "0" });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: ["--import", path.join(HERE, "quote-preload.mjs"), path.join(HERE, "../src/server.mjs")], env: { PATH: process.env.PATH ?? "", HOME: home, CANLI_HOME: home, CANLI_CACHE_DIR: "", CANLI_QUOTE_SECONDS: "1" } }));
  try {
    assert.equal(c.getServerCapabilities().resources.subscribe, true);
    assert.ok((await c.listResourceTemplates()).resourceTemplates.some((t) => t.uriTemplate === "canli://quote/{symbols*}"));
    const read = async (uri) => JSON.parse((await c.readResource({ uri })).contents[0].text);
    const first = await read("canli://quote/AAPL,MSFT");
    assert.deepEqual(first.quotes.map((q) => q.symbol), ["AAPL", "MSFT"]);
    assert.ok(first.quotes.every((q) => q.price > 100 && q.previous_close === 100), JSON.stringify(first));
    const updates = [];
    c.setNotificationHandler("notifications/resources/updated", (n) => { updates.push(n.params.uri); });
    await c.subscribeResource({ uri: "canli://quote/AAPL" });
    for (const until = Date.now() + 15000; !updates.length && Date.now() < until;) await wait(200);
    assert.deepEqual([...new Set(updates)], ["canli://quote/AAPL"], "notified when the price moved");
    assert.ok((await read("canli://quote/AAPL")).quotes[0].price > first.quotes[0].price);
    await c.unsubscribeResource({ uri: "canli://quote/AAPL" });
    const after = updates.length;
    await wait(6500);
    assert.equal(updates.length, after, "nothing after unsubscribing");
    await assert.rejects(c.subscribeResource({ uri: "canli://catalog" }), /Only canli:\/\/quote/);
  } finally {
    await c.close();
    rmSync(home, { recursive: true, force: true });
  }
});
