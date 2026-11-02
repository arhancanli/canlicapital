import test from "node:test";
import assert from "node:assert/strict";

import { decodeString, POWERS, powersIn, scanCode, scheduleCheck, tokenCheck } from "../src/token.mjs";
import { createSession } from "../src/sources.mjs";

// Keccak-256, so the table of selectors is checked against the signatures it names.
function keccak(text) {
  const RC = [0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n, 0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n, 0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an, 0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n, 0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an, 0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n];
  const ROT = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14], M = (1n << 64n) - 1n;
  const rol = (x, n) => (n === 0 ? x : ((x << BigInt(n)) | (x >> BigInt(64 - n))) & M);
  const rate = 136, bytes = [...Buffer.from(text)];
  bytes.push(1);
  while (bytes.length % rate) bytes.push(0);
  bytes[bytes.length - 1] |= 0x80;
  const s = new Array(25).fill(0n);
  for (let i = 0; i < rate / 8; i += 1) { let w = 0n; for (let b = 7; b >= 0; b -= 1) w = (w << 8n) | BigInt(bytes[i * 8 + b]); s[i] ^= w; }
  for (const rc of RC) {
    const c = [0, 1, 2, 3, 4].map((x) => s[x] ^ s[x + 5] ^ s[x + 10] ^ s[x + 15] ^ s[x + 20]);
    for (let x = 0; x < 5; x += 1) { const d = c[(x + 4) % 5] ^ rol(c[(x + 1) % 5], 1); for (let y = 0; y < 5; y += 1) s[x + 5 * y] ^= d; }
    const b = new Array(25);
    for (let x = 0; x < 5; x += 1) for (let y = 0; y < 5; y += 1) b[y + 5 * ((2 * x + 3 * y) % 5)] = rol(s[x + 5 * y], ROT[x + 5 * y]);
    for (let x = 0; x < 5; x += 1) for (let y = 0; y < 5; y += 1) s[x + 5 * y] = b[x + 5 * y] ^ (~b[(x + 1) % 5 + 5 * y] & M & b[(x + 2) % 5 + 5 * y]);
    s[0] ^= rc;
  }
  let out = "";
  for (let b = 0; b < 8; b += 1) out += ((s[0] >> BigInt(8 * b)) & 0xffn).toString(16).padStart(2, "0");
  return out;
}
const push4 = (...sel) => sel.map((x) => `63${x}`).join("");
const word = (hex) => `0x${hex.padStart(64, "0")}`;
const string = (t) => `0x${(32).toString(16).padStart(64, "0")}${t.length.toString(16).padStart(64, "0")}${Buffer.from(t).toString("hex").padEnd(64, "0")}`;
const ADDR = "0x1111111111111111111111111111111111111111", IMPL = "2222222222222222222222222222222222222222";

function chain({ code, slots = {}, implCode = "", calls = {}, codes = {} }) {
  return async (url, init) => {
    if (String(url).includes("sourcify")) return new Response(JSON.stringify({ match: "exact_match" }), { status: 200 });
    if (String(url).includes("coingecko")) return new Response(JSON.stringify({ market_data: { circulating_supply: calls.circulating ?? 600, max_supply: 1000, market_cap: { usd: 6000 }, fully_diluted_valuation: { usd: 10000 } } }), { status: 200 });
    const { method, params } = JSON.parse(init.body);
    const answer = (result) => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), { status: 200 });
    if (method === "eth_getCode") return answer(params[0].toLowerCase() === ADDR ? code : params[0].slice(2).toLowerCase() === IMPL ? implCode : (codes[params[0].toLowerCase()] ?? "0x"));
    if (method === "eth_getStorageAt") return answer(slots[params[1]] ?? word("0"));
    const sel = params[0].data.slice(2);
    const table = { "06fdde03": string("Test Token"), "95d89b41": string("TST"), "313ce567": word("12"), "18160ddd": word((1000n * 10n ** 18n).toString(16)), ...calls.table };
    if (sel in table) return table[sel] === null ? new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: 3, message: "execution reverted" } }), { status: 200 }) : answer(table[sel]);
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: 3, message: "execution reverted" } }), { status: 200 });
  };
}
const session = (fetchImpl) => createSession({ fetchImpl, now: () => Date.parse("2026-11-01"), env: {} });
const OLD_SLOT = "0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3";

test("every selector in the table is the hash of the signature beside it", () => {
  for (const p of Object.values(POWERS)) for (const [sel, sig] of Object.entries(p.functions)) assert.equal(keccak(sig).slice(0, 8), sel, sig);
});

test("the code is walked: a selector inside PUSH data is not a function, and delegatecall is seen", () => {
  const data = `7f${"40c10f19".padEnd(64, "0")}`; // PUSH32 holding mint's bytes
  assert.equal(scanCode(`0x${data}00`).selectors.has("40c10f19"), false);
  assert.equal(scanCode(`0x${push4("40c10f19")}00`).selectors.has("40c10f19"), true);
  assert.equal(scanCode("0x6000f4").delegates, true);
  assert.equal(scanCode("0x63f4f4f4f400").delegates, false, "f4 as data is not an opcode");
  assert.deepEqual(powersIn(new Set(["cc872b66"])).found, { mint: ["issue(uint256)"] }, "USDT's issue counts as minting");
});

test("a plain token: what it can do, its owner, and the supply", async () => {
  const code = `0x${push4("a9059cbb", "40c10f19", "8456cb59")}00`;
  const r = await tokenCheck(session(chain({ code, calls: { table: { "8da5cb5b": word("ab".repeat(20)) } } })), { address: ADDR });
  assert.equal(r.token.symbol, "TST");
  assert.equal(r.supply.on_chain_total, 1000, "0x12 is 18 decimals");
  assert.deepEqual(r.contract.powers, { mint: true, pause: true, blacklist: false, upgrade: false, set_fees: false });
  assert.equal(r.contract.proxy, false);
  assert.equal(r.contract.owner_renounced, false);
  assert.ok(r.flags.some((f) => /create new tokens/.test(f)));
  assert.ok(r.flags.some((f) => /stop all transfers/.test(f)));
});

test("an old-style proxy: the code behind it is what gets read (the way USDC is built)", async () => {
  const r = await tokenCheck(session(chain({ code: `0x${push4("3659cfe6")}f400`, implCode: `0x${push4("a9059cbb", "40c10f19", "f9f92be4", "8456cb59")}00`, slots: { [OLD_SLOT]: word(IMPL) } })), { address: ADDR });
  assert.equal(r.contract.proxy, true);
  assert.equal(r.contract.implementation, `0x${IMPL}`);
  assert.deepEqual(r.contract.powers, { mint: true, pause: true, blacklist: true, upgrade: true, set_fees: false });
});

test("fails closed: a contract that hands calls to code that cannot be found has unknown powers, never none", async () => {
  const r = await tokenCheck(session(chain({ code: "0x6000f400" })), { address: ADDR });
  assert.equal(r.contract.powers_read, false);
  assert.deepEqual(r.contract.powers, { mint: null, pause: null, blacklist: null, upgrade: null, set_fees: null });
  assert.match(r.plain_reading, /could not be read/);
  assert.doesNotMatch(r.plain_reading, /None of the standard functions/);
  assert.ok(r.flags.some((f) => /unknown/.test(f)));
});

test("a clean reading says so without calling it safe", async () => {
  const r = await tokenCheck(session(chain({ code: `0x${push4("a9059cbb")}00`, calls: { circulating: 1000 } })), { address: ADDR });
  assert.match(r.plain_reading, /does not make it safe/);
  assert.equal(r.flags.length, 0);
  assert.ok(r.limits.some((l) => /does not mean safe/.test(l)));
});

test("the schedule against the chain: more than announced, unscheduled tokens, and a heavy year ahead", () => {
  const today = "2026-11-01";
  assert.match(scheduleCheck({ total: 1200, circulating: 500, announcedMax: 1000, schedule: null, today }).flags[0], /more than the 1,000 announced/);
  const gap = scheduleCheck({ total: 1000, circulating: 500, announcedMax: null, schedule: [{ date: "2026-12-01", amount: 100 }, { date: "2025-01-01", amount: 999 }], today });
  assert.equal(gap.check.scheduled_ahead, 100, "past unlocks are not ahead");
  assert.equal(gap.check.total_minus_that, 400);
  assert.ok(gap.flags.some((f) => /neither circulating nor on the announced schedule/.test(f)));
  const over = scheduleCheck({ total: 1000, circulating: 900, announcedMax: null, schedule: [{ date: "2027-01-01", amount: 300 }], today });
  assert.ok(over.flags.some((f) => /would have to be minted/.test(f)));
  assert.ok(over.flags.some((f) => /Unlocks in the next year come to 33%/.test(f)));
  const many = scheduleCheck({ total: 1000, circulating: 5000, announcedMax: null, schedule: [{ date: "2027-01-01", amount: 1 }], today });
  assert.equal(many.check.total_minus_that, undefined, "a token on many chains is not compared against one chain's total");
});

test("refusals and small readers", async () => {
  await assert.rejects(() => tokenCheck(session(chain({ code: "0x" })), { address: ADDR }), /no contract/);
  await assert.rejects(() => tokenCheck(session(chain({ code: "0x6000", calls: { table: { "313ce567": null } } })), { address: ADDR }), /does not answer as an ERC-20/);
  await assert.rejects(() => tokenCheck(session(chain({ code: "0x6000" })), { address: "nope" }), /contract address/);
  assert.equal(decodeString(string("USD Coin")), "USD Coin");
  assert.equal(decodeString(`0x${Buffer.from("MKR").toString("hex").padEnd(64, "0")}`), "MKR", "the old bytes32 kind");
  assert.equal(decodeString("0x"), null);
});
