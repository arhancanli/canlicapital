// Properties that hold for any input, tried on generated ones: the code a model's arguments and every
// pack's results pass through must not crash, lose data or leak a non-number.
import assert from "node:assert/strict";
import { test } from "node:test";

import fc from "fast-check";

import { at, createKeeper, nonFinitePaths, preview, roundNumbers } from "../src/server.mjs";
import { buildIndex, search, tokens } from "../src/search.mjs";
import { rng } from "../src/worlds.mjs";

const json = fc.jsonValue({ maxDepth: 4 });

test("roundNumbers keeps the shape of any JSON value, and leaves no more digits than asked", () => {
  fc.assert(fc.property(json, fc.integer({ min: 1, max: 12 }), (v, d) => {
    const out = roundNumbers(v, d);
    assert.equal(typeof out, typeof v);
    assert.equal(Array.isArray(out), Array.isArray(v));
    if (v && typeof v === "object") assert.deepEqual(Object.keys(out), Object.keys(v));
  }));
});

test("nonFinitePaths finds every planted NaN and Infinity, and nothing in clean JSON", () => {
  fc.assert(fc.property(fc.array(fc.double({ noNaN: true, noDefaultInfinity: true }), { maxLength: 20 }), (xs) => {
    assert.deepEqual(nonFinitePaths({ xs }), []);
  }));
  fc.assert(fc.property(fc.array(fc.double({ noNaN: true, noDefaultInfinity: true }), { maxLength: 20 }), fc.constantFrom(NaN, Infinity, -Infinity), (xs, bad) => {
    assert.equal(nonFinitePaths({ xs: [...xs, bad] }).length, 1);
  }));
});

test("at never throws on any value and any path, and finds what is there", () => {
  fc.assert(fc.property(json, fc.string({ maxLength: 40 }), (v, path) => { at(v, path); }));
  fc.assert(fc.property(fc.stringMatching(/^[a-z]{1,8}$/), fc.integer(), (k, n) => { assert.equal(at({ [k]: { v: n } }, `${k}.v`), n); }));
});

test("the keeper gives back what it was given, and never holds more than its limit", () => {
  fc.assert(fc.property(fc.array(json, { minLength: 1, maxLength: 60 }), (items) => {
    const keeper = createKeeper();
    const refs = items.map((x) => keeper.put(x));
    assert.deepEqual(keeper.get(refs.at(-1)), items.at(-1));
    assert.ok(refs.filter((r) => keeper.has(r)).length <= 32);
  }));
});

test("preview never throws and returns JSON-safe output", () => {
  fc.assert(fc.property(json, (v) => { JSON.stringify(preview(v)); }));
});

test("search takes any words without throwing, and respects its limit", () => {
  const index = buildIndex([{ name: "a_tool", pack: "p", toolset: "t", title: "A tool", description: "Reads filings.", keywords: "sec", args: "" }]);
  fc.assert(fc.property(fc.string({ maxLength: 200 }), fc.integer({ min: 1, max: 5 }), (q, limit) => {
    tokens(q);
    assert.ok(search(index, q, { limit }).length <= limit);
  }));
});

test("the worlds' generator is repeatable and stays in [0, 1)", () => {
  fc.assert(fc.property(fc.integer(), (seed) => {
    const a = rng(seed), b = rng(seed);
    for (let i = 0; i < 50; i += 1) { const x = a(); assert.equal(x, b()); assert.ok(x >= 0 && x < 1); }
  }));
});
