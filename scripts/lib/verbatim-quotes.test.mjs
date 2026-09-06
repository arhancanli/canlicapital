import assert from "node:assert/strict";
import test from "node:test";
import { artifactStrings, stripVerifiedVerbatim, unescapeHtml } from "./verbatim-quotes.mjs";

const DASH = String.fromCodePoint(0x2014);
const entry = `CORRECTION 2026-09-06 (engine README) ${DASH} the list said the defect was open & it was not.`;
const artifacts = { "paper-state.json": artifactStrings({ transparency: [entry], other: { n: 1 } }) };
const load = (name) => artifacts[name] || null;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

test("a marked element whose text is verbatim in the artifact is removed from the counted HTML", () => {
  const html = `<p>ours</p><li><p class="x" data-verbatim-source="paper-state.json"><time datetime="2026-09-06">CORRECTION 2026-09-06 (engine README)</time>${esc(entry.slice(37))}</p></li>`;
  const { kept, failures } = stripVerifiedVerbatim(html, load);
  assert.deepEqual(failures, []);
  assert.equal(kept.includes(DASH), false);
  assert.equal(kept.includes("<p>ours</p>"), true);
});

test("a marked element whose text is NOT in the artifact stays counted and is reported", () => {
  const html = `<p data-verbatim-source="paper-state.json">our own prose ${DASH} with a dash</p>`;
  const { kept, failures } = stripVerifiedVerbatim(html, load);
  assert.equal(kept.includes(DASH), true);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /not verbatim/);
});

test("a marked element naming a missing artifact stays counted and is reported", () => {
  const html = `<p data-verbatim-source="nope.json">text ${DASH}</p>`;
  const { kept, failures } = stripVerifiedVerbatim(html, load);
  assert.equal(kept.includes(DASH), true);
  assert.match(failures[0], /does not exist/);
});

test("unmarked elements are never touched", () => {
  const html = `<p class="corrections-item__text">${esc(entry)}</p>`;
  const { kept, failures } = stripVerifiedVerbatim(html, load);
  assert.equal(kept, html);
  assert.deepEqual(failures, []);
});

test("entities are decoded before the comparison", () => {
  assert.equal(unescapeHtml("a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39;"), `a & b <c> "d" 'e'`);
});
