// The answer tree (answer-tree.mjs): one value of an answer proved with a short path to a root a signed receipt
// carries. The tree is checked against RFC 9162's own recursive definition, which is checked in turn on Certificate
// Transparency's test vectors, so the two cannot share a mistake.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { answerRoot, checkValue, proveValue, valuesOf } from "../src/answer-tree.mjs";

const sha = (...parts) => createHash("sha256").update(Buffer.concat(parts)).digest();
const leaf = (data) => sha(Buffer.from([0]), data);
const node = (left, right) => sha(Buffer.from([1]), left, right);
const split = (n) => {
  let k = 1;
  while (k * 2 < n) k *= 2;
  return k;
};
// RFC 9162, section 2.1.1 (MTH) and 2.1.3.1 (PATH), as written there.
const mth = (ls) => (ls.length === 1 ? ls[0] : node(mth(ls.slice(0, split(ls.length))), mth(ls.slice(split(ls.length)))));
const auditPath = (m, ls) => {
  if (ls.length === 1) return [];
  const k = split(ls.length);
  return m < k ? [...auditPath(m, ls.slice(0, k)), mth(ls.slice(k))] : [...auditPath(m - k, ls.slice(k)), mth(ls.slice(0, k))];
};
const hex = (b) => b.toString("hex");
const leafOf = (pointer, value) => leaf(Buffer.from(JSON.stringify([pointer, value]), "utf8"));

test("the reference tree gives Certificate Transparency's roots for its eight test leaves", () => {
  const data = ["", "00", "10", "2021", "3031", "40414243", "5051525354555657", "606162636465666768696a6b6c6d6e6f"].map((h) => Buffer.from(h, "hex"));
  const roots = ["6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d", "fac54203e7cc696cf0dfcb42c92a1d9dbaf70ad9e621f4bd8d98662f00e3c125", "aeb6bcfe274b70a14fb067a5e5578264db0fa9b51af5e0ba159158f329e06e77", "d37ee418976dd95753c1c73862b9398fa2a2cf9b4ff0fdfe8b30cd95209614b7", "4e3bbb1f7b478dcfe71fb631631519a3bca12c9aefca1612bfce4c13a86264d4", "76e67dadbcdf1e10e1b74ddc608abd2f98dfb16fbce75277b5232a127f2087ef", "ddb89be403809e325750d3d263cd78929c2942b7942a34b77e122c9594a74c8c", "5dc9da79a70659a9ad559cb701ded9a2ab9d823aad2f4960cfe370eff4604328"];
  assert.deepEqual(roots.map((_, n) => hex(mth(data.slice(0, n + 1).map(leaf)))), roots);
});

test("an answer's root is RFC 9162's over its values, and every value's path is the RFC's and checks", () => {
  for (let n = 1; n <= 70; n++) {
    const answer = Array.from({ length: n }, (_, i) => i * 1.5);
    const leaves = answer.map((v, i) => leafOf(`/${i}`, v));
    const { root, values } = answerRoot(answer);
    assert.deepEqual([values, root], [n, hex(mth(leaves))], `${n} values`);
    for (let m = 0; m < n; m++) {
      const proof = proveValue(answer, `/${m}`);
      assert.deepEqual([proof.index, proof.value, proof.path], [m, m * 1.5, auditPath(m, leaves).map(hex)], `value ${m} of ${n}`);
      assert.deepEqual(checkValue(proof, { root, values }), { ok: true, pointer: `/${m}`, value: m * 1.5, root, values });
    }
  }
});

test("values are read as the JSON a client gets: keys sorted, pointers escaped, empty objects and lists kept", () => {
  const answer = { b: 1, a: { "x/y": [], "m~n": {} }, c: undefined, d: NaN, 10: true, 9: false, e: [{ f: "é" }, null] };
  assert.deepEqual(valuesOf(answer), [["/10", true], ["/9", false], ["/a/m~0n", {}], ["/a/x~1y", []], ["/b", 1], ["/d", null], ["/e/0/f", "é"], ["/e/1", null]]);
  assert.equal(answerRoot({ a: 1, b: [2, 3] }).root, answerRoot({ b: [2, 3], a: 1 }).root, "the order keys were written in does not matter");
  assert.notEqual(answerRoot({ a: 1, b: [2, 3] }).root, answerRoot({ a: 1, b: [3, 2] }).root, "the order of a list does");
  assert.notEqual(answerRoot({ a: { b: 1 } }).root, answerRoot({ "a/b": 1 }).root, "a key with a slash is not a level");
  assert.deepEqual(valuesOf(7), [["", 7]], "an answer that is one value is one leaf");
  const proof = proveValue(answer, "/a/x~1y");
  assert.deepEqual([proof.value, checkValue(proof).ok], [[], true], "an empty list is proved as such");
});

test("a changed value, place, count, path or root does not check, and only one value is proved", () => {
  const answer = { name: "Example Inc.", revenue: [1200, 1350, 1500], cash: 300, debt: 120, notes: { auditor: "Example LLP" } };
  const proof = proveValue(answer, "/revenue/1");
  const receipt = { root: proof.root, values: proof.values };
  assert.equal(checkValue(proof, receipt).ok, true);
  const fails = (change) => checkValue({ ...proof, ...change }, receipt).problem;
  assert.equal(fails({ value: 1351 }), "the path does not lead to the root");
  assert.equal(fails({ value: "1350" }), "the path does not lead to the root", "the number's type is part of the value");
  assert.equal(fails({ pointer: "/revenue/2" }), "the path does not lead to the root");
  assert.deepEqual([fails({ index: proof.index - 1 }), fails({ index: proof.index + 1 })], ["the path does not lead to the root", "the path is longer than the tree"]);
  assert.equal(fails({ index: proof.values }), `value ${proof.values} cannot be among ${proof.values}`);
  // A path does not fix the count: the proof for 7 values passes as one for 8 unless the count is the receipt's.
  assert.equal(checkValue({ ...proof, values: proof.values + 1 }).ok, true);
  assert.equal(fails({ values: proof.values + 1 }), `the proof is for ${proof.values + 1} values, the receipt for ${proof.values}`);
  assert.equal(checkValue(proof, { ...receipt, root: "0".repeat(64) }).problem, "the proof's root is not the receipt's");
  assert.equal(fails({ path: proof.path.slice(1) }), "the path does not lead to the root");
  assert.equal(fails({ path: [...proof.path, "0".repeat(64)] }), "the path is longer than the tree");
  assert.equal(fails({ path: ["xyz"] }), "the path is not a list of SHA-256 hashes");
  assert.equal(checkValue({ ...proof, root: "0".repeat(64) }).problem, "the path does not lead to the root");
  assert.equal(checkValue({ ...proof, root: undefined }).problem, "the root is not a SHA-256 hash");
  assert.equal(fails({ value: { auditor: "Example LLP" }, pointer: "/notes" }), "a proof is of one value, not an object or a list");
  assert.equal(checkValue(undefined).problem, "the proof names no pointer and value");
  assert.throws(() => proveValue(answer, "/notes"), /\/notes holds more than one value: prove one of them, such as \/notes\/auditor/);
  assert.throws(() => proveValue(answer, "/revenue/3"), /The answer has no value at "\/revenue\/3"/);
  // The hashes in a path say nothing about the other values: none of them is a leaf's hash.
  const leaves = new Set(valuesOf(answer).map(([p, v]) => hex(leafOf(p, v))));
  assert.equal(proveValue(answer, "/cash").path.some((h) => leaves.has(h) && h !== hex(leafOf("/debt", 120))), false);
});
