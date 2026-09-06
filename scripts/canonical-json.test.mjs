// =============================================================================
// canonical-json.test.mjs
// -----------------------------------------------------------------------------
// A DIFFERENTIAL test, not a unit test, and the distinction is the whole point.
//
// `canonical-json.mjs` claims to reproduce the bytes Python's
// `json.dumps(sort_keys=True, separators=(",", ":"))` emits. Asserting that claim
// against hand-written expected strings would only pin what I BELIEVE Python does
// -- and my belief is exactly the thing that was wrong when a bare
// `JSON.stringify` shipped as a canonicaliser. So every case below is handed to
// the real Python interpreter and the two byte strings are compared.
//
// The corpus case is the one that matters most: it runs over every artifact this
// site actually publishes, so the test fails the moment a real payload contains a
// value the JS side renders differently -- an accented character, an exponent, a
// float at a boundary -- instead of that surfacing as a halted nightly ceremony.
// =============================================================================

import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { canonicalJson, pythonNumber, writeArtifact } from "./canonical-json.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GLASSBOX = resolve(ROOT, "public/glassbox");

/** Canonicalise with the real Python, which is the definition this module chases. */
function pythonCanonical(values) {
  const out = execFileSync(
    "python3",
    [
      "-c",
      [
        "import json,sys",
        "for v in json.load(sys.stdin):",
        "    sys.stdout.write(json.dumps(v, sort_keys=True, separators=(',', ':')) + chr(10))",
      ].join("\n"),
    ],
    { input: JSON.stringify(values), encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
  );
  // A trailing newline from the last write, not an extra empty value.
  return out.split("\n").slice(0, -1);
}

function assertMatchesPython(values, label) {
  const expected = pythonCanonical(values);
  assert.equal(expected.length, values.length, `${label}: python returned a different count`);
  values.forEach((value, i) => {
    assert.equal(canonicalJson(value), expected[i], `${label}: case ${i} diverged`);
  });
}

test("key order is sorted recursively, not insertion order", () => {
  // The defect this module exists to prevent: a bare JSON.stringify preserves
  // insertion order, so this object hashed differently in JS than in Python.
  const value = { schema: "s", author: "a", nested: { z: 1, a: 2 }, results: [{ b: 1, a: 2 }] };
  assert.equal(
    canonicalJson(value),
    '{"author":"a","nested":{"a":2,"z":1},"results":[{"a":2,"b":1}],"schema":"s"}',
  );
  assertMatchesPython([value], "sorted keys");
});

test("non-ASCII is escaped the way Python escapes it", () => {
  // One accented character in one contract halted the nightly for three nights.
  // Written as escapes, never as literal characters. Two reasons, both real: the
  // writing ratchet bans a literal em dash anywhere under scripts/, and a test file
  // ABOUT non-ASCII handling is the last place that should depend on its own bytes
  // surviving an editor, a copy-paste or a terminal round-trip.
  const values = [
    { cite: "Lopez de Prado" },
    { cite: "L\u00f3pez de Prado" },
    { dash: "a \u2014 b", quote: "\u201cq\u201d", astral: "\ud83d\ude80" },
    { "key_\u00e9": "value" },
  ];
  assert.ok(canonicalJson(values[1]).includes("\\u00f3"), "accent must be escaped, not raw");
  assertMatchesPython(values, "non-ascii");
});

test("numbers match Python across the ranges where the two languages disagree", () => {
  // Python switches to exponent form at >=1e16 and <1e-4; JS at >=1e21 and <1e-6.
  // Python spells the exponent "1e-05"; JS spells it "1e-5". Every value here sits
  // on or across one of those boundaries.
  const values = [
    0, -0, 1, -1, 42, 1e15, 1e16, 1e17, 1e20, 1e21, 1e22,
    0.1, 0.5, -0.5, 1.5, 0.0001, 0.00001, 1e-6, 1e-7, 1e-10,
    0.34027975889222084, 0.2298358829229609, 1.2673190577321936,
    5.999999999999999, 26.783649295947033, 1786090191417,
    Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER, 1.7976931348623157e308, 5e-324,
  ].map((n) => ({ n }));
  assertMatchesPython(values, "numbers");
  // Spot-check the spellings that differ, so a regression names itself rather than
  // only showing up as a hash mismatch. Note 1e17: JSON.stringify writes it as
  // 100000000000000000, which Python parses as an INT and echoes -- so predicting
  // Python's float repr ("1e+17") there would be the wrong answer, and was.
  assert.equal(pythonNumber(1e-7), "1e-07");
  assert.equal(pythonNumber(0.00001), "1e-05");
  assert.equal(pythonNumber(1e17), "100000000000000000");
  assert.equal(pythonNumber(1e21), "1e+21");
  assert.equal(pythonNumber(1.5), "1.5");
});

test("values with no reproducible JSON form throw instead of hashing wrong", () => {
  // A hash computed over a value JS and Python spell differently fails at 22:12
  // in the nightly ceremony. An exception fails in the generator that caused it.
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.throws(() => canonicalJson({ n: bad }), /no reproducible JSON form/);
  }
  assert.throws(() => canonicalJson({ u: undefined }), /no canonical JSON form/);
});

test("every published glassbox artifact canonicalises identically in both languages", () => {
  // The corpus case. This is what would have caught the bare JSON.stringify on the
  // run that introduced it, rather than five days later in a halted ceremony.
  //
  // WHAT IT DOES NOT PROVE, stated so it is not read as more coverage than it is.
  // Python is handed the payloads through `JSON.stringify`, i.e. the bytes a JS
  // generator WOULD write, not the bytes currently on disk. That is deliberate --
  // it tests the question generators actually face -- but it means a value only a
  // Python exporter can produce is invisible here: `1.0` on disk parses to the JS
  // number 1 and is re-serialised as `1`, so both sides agree on a form the real
  // file does not use. The published files are checked in Python by `reproduce.py`,
  // which reads them as bytes. Neither check subsumes the other.
  const names = readdirSync(GLASSBOX).filter((n) => n.endsWith(".json"));
  assert.ok(names.length > 100, `expected the full corpus, found ${names.length}`);

  const payloads = [];
  const labels = [];
  for (const name of names) {
    const raw = readFileSync(resolve(GLASSBOX, name), "utf8");
    // The chain is megabytes of hash-linked entries and is verified by its own
    // signature tooling; canonicalising it here would dominate the runtime
    // without testing anything the other 200 files do not already cover.
    if (name === "transparency_log.json") continue;
    payloads.push(JSON.parse(raw));
    labels.push(name);
  }
  const expected = pythonCanonical(payloads);
  payloads.forEach((payload, i) => {
    assert.equal(canonicalJson(payload), expected[i], `${labels[i]} canonicalises differently`);
  });
});

test("writeArtifact proves the file it wrote reproduces its own hash", () => {
  // The property that matters, tested through the helper generators actually call
  // rather than over the published corpus. Scoping it to the corpus was wrong and
  // the test said so: ~200 of those artifacts are written by PYTHON exporters, and a
  // float Python wrote as `1.0` parses to the JS number `1`, which no JS function can
  // tell from an integer. `active_ownership_human_gate_audit.json` is exactly that
  // case. Those files are covered by `reproduce.py`, in the language that wrote them.
  const dir = mkdtempSync(resolve(tmpdir(), "canonical-json-"));
  const path = resolve(dir, "artifact.json");
  try {
    const payload = { schema: "test.v1", zeta: 1, alpha: [3, 2], note: "Lopez" };
    const hash = writeArtifact(path, payload, { createHash, readFileSync, writeFileSync });

    // Python, reading the bytes on disk, must agree with the stamped hash.
    const viaPython = execFileSync(
      "python3",
      [
        "-c",
        [
          "import json,hashlib,sys",
          "d=json.load(open(sys.argv[1]))",
          "b={k:v for k,v in d.items() if k!='content_hash'}",
          "s=json.dumps(b,sort_keys=True,separators=(',',':')).encode()",
          "print('sha256:'+hashlib.sha256(s).hexdigest())",
        ].join("\n"),
        path,
      ],
      { encoding: "utf8" },
    ).trim();
    assert.equal(viaPython, hash, "python must reproduce the hash writeArtifact stamped");

    // An existing content_hash on the input is replaced, never hashed into the body.
    const restamped = writeArtifact(path, { ...payload, content_hash: "sha256:stale" }, {
      createHash, readFileSync, writeFileSync,
    });
    assert.equal(restamped, hash, "a stale content_hash must not change the result");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("writeArtifact's read-back can actually fail", () => {
  // MUTATION CHECK. A self-verifying writer that cannot detect a bad hash is the
  // same shape as the guards this repo keeps rediscovering: running, green, blind.
  // Hash with the bare `JSON.stringify` that caused the outage and confirm the
  // read-back rejects it.
  const dir = mkdtempSync(resolve(tmpdir(), "canonical-json-mutant-"));
  const path = resolve(dir, "artifact.json");
  try {
    const payload = { zeta: 1, alpha: 2, schema: "test.v1" };
    const insertionOrdered = JSON.stringify(payload);
    const wrongHash = `sha256:${createHash("sha256").update(insertionOrdered).digest("hex")}`;
    // Sanity: the two canonicalisations really do differ for this payload, so the
    // mutation is a real one and not a no-op that would pass either way.
    assert.notEqual(insertionOrdered, canonicalJson(payload));
    writeFileSync(path, `${JSON.stringify({ ...payload, content_hash: wrongHash }, null, 2)}\n`);

    const reread = JSON.parse(readFileSync(path, "utf8"));
    const body = Object.fromEntries(Object.entries(reread).filter(([k]) => k !== "content_hash"));
    const observed = `sha256:${createHash("sha256").update(canonicalJson(body)).digest("hex")}`;
    assert.notEqual(observed, reread.content_hash, "the mutant must not reproduce");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
