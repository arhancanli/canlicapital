// size_position as the local server runs it: the core's sizing, the trader's limits file as the
// ceiling on every cap, the drawdown policy the file can require, and the lean schema clients see.
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { sizePosition } from "../src/core/js/sizing-core.js";
import { SIZE_LIMITS, SIZE_POSITION_DESCRIPTION, SIZE_POSITION_JSON, sizePositionInput } from "../src/size-position.mjs";
import { createSession, toolCheckOrders, toolSizePosition } from "../src/server.mjs";

function session(files = {}) {
  const home = mkdtempSync(join(tmpdir(), "canli-size-"));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(home, name), JSON.stringify(body));
  return createSession({ home, toolsets: ["plan"] });
}
const size = async (s, args) => (await toolSizePosition(s, args)).structuredContent;
const ARGS = { side: "buy", asset_class: "us_equity", equity: 1e6, price: 100, vol: { daily: 0.02 }, lot_size: 1, budget: { method: "fixed_fraction", fraction: 0.3 }, caps: { max_position_frac: 0.25 } };

test("the result is the core's sizing, with the effective caps and their digest", async () => {
  const out = await size(session(), ARGS);
  const core = sizePosition({ ...ARGS, caps: ARGS.caps });
  assert.equal(out.position_qty, core.position_qty);
  assert.deepEqual(out.orders, core.orders);
  assert.equal(out.binding_constraint, "position_cap");
  assert.equal(out.position_usd, 250000);
  assert.deepEqual(out.effective_caps, { max_position_frac: 0.25 });
  assert.deepEqual(out.limits, SIZE_LIMITS);
  assert.equal(out.limits_file, null);
});

test("the limits file is the ceiling: a call's looser cap is ignored, a tighter one binds", async () => {
  const s = session({ "limits.json": { max_position_frac: 0.1 } });
  const loose = await size(s, { ...ARGS, caps: { max_position_frac: 0.9 } });
  assert.equal(loose.position_usd, 100000);
  assert.deepEqual(loose.effective_caps, { max_position_frac: 0.1 });
  assert.equal((await size(s, { ...ARGS, caps: { max_position_frac: 0.05 } })).position_usd, 50000);
  assert.equal((await size(s, { ...ARGS, caps: undefined })).position_usd, 100000, "the file alone is enough");
  await assert.rejects(size(session(), { ...ARGS, caps: undefined }), /max_position_frac is required/);
});

test("a limits file that requires drawdown state refuses a size without it, and the digest matches check_orders'", async () => {
  const s = session({ "limits.json": { max_position_frac: 0.2, require_drawdown_state: true } });
  await assert.rejects(size(s, ARGS), /require drawdown state/);
  const out = await size(s, { ...ARGS, drawdown: { current_dd: 0.12, half_at: 0.1, flat_at: 0.2 } });
  assert.deepEqual(out.drawdown, { state: "half", multiplier: 0.5 });
  assert.equal(out.binding_constraint, "budget");
  assert.equal(out.position_usd, 150000);
  const check = (await toolCheckOrders(s, { asset_class: "us_equity", market: { X: { price: 1 } }, orders: [{ symbol: "X", side: "buy", qty: 1 }] })).structuredContent;
  assert.equal(out.limits_digest, check.limits_digest, "both tools bind to the same limits");
});

test("malformed calls are refused with the field named", async () => {
  await assert.rejects(size(session(), { ...ARGS, vol: {} }), /vol: give daily or annual/);
  await assert.rejects(size(session(), { ...ARGS, budget: { method: "kelly" } }), /budget\.method/);
  await assert.rejects(size(session(), { ...ARGS, leverage: 3 }), /Unrecognized key/);
  await assert.rejects(size(session(), { ...ARGS, drawdown: { current_dd: 1.5, half_at: 0.1, flat_at: 0.2 } }), /drawdown\.current_dd/);
});

test("the published schema names exactly the fields the validator accepts, and stays small", async () => {
  const { z } = await import("zod");
  const shape = (schema) => {
    if (!schema || typeof schema !== "object") return null;
    const out = {};
    if (schema.properties) out.properties = Object.fromEntries(Object.entries(schema.properties).map(([k, v]) => [k, shape(v)]));
    if (schema.enum) out.enum = [...schema.enum].sort();
    if (schema.required) out.required = [...schema.required].sort();
    return out;
  };
  assert.deepEqual(shape(SIZE_POSITION_JSON), shape(z.toJSONSchema(sizePositionInput, { io: "input" })));
  const chars = SIZE_POSITION_DESCRIPTION.length + JSON.stringify(SIZE_POSITION_JSON).length;
  // Measured 2026-09-28 with the family bench: 447 o200k.
  assert.ok(chars < 1850, `${chars} characters`);
});

test("no output or description uses advice words", async () => {
  const outs = [await size(session(), ARGS), await size(session(), { ...ARGS, drawdown: { current_dd: 0.3, half_at: 0.1, flat_at: 0.2 } })];
  for (const text of [...outs.map((o) => JSON.stringify(o)), SIZE_POSITION_DESCRIPTION]) assert.doesNotMatch(text, /\b(should|recommend\w*|READY|eligible|Kelly|optimal)\b/i);
});
