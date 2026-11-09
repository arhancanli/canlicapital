// One value of an answer proved without the rest of it. Every value in an answer is a leaf: its JSON Pointer
// (RFC 6901) and the value, as the canonical JSON of [pointer, value] (RFC 8785), in the order of the answer's own
// canonical JSON (keys sorted, lists in order). An empty object or list is a leaf too, so the answer's shape is in
// the tree. The leaves make a Merkle tree the way Certificate Transparency builds its logs (RFC 9162: SHA-256, 0x00
// before a leaf, 0x01 before two children), as Canli Books proves its entries. A receipt that carries the root, signed
// as the hosted server signs it, then proves any one value with about log2(n) hashes, twenty for a million values,
// and those hashes say nothing about the others.
import * as crypto from "node:crypto";

// crypto.hash, one call a hash, is about a third faster for short inputs than createHash, which Node before 20.12
// alone has.
const quick = (() => {
  try {
    return Buffer.isBuffer(crypto.hash("sha256", "", "buffer"));
  } catch {
    return false;
  }
})();
const digest = quick ? (bytes) => crypto.hash("sha256", bytes, "buffer") : (bytes) => crypto.createHash("sha256").update(bytes).digest();
const leafHash = (pointer, value) => digest(Buffer.from(`\u0000${JSON.stringify([pointer, value])}`, "utf8"));
const nodeHash = (left, right) => {
  const bytes = Buffer.allocUnsafe(65);
  bytes[0] = 1;
  left.copy(bytes, 1);
  right.copy(bytes, 33);
  return digest(bytes);
};
const escape = (key) => key.replace(/~/g, "~0").replace(/\//g, "~1");
const isContainer = (v) => v !== null && typeof v === "object";

// The answer's values as [pointer, value], in canonical order. The answer is read as the JSON a client gets, so a
// value JSON leaves out (undefined, a function) is not in the tree and one it changes (NaN to null) is as sent.
export function valuesOf(answer) {
  const out = [];
  const walk = (v, pointer) => {
    if (Array.isArray(v)) {
      if (!v.length) out.push([pointer, []]);
      v.forEach((x, i) => walk(x, `${pointer}/${i}`));
    } else if (isContainer(v)) {
      const keys = Object.keys(v).sort();
      if (!keys.length) out.push([pointer, {}]);
      for (const k of keys) walk(v[k], `${pointer}/${escape(k)}`);
    } else out.push([pointer, v]);
  };
  const text = JSON.stringify(answer);
  walk(text === undefined ? null : JSON.parse(text), "");
  return out;
}

// Each level of the tree, leaves first. Pairing neighbours and lifting a last odd one gives RFC 9162's tree, whose
// left side is always the largest power of two.
function levels(values) {
  const all = [values.map(([p, v]) => leafHash(p, v))];
  while (all[all.length - 1].length > 1) {
    const below = all[all.length - 1];
    const up = [];
    for (let i = 0; i + 1 < below.length; i += 2) up.push(nodeHash(below[i], below[i + 1]));
    if (below.length % 2) up.push(below[below.length - 1]);
    all.push(up);
  }
  return all;
}

// An answer's tree, built once: its root, how many values it holds, and a proof for any of its values. Building it
// takes about 1.6 µs a value (80 ms for 50,000); each proof after that is a lookup and a walk up the levels.
export function answerTree(answer) {
  const values = valuesOf(answer);
  const tree = levels(values);
  const root = tree[tree.length - 1][0].toString("hex");
  // A proof that the value at `pointer` is in the answer: the value, where it sits, and the sibling hashes from it up
  // to the root (RFC 9162, section 2.1.3.1). A value is proved, not an object or a list as a whole.
  const prove = (pointer) => {
    const index = values.findIndex(([p]) => p === pointer);
    if (index < 0) {
      const under = (prefix) => values.filter(([p]) => p.startsWith(`${prefix}/`)).slice(0, 3).map(([p]) => p);
      const inside = under(pointer);
      if (inside.length) throw new Error(`${pointer} holds more than one value: prove one of them, such as ${inside.join(" or ")}`);
      // The values of the nearest object or list that is there, as examples.
      let near = [];
      for (let up = pointer; up && !near.length;) near = under((up = up.slice(0, Math.max(0, up.lastIndexOf("/")))));
      throw new Error(`The answer has no value at ${JSON.stringify(pointer)}: give a JSON Pointer to one value${near.length ? `, such as ${near.join(" or ")}` : ""}`);
    }
    const path = [];
    let i = index;
    for (const level of tree.slice(0, -1)) {
      if (i % 2) path.push(level[i - 1]);
      else if (i + 1 < level.length) path.push(level[i + 1]);
      i = Math.floor(i / 2);
    }
    return { pointer, value: values[index][1], index, values: values.length, path: path.map((h) => h.toString("hex")), root };
  };
  return { root, values: values.length, prove };
}

// The root of an answer's tree and how many values it holds.
export function answerRoot(answer) {
  const { root, values } = answerTree(answer);
  return { values, root };
}

export const proveValue = (answer, pointer) => answerTree(answer).prove(pointer);

// Checks a proof (RFC 9162, section 2.1.3.2): the value's leaf, where it sits and its path must lead to the root. A
// path does not fix how many values the tree holds (a proof for 7 can pass as one for 8), so, as Certificate
// Transparency signs a tree's size with its root, the root and the count to check against are a receipt's
// (output_root and output_values, under its signature). Whether the receipt is the server's is for the signature.
export function checkValue(proof, receipt = {}) {
  const { pointer, value, index, values, path, root } = proof ?? {};
  if (typeof pointer !== "string" || !Object.hasOwn(proof, "value")) return { ok: false, problem: "the proof names no pointer and value" };
  if (receipt.root !== undefined && root !== receipt.root) return { ok: false, problem: "the proof's root is not the receipt's" };
  if (receipt.values !== undefined && values !== receipt.values) return { ok: false, problem: `the proof is for ${values} values, the receipt for ${receipt.values}` };
  if (isContainer(value) && Object.keys(value).length) return { ok: false, problem: "a proof is of one value, not an object or a list" };
  if (!Number.isInteger(values) || !Number.isInteger(index) || index < 0 || index >= values) return { ok: false, problem: `value ${index} cannot be among ${values}` };
  if (!Array.isArray(path) || path.some((h) => typeof h !== "string" || !/^[0-9a-f]{64}$/.test(h))) return { ok: false, problem: "the path is not a list of SHA-256 hashes" };
  if (typeof root !== "string" || !/^[0-9a-f]{64}$/.test(root)) return { ok: false, problem: "the root is not a SHA-256 hash" };
  let fn = index;
  let sn = values - 1;
  let r = leafHash(pointer, value);
  for (const h of path) {
    if (sn === 0) return { ok: false, problem: "the path is longer than the tree" };
    const sibling = Buffer.from(h, "hex");
    if (fn % 2 === 1 || fn === sn) {
      r = nodeHash(sibling, r);
      while (fn % 2 === 0 && fn !== 0) {
        fn = Math.floor(fn / 2);
        sn = Math.floor(sn / 2);
      }
    } else r = nodeHash(r, sibling);
    fn = Math.floor(fn / 2);
    sn = Math.floor(sn / 2);
  }
  if (sn !== 0 || r.toString("hex") !== root) return { ok: false, problem: "the path does not lead to the root" };
  return { ok: true, pointer, value, root, values };
}
