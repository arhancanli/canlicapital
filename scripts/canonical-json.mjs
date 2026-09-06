// =============================================================================
// canonical-json.mjs
// -----------------------------------------------------------------------------
// ONE canonicalisation for every published `content_hash` on this site.
//
// WHY THIS FILE EXISTS. `reproduce.py` -- the kit a reader runs to check that the
// published record reproduces -- recomputes every artifact's hash with Python's
//
//     json.dumps(payload_without_content_hash, sort_keys=True, separators=(",", ":"))
//
// Seven generators carried their own copy-pasted `canonical()` that happened to
// agree with it. `build-paper-evidence-vectors.mjs` carried NO copy and hashed
// with a bare `JSON.stringify`, which preserves insertion order instead of
// sorting. Its artifact therefore never reproduced, L1 read 158/1, and because
// the nightly ceremony gates on L1 the whole publish halted -- OTS anchoring,
// capacity and founder commitments included. One generator missing a helper the
// other seven had duplicated took the ceremony down.
//
// That is the same shape as `normalizeEditableCopy`, which was pasted into three
// generators while the verifier had no copy at all. A helper that must agree
// across N call sites cannot live as N copies. It lives here.
//
// WHAT "CANONICAL" MEANS HERE, exactly, because two of these are traps:
//
//   * KEY ORDER -- recursively sorted, matching `sort_keys=True`. This is the one
//     the missing copy got wrong.
//   * SEPARATORS -- "," and ":" with no spaces, matching `separators=(",", ":")`.
//   * NON-ASCII -- escaped to \uXXXX, matching Python's default `ensure_ascii=True`.
//     JS `JSON.stringify` emits raw UTF-8 instead. For a pure-ASCII document the
//     two settings emit IDENTICAL bytes, so this divergence stays invisible until
//     the first accented character -- which is exactly how "Lopez de Prado" in one
//     contract halted the nightly for three nights.
//   * NUMBERS -- Python and JS disagree on when to switch to exponent form
//     (Python at >=1e16 and <1e-4, JS at >=1e21 and <1e-6) and on the exponent's
//     own spelling (Python "1e-05", JS "1e-5"). `pythonNumber` reproduces
//     Python's rule. A number this cannot render faithfully THROWS rather than
//     emitting a hash that will not reproduce: a wrong hash fails at 22:12 in the
//     nightly, an exception fails in the generator that caused it.
//
// The differential test in `canonical-json.test.mjs` is what makes any of this
// believable: it hands the same values to Python and compares the bytes.
// =============================================================================

/**
 * Render a number the way Python re-emits it after parsing the literal JS wrote.
 *
 * THE CHAIN THIS HAS TO PREDICT, because getting it wrong is invisible until the
 * nightly ceremony halts: a JS generator builds an object, writes it with
 * `JSON.stringify(payload, null, 2)`, and `reproduce.py` later PARSES that file and
 * re-emits it with `json.dumps`. So the target is not "what Python's repr does to
 * this JS number" -- it is "what Python does to the LITERAL JSON.stringify writes".
 *
 * That distinction is the whole rule. `1e16` reaches the file as
 * `10000000000000000`, which Python parses as an INT and echoes digit for digit;
 * predicting Python's float repr (`1e+16`) there would be wrong. `1e-7` reaches the
 * file as `1e-7`, which Python parses as a float and re-spells `1e-07`.
 *
 * KNOWN LIMIT, stated because it bounds where this module may be used: a float
 * Python wrote as `1.0` parses to the JS number `1`, and no JS function can tell it
 * from an integer. So this canonicalisation is faithful for payloads BUILT in JS and
 * written by `JSON.stringify` -- the artifact and its hash then agree -- and is NOT a
 * general re-canonicaliser for files a Python exporter produced.
 */
export function pythonNumber(value) {
  if (!Number.isFinite(value)) {
    // Python writes Infinity/NaN; JSON has no such literals and JS writes null.
    // Neither is reproducible, so refuse rather than publish an unreproducible hash.
    throw new Error(`canonical-json: ${value} has no reproducible JSON form`);
  }
  // Exactly the bytes JSON.stringify will put in the artifact file.
  const literal = JSON.stringify(value);
  if (!/[.eE]/.test(literal)) {
    // No decimal point and no exponent: Python parses an int and echoes the digits.
    return literal;
  }
  // Python parses a float, so the output is `repr(float)`: shortest round-trip
  // digits -- identical in both languages -- laid out by Python's rule, which is
  // fixed notation for a decimal exponent in [-4, 16) and exponent form otherwise.
  const [mantissa, exponent] = value.toExponential().split("e");
  const e = Number(exponent);
  const negative = mantissa.startsWith("-");
  const digits = mantissa.replace("-", "").replace(".", "");
  if (e >= -4 && e < 16) {
    let whole;
    let fraction;
    if (e >= 0) {
      whole = digits.slice(0, e + 1).padEnd(e + 1, "0");
      fraction = digits.slice(e + 1);
    } else {
      whole = "0";
      fraction = "0".repeat(-e - 1) + digits;
    }
    // Python always keeps at least one fractional digit on a float.
    return `${negative ? "-" : ""}${whole}.${fraction === "" ? "0" : fraction}`;
  }
  const sign = e < 0 ? "-" : "+";
  const magnitude = String(Math.abs(e)).padStart(2, "0");
  return `${mantissa}e${sign}${magnitude}`;
}

// Every code unit above ASCII. Written as an escape range rather than as literal
// characters so the source file itself stays ASCII -- a file about non-ASCII
// escaping is the worst possible place to smuggle in a stray accented byte.
const NON_ASCII = /[\u0080-\uffff]/g;

/** Escape a string the way Python's `json.dumps(ensure_ascii=True)` does. */
export function pythonString(value) {
  // JSON.stringify already handles quotes, backslashes and control characters
  // identically to Python. Only non-ASCII is spelled differently, so escape that
  // and leave the rest of JS's output alone. Astral characters are already
  // surrogate pairs in JS, and Python escapes them as a surrogate pair too.
  return JSON.stringify(value).replace(
    NON_ASCII,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

/** The canonical byte string an artifact's `content_hash` is taken over. */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${pythonString(k)}:${canonicalJson(value[k])}`)
      .join(",")}}`;
  }
  if (typeof value === "number") return pythonNumber(value);
  if (typeof value === "string") return pythonString(value);
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  // undefined, function, symbol, bigint: JSON.stringify would silently drop or
  // throw. Neither belongs in a published artifact, so say so by name.
  throw new Error(`canonical-json: ${typeof value} has no canonical JSON form`);
}

/** `sha256:...` over the payload with its own `content_hash` field removed. */
export function contentHash(payload, createHash) {
  const body = Object.fromEntries(
    Object.entries(payload).filter(([k]) => k !== "content_hash"),
  );
  return `sha256:${createHash("sha256").update(canonicalJson(body)).digest("hex")}`;
}

/**
 * Write a glass-box artifact, stamp its `content_hash`, and PROVE the file on disk
 * reproduces that hash before returning.
 *
 * WHY THE READ-BACK. Computing a hash and writing a file are two steps, and every
 * incident in this pipeline's history lives in the gap between them: a generator
 * that hashed insertion-ordered bytes while the reader sorted them, an exporter that
 * emitted raw UTF-8 while the reader escaped it. In both cases the generator
 * succeeded, the artifact looked fine, and the failure surfaced days later as a
 * halted nightly ceremony pointing at the reader rather than the writer.
 *
 * So this re-reads what it just wrote, re-canonicalises it the way `reproduce.py`
 * will, and throws if the two disagree. The generator that caused the problem is the
 * thing that fails, at the moment it causes it. A list of "artifacts to check" would
 * have to be maintained and would silently omit the next new one; a self-check
 * cannot be omitted by anyone who uses the helper.
 */
export function writeArtifact(path, payload, { createHash, readFileSync, writeFileSync }) {
  const stamped = { ...payload };
  delete stamped.content_hash;
  stamped.content_hash = contentHash(stamped, createHash);
  writeFileSync(path, `${JSON.stringify(stamped, null, 2)}\n`);

  const reread = JSON.parse(readFileSync(path, "utf8"));
  const observed = contentHash(reread, createHash);
  if (observed !== reread.content_hash) {
    throw new Error(
      `canonical-json: ${path} does not reproduce its own content_hash ` +
        `(wrote ${reread.content_hash}, re-read as ${observed}). ` +
        "The published record would not reproduce and the nightly ceremony would halt.",
    );
  }
  return stamped.content_hash;
}
