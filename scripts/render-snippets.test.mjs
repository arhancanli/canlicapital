import assert from "node:assert/strict";
import test from "node:test";

import { MANIFEST } from "../api/_lib/manifest.js";
import { renderAll, renderCurl, renderJs, renderPython } from "./render-snippets.mjs";

const POST_ROUTES = MANIFEST.filter((m) => m.method === "POST");

test("curl, python and javascript embed the exact same JSON body as the manifest example", () => {
  for (const m of POST_ROUTES) {
    const curl = renderCurl(m);
    const curlJson = curl.match(/-d '(.+)'$/s)?.[1];
    assert.ok(curlJson, `${m.path}: curl snippet has no -d body`);
    assert.deepEqual(JSON.parse(curlJson), m.requestExample, `${m.path}: curl body drifted from the manifest`);

    const python = renderPython(m);
    const pythonJson = python.match(/^body = (.+)$/m)?.[1];
    assert.ok(pythonJson, `${m.path}: python snippet has no body assignment`);
    assert.deepEqual(JSON.parse(pythonJson), m.requestExample, `${m.path}: python body drifted from the manifest`);

    const js = renderJs(m);
    const jsJson = js.match(/^const body = (.+);$/m)?.[1];
    assert.ok(jsJson, `${m.path}: javascript snippet has no body assignment`);
    assert.deepEqual(JSON.parse(jsJson), m.requestExample, `${m.path}: javascript body drifted from the manifest`);
  }
});

test("keyed routes carry the same $CANLI_KEY placeholder in every language; unkeyed routes carry none", () => {
  for (const m of POST_ROUTES) {
    for (const { lang, code } of renderAll(m)) {
      assert.equal(code.includes("Bearer $CANLI_KEY"), m.keyed, `${m.path} (${lang}): auth placeholder presence must match keyed`);
    }
  }
});

test("python source parses under python3's own syntax", async () => {
  const { execFileSync } = await import("node:child_process");
  for (const m of POST_ROUTES) {
    const source = renderPython(m).replace("$CANLI_KEY", "test-key");
    try {
      execFileSync("python3", ["-c", "import ast,sys; ast.parse(sys.stdin.read())"], { input: source, stdio: ["pipe", "pipe", "pipe"] });
    } catch (e) {
      if (e.code === "ENOENT") return; // python3 not on PATH in this environment; skip rather than fail the suite
      throw new Error(`${m.path}: generated python does not parse:\n${e.stderr}`);
    }
  }
});
