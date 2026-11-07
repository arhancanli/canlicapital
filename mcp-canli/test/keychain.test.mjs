// local/keychain.mjs: keys go to the OS keychain through stdin only, the names file never holds a value, a stored key
// joins the environment at start unless the variable is set, and a platform with no keychain says what to do instead.
// A stand-in for the keychain commands, so nothing is written to this machine's keychain.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { connectCommand, disconnectCommand, keychain, loadKeys, namesFor, storedNames } from "../local/keychain.mjs";

const SECRET = "pk_live_AbC123xyz789";
function fakeSpawn() {
  const calls = [];
  const items = new Map();
  const spawn = (cmd, args, input) => {
    calls.push({ cmd, args, input });
    if (cmd === "/usr/bin/security" && args[0] === "-i") {
      const m = /-a (\S+) .* -w "([^"]*)"/.exec(input);
      items.set(m[1], m[2]);
      return { status: 0, stdout: "", stderr: "" };
    }
    if (cmd === "/usr/bin/security" && args[0] === "find-generic-password") {
      const name = args[args.indexOf("-a") + 1];
      return items.has(name) ? { status: 0, stdout: `${items.get(name)}\n`, stderr: "" } : { status: 44, stdout: "", stderr: "could not be found" };
    }
    if (cmd === "/usr/bin/security" && args[0] === "delete-generic-password") { items.delete(args[args.indexOf("-a") + 1]); return { status: 0, stdout: "", stderr: "" }; }
    if (cmd === "secret-tool" && args[0] === "store") { items.set(args.at(-1), input); return { status: 0, stdout: "", stderr: "" }; }
    if (cmd === "secret-tool" && args[0] === "lookup") return items.has(args.at(-1)) ? { status: 0, stdout: items.get(args.at(-1)), stderr: "" } : { status: 1, stdout: "", stderr: "" };
    if (cmd === "secret-tool" && args[0] === "clear") { items.delete(args.at(-1)); return { status: 0, stdout: "", stderr: "" }; }
    return { status: -1, stdout: "", stderr: "unknown" };
  };
  return { spawn, calls, items };
}
const home = () => mkdtempSync(path.join(tmpdir(), "keychain-"));

test("macOS: the key reaches security through stdin, never an argument, and reads back", () => {
  const f = fakeSpawn();
  const chain = keychain({ platform: "darwin", spawn: f.spawn });
  chain.store("FINNHUB_API_KEY", SECRET);
  assert.deepEqual(f.calls[0].args, ["-i"]);
  assert.match(f.calls[0].input, /add-generic-password -U -s canli-mcp -a FINNHUB_API_KEY /);
  assert.equal(chain.read("FINNHUB_API_KEY"), SECRET);
  assert.ok(f.calls.every((c) => !c.args.join(" ").includes(SECRET)), "the key is in no argument list");
  assert.equal(chain.read("MISSING_API_KEY"), null);
  assert.throws(() => chain.store("X_API_KEY", 'a"b'), /cannot take safely/);
  assert.throws(() => chain.store("X_API_KEY", "a b"), /cannot take safely/);
});

test("Linux: secret-tool takes the key on stdin under service canli-mcp", () => {
  const f = fakeSpawn();
  const chain = keychain({ platform: "linux", spawn: f.spawn });
  chain.store("TIINGO_API_KEY", SECRET);
  assert.deepEqual(f.calls[0].args, ["store", "--label=canli-mcp TIINGO_API_KEY", "service", "canli-mcp", "name", "TIINGO_API_KEY"]);
  assert.equal(f.calls[0].input, SECRET);
  assert.equal(chain.read("TIINGO_API_KEY"), SECRET);
  const missing = keychain({ platform: "linux", spawn: () => ({ status: -1, stdout: "", stderr: "spawn secret-tool ENOENT" }) });
  assert.throws(() => missing.store("TIINGO_API_KEY", SECRET), /libsecret-tools/);
});

test("connect stores each of a provider's keys, the names file holds names only, and start-up reads them unless set", async () => {
  const h = home();
  try {
    const f = fakeSpawn();
    const chain = keychain({ platform: "darwin", spawn: f.spawn });
    assert.deepEqual(namesFor("alpaca"), ["ALPACA_API_KEY_ID", "ALPACA_API_SECRET_KEY"]);
    assert.deepEqual(namesFor("polygon"), ["MASSIVE_API_KEY"]);
    assert.deepEqual(namesFor("fmp"), ["FMP_API_KEY"], "an upstream preset's variable");
    const asked = [];
    const out = await connectCommand(h, ["alpaca"], { chain, env: { ALPACA_API_KEY_ID: "already" }, ask: async (name) => { asked.push(name); return `${SECRET}-${name}`; } });
    assert.deepEqual(asked, ["ALPACA_API_KEY_ID", "ALPACA_API_SECRET_KEY"]);
    assert.deepEqual(out.stored, ["ALPACA_API_KEY_ID", "ALPACA_API_SECRET_KEY"]);
    assert.match(out.note, /ALPACA_API_KEY_ID is also set/);
    const file = readFileSync(path.join(h, "keychain.json"), "utf8");
    assert.ok(!file.includes(SECRET), "no value in the names file");
    assert.deepEqual(storedNames(h), ["ALPACA_API_KEY_ID", "ALPACA_API_SECRET_KEY"]);
    const env = { ALPACA_API_KEY_ID: "from the environment" };
    assert.deepEqual(loadKeys(env, h, { chain }), ["ALPACA_API_SECRET_KEY"]);
    assert.equal(env.ALPACA_API_KEY_ID, "from the environment", "a set variable wins");
    assert.equal(env.ALPACA_API_SECRET_KEY, `${SECRET}-ALPACA_API_SECRET_KEY`);
    assert.deepEqual(disconnectCommand(h, ["alpaca"], { chain }).removed, ["ALPACA_API_KEY_ID", "ALPACA_API_SECRET_KEY"]);
    assert.deepEqual(storedNames(h), []);
    assert.equal(f.items.size, 0);
    assert.deepEqual(loadKeys({}, h, { chain }), []);
  } finally { rmSync(h, { recursive: true, force: true }); }
});

test("an empty key stores nothing, an unknown name is refused, and a platform with no keychain says to set the variable", async () => {
  const h = home();
  try {
    const f = fakeSpawn();
    const chain = keychain({ platform: "darwin", spawn: f.spawn });
    await assert.rejects(connectCommand(h, ["finnhub"], { chain, env: {}, ask: async () => "  " }), /No value given for FINNHUB_API_KEY/);
    assert.equal(f.calls.length, 0);
    assert.throws(() => namesFor("not_a_name"), /No provider or variable/);
    assert.equal(keychain({ platform: "win32" }), null);
    await assert.rejects(connectCommand(h, ["finnhub"], { chain: null, env: {}, ask: async () => SECRET }), /Set FINNHUB_API_KEY in the environment/);
    assert.deepEqual(loadKeys({}, h, { chain: null }), []);
    assert.equal((await connectCommand(h, ["--list"], { chain, env: {} })).keychain, "the macOS Keychain");
  } finally { rmSync(h, { recursive: true, force: true }); }
});
