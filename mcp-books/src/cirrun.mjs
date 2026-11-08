// mcp-books/src/cirrun.mjs
//
// What Cirrun runs cost, recorded from their signed receipts. Cirrun ends every run with a receipt signed with
// Ed25519 over Python's json.dumps(receipt, sort_keys=True, separators=(",", ":"), ensure_ascii=False); the file
// on disk is the same receipt indented. A receipt is checked here as cirrun.com/verify checks it (site/verify.js
// in Cirrun, tested there against the Python side): each number keeps its text and is written back the way
// Python writes the value it reads from that text, so the bytes checked are the bytes that were signed. Only the
// receipt and its signature are checked, not the run's outputs (`cirrun verify` does that): the cost is inside
// the signed receipt. Costs are added as exact decimals from their text, never as floating point.
import { createHash, createPublicKey, verify } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { fromMinor, minorUnits, state } from "./ledger.mjs";

// JSON read with each number's text kept: { o: Map } | { a: [] } | { s } | { w } | { n: text }.
export function parseKeepingNumbers(text) {
  let i = 0;
  const n = text.length;
  const NUM = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][-+]?\d+)?/y;
  const WORDS = ["true", "false", "null", "NaN", "Infinity", "-Infinity"];
  const fail = (what) => {
    throw new SyntaxError(`not valid JSON (${what} at character ${i})`);
  };
  const ws = () => {
    while (i < n && " \t\n\r".includes(text[i])) i++;
  };
  const str = () => {
    const start = i++;
    while (i < n && text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
    if (i >= n) fail("an unfinished string");
    i++;
    return JSON.parse(text.slice(start, i)); // refuses raw control characters, as Python does
  };
  const value = () => {
    ws();
    const c = text[i];
    if (c === "{" || c === "[") {
      i++;
      ws();
      const close = c === "{" ? "}" : "]";
      const node = c === "{" ? { o: new Map() } : { a: [] };
      if (text[i] === close) {
        i++;
        return node;
      }
      for (;;) {
        if (node.o) {
          ws();
          if (text[i] !== '"') fail("a name");
          const k = str();
          ws();
          if (text[i] !== ":") fail("a colon");
          i++;
          node.o.set(k, value()); // a repeated name keeps its last value, as in Python
        } else node.a.push(value());
        ws();
        if (text[i] === ",") i++;
        else if (text[i] === close) {
          i++;
          return node;
        } else fail("a comma");
      }
    }
    if (c === '"') return { s: str() };
    const word = WORDS.find((w) => text.startsWith(w, i));
    if (word) {
      i += word.length;
      return { w: word };
    }
    NUM.lastIndex = i;
    const num = NUM.exec(text);
    if (!num) fail("a value");
    i = NUM.lastIndex;
    return { n: num[0] };
  };
  const v = value();
  ws();
  if (i !== n) fail("text after the end");
  return v;
}

// Python's repr of the float or int read from this number's text.
export function pyNum(t) {
  if (!/[.eE]/.test(t)) return BigInt(t).toString();
  const x = Number(t);
  if (x === Infinity || x === -Infinity) return x > 0 ? "Infinity" : "-Infinity";
  const sign = x < 0 || Object.is(x, -0) ? "-" : "";
  if (x === 0) return `${sign}0.0`;
  const m = /^(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/.exec(String(Math.abs(x))); // shortest digits that read back as x
  const all = m[1] + (m[2] ?? "");
  const lead = all.length - all.replace(/^0+/, "").length;
  const digits = all.slice(lead).replace(/0+$/, "");
  const point = m[1].length + (m[3] ? Number.parseInt(m[3], 10) : 0) - lead;
  if (point > -4 && point <= 16) { // Python writes these without an exponent
    if (point <= 0) return `${sign}0.${"0".repeat(-point)}${digits}`;
    if (point >= digits.length) return `${sign}${digits}${"0".repeat(point - digits.length)}.0`;
    return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
  }
  const exp = point - 1;
  return `${sign}${digits[0]}${digits.length > 1 ? `.${digits.slice(1)}` : ""}e${exp < 0 ? "-" : "+"}${String(Math.abs(exp)).padStart(2, "0")}`;
}

const ESC = { "\\": "\\\\", '"': '\\"', "\b": "\\b", "\f": "\\f", "\n": "\\n", "\r": "\\r", "\t": "\\t" };
const pyStr = (s) => `"${s.replace(/[\\"\u0000-\u001f]/g, (c) => ESC[c] ?? `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`)}"`;
const byCodePoint = (a, b) => {
  const x = Array.from(a);
  const y = Array.from(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = x[i].codePointAt(0) - y[i].codePointAt(0);
    if (d) return d;
  }
  return x.length - y.length;
};

// The bytes Python signed, as text.
export function pyCanonical(v) {
  if (v.o) return `{${[...v.o.keys()].sort(byCodePoint).map((k) => `${pyStr(k)}:${pyCanonical(v.o.get(k))}`).join(",")}}`;
  if (v.a) return `[${v.a.map(pyCanonical).join(",")}]`;
  if ("s" in v) return pyStr(v.s);
  return v.w ?? pyNum(v.n);
}

// An Ed25519 public key's raw 32 bytes, from its PEM, or null for any other key.
const SPKI = Buffer.from("302a300506032b6570032100", "hex");
function rawKey(pem) {
  let key;
  try {
    key = createPublicKey(pem);
  } catch {
    return null;
  }
  if (key.asymmetricKeyType !== "ed25519") return null;
  const der = key.export({ type: "spki", format: "der" });
  return der.length === 44 && der.subarray(0, 12).equals(SPKI) ? { key, raw: der.subarray(12) } : null;
}
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

// A number's text as an exact decimal: { digits, scale } is digits / 10^scale.
function decimal(text) {
  const m = /^(\d+)(?:\.(\d+))?(?:[eE]([-+]?\d+))?$/.exec(String(text));
  if (!m) return null;
  let digits = BigInt(m[1] + (m[2] ?? ""));
  let scale = (m[2] ?? "").length - Number(m[3] ?? 0);
  if (scale < 0) {
    digits *= 10n ** BigInt(-scale);
    scale = 0;
  }
  return { digits, scale };
}
const align = (d, scale) => d.digits * 10n ** BigInt(scale - d.scale);
const add = (a, b) => {
  const scale = Math.max(a.scale, b.scale);
  return { digits: align(a, scale) + align(b, scale), scale };
};
const times = (a, b) => ({ digits: a.digits * b.digits, scale: a.scale + b.scale });
// Rounded half up to `places` decimals, as a whole number of the smallest unit.
function toUnits(d, places) {
  if (d.scale <= places) return d.digits * 10n ** BigInt(places - d.scale);
  const unit = 10n ** BigInt(d.scale - places);
  return d.digits / unit + (2n * (d.digits % unit) >= unit ? 1n : 0n);
}
function plain(d) {
  const text = d.digits.toString().padStart(d.scale + 1, "0");
  const whole = d.scale ? text.slice(0, -d.scale) : text;
  const fraction = d.scale ? text.slice(-d.scale).replace(/0+$/, "") : "";
  return fraction ? `${whole}.${fraction}` : whole;
}

// One receipt folder, as `cirrun share` writes it, checked against the key the caller trusts: { publicKeyPem } (the
// signer's public key, from the signer) or { fingerprint } (its 64 hex digits; the folder's signer.pem must be
// that key, as `cirrun verify --key <fingerprint>` asks). Returns the run, or throws naming what is wrong.
export function readCirrunReceipt(folder, trust) {
  const dir = resolve(folder);
  const read = (name) => {
    const path = join(dir, name);
    if (!existsSync(path)) throw new Error(`${dir} has no ${name}: give the folder \`cirrun share\` made`);
    return readFileSync(path, "utf8");
  };
  let node;
  let signature;
  try {
    node = parseKeepingNumbers(read("receipt.json"));
    signature = JSON.parse(read("receipt.sig.json"));
  } catch (error) {
    throw new Error(error instanceof SyntaxError ? `${dir}: receipt.json or receipt.sig.json is not valid JSON` : error.message);
  }
  if (!node.o) throw new Error(`${dir}: receipt.json is not a receipt`);
  let signer;
  if (trust?.fingerprint) {
    signer = rawKey(read("signer.pem"));
    if (!signer || sha256(signer.raw) !== trust.fingerprint.toLowerCase()) throw new Error(`${dir}: signer.pem is not the key with that fingerprint, so this receipt is not trusted`);
  } else {
    signer = rawKey(trust?.publicKeyPem ?? "");
    if (!signer) throw new Error("The trusted key is not an Ed25519 public key");
  }
  const bytes = Buffer.from(pyCanonical(node), "utf8");
  const ok = signature?.alg === "ed25519" && typeof signature.sig === "string" && verify(null, bytes, signer.key, Buffer.from(signature.sig, "base64"));
  if (!ok) throw new Error(`${dir}: the signature does not match this receipt under the trusted key`);

  const field = (name) => node.o.get(name);
  const runId = field("run_id")?.s;
  if (typeof runId !== "string" || !/^[A-Za-z0-9._-]{1,100}$/.test(runId)) throw new Error(`${dir}: the receipt names no run`);
  const finished = Number(field("finished")?.n);
  if (!Number.isFinite(finished) || finished <= 0) throw new Error(`${dir}: the receipt has no finishing time`);
  const cost = (name) => {
    const v = field(name);
    if (v === undefined && name === "fee") return { digits: 0n, scale: 0 }; // receipts before fees had none
    const d = v?.n === undefined ? null : decimal(v.n);
    if (!d) throw new Error(`${dir}: ${name} is not an amount in dollars`);
    return d;
  };
  const wholesale = cost("wholesale_cost");
  const fee = cost("fee");
  const offer = field("offer")?.o;
  return {
    run_id: runId,
    finished: new Date(finished * 1000).toISOString(),
    outcome: field("outcome")?.s ?? null,
    provider: field("provider")?.s ?? null,
    gpu: offer?.get("gpu")?.s ?? null,
    seconds: field("seconds")?.n === undefined ? null : Number(field("seconds").n),
    wholesale_usd: plain(wholesale),
    fee_usd: plain(fee),
    usd: plain(add(wholesale, fee)),
    receipt_sha256: sha256(bytes),
    key: sha256(signer.raw),
  };
}

// Currencies pegged to the dollar at a fixed rate, used when no rate is given.
export const PEGS = Object.freeze({ AED: "3.6725", SAR: "3.75" });

// One entry for the runs the book does not have yet: `account` debited and `payFrom` credited with the wholesale
// cost plus Cirrun's fee, in the book's currency at `rate` (units per US dollar). A run is in the book when an entry
// that was not reversed names it, so the same runs given again add nothing. Returns { entry: null } with the reason
// when there is nothing to post.
export function cirrunEntry(book, runs, { account = "6300", payFrom = "2000", rate, date } = {}) {
  const s = state(book);
  for (const code of [account, payFrom]) if (!s.accounts.has(code)) throw new Error(`There is no account ${code} in this book`);
  const recorded = new Set(s.entries.filter((e) => !s.reversed.has(e.seq)).flatMap((e) => e.source?.cirrun?.runs?.map((r) => r.run_id) ?? []));
  const seen = new Map();
  for (const run of runs) {
    const before = seen.get(run.run_id);
    if (before && before.receipt_sha256 !== run.receipt_sha256) throw new Error(`Two different receipts name run ${run.run_id}`);
    seen.set(run.run_id, run);
  }
  const already = [...seen.keys()].filter((id) => recorded.has(id));
  const fresh = [...seen.values()].filter((r) => !recorded.has(r.run_id)).sort((a, b) => a.finished.localeCompare(b.finished));
  if (!fresh.length) return { entry: null, reason: "every run is already in the book", already };
  const months = [...new Set(fresh.map((r) => r.finished.slice(0, 7)))];
  if (months.length > 1 && !date) throw new Error(`These runs finished in ${months.join(" and ")}: record each month in its own call, or give the date`);
  const currency = s.currency;
  if (currency === "USD" && rate !== undefined && decimal(rate) && plain(decimal(rate)) !== "1") throw new Error("A book in US dollars takes no rate");
  const used = currency === "USD" ? "1" : rate ?? PEGS[currency];
  if (used === undefined) throw new Error(`Give the rate: ${currency} per US dollar on the runs' dates`);
  const r = decimal(used);
  if (!r || r.digits === 0n) throw new Error(`"${used}" is not a rate such as 3.6725`);
  const usd = fresh.reduce((total, run) => add(total, decimal(run.usd)), { digits: 0n, scale: 0 });
  const units = toUnits(times(usd, r), minorUnits(currency));
  if (units > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("The total is too large to keep exactly");
  const amount = fromMinor(Number(units), currency);
  const totals = { runs: fresh.length, usd: plain(usd), rate: currency === "USD" ? null : plain(r), amount, currency };
  if (units === 0n) return { entry: null, reason: `the runs cost ${plain(usd)} US dollars, which is ${amount} ${currency}`, already, totals };
  const ids = fresh.map((run) => run.run_id);
  const memo = `Cirrun: ${ids.length === 1 ? `run ${ids[0]}` : `${ids.length} runs, ${ids[0]} to ${ids.at(-1)}`}, ${plain(usd)} USD${currency === "USD" ? "" : ` at ${plain(r)} ${currency} per USD`}`;
  return {
    entry: {
      date: date ?? fresh.at(-1).finished.slice(0, 10),
      memo,
      lines: [{ account, debit: amount }, { account: payFrom, credit: amount }],
      source: { cirrun: { key: fresh[0].key, runs: fresh.map((run) => ({ run_id: run.run_id, receipt_sha256: run.receipt_sha256, usd: run.usd })) } },
    },
    already,
    totals,
  };
}
