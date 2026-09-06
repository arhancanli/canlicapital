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

// A route can declare `modes`: a discriminated union of input shapes (deflated-sharpe's seven
// contract fields OR a return series plus its trials). The renderers take an explicit example
// override for exactly this case; build-standards-and-developers.mjs calls renderAll(m,
// mode.example) once per mode so a developer sees every shape in every language.
const MODED_ROUTES = MANIFEST.filter((m) => Array.isArray(m.modes) && m.modes.length);

test("a moded route has more than one mode to render", () => {
  assert.ok(MODED_ROUTES.length > 0, "at least one manifest route should declare modes");
});

test("renderAll(m, mode.example) embeds that mode's own JSON body, in every language, distinct per mode", () => {
  for (const m of MODED_ROUTES) {
    const renderedPerMode = m.modes.map((mode) => renderAll(m, mode.example));
    for (const [i, mode] of m.modes.entries()) {
      for (const { lang, code } of renderedPerMode[i]) {
        const body = lang === "curl" ? code.match(/-d '(.+)'$/s)?.[1]
          : lang === "python" ? code.match(/^body = (.+)$/m)?.[1]
          : code.match(/^const body = (.+);$/m)?.[1];
        assert.ok(body, `${m.path} mode ${mode.name} (${lang}): snippet has no body`);
        assert.deepEqual(JSON.parse(body), mode.example, `${m.path} mode ${mode.name} (${lang}): body drifted from its own example`);
      }
    }
    // The two modes' curl bodies must actually differ, or the "per mode" rendering is decorative.
    const curlBodies = renderedPerMode.map((snippets) => snippets.find((s) => s.lang === "curl").code);
    assert.equal(new Set(curlBodies).size, curlBodies.length, `${m.path}: modes rendered identical snippets`);
  }
});

test("a moded route's keyed placeholder is present in every mode's snippets when the route is keyed", () => {
  for (const m of MODED_ROUTES) {
    for (const mode of m.modes) {
      for (const { lang, code } of renderAll(m, mode.example)) {
        assert.equal(code.includes("Bearer $CANLI_KEY"), m.keyed, `${m.path} mode ${mode.name} (${lang})`);
      }
    }
  }
});
