// The method papers are generated from their study results; a committed page that differs from
// the generator's output has a figure nobody is keeping honest.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { build } from "./build-method-papers.mjs";

test("each committed method paper is exactly what the generator writes from its study results", () => {
  for (const [rel, text] of Object.entries(build({ write: false }))) assert.equal(readFileSync(new URL(`../${rel}`, import.meta.url), "utf8"), text, `${rel} drifted: run node scripts/build-method-papers.mjs`);
});

test("the pages state the calibration cases the studies measured, not a summary of them", () => {
  const pages = build({ write: false });
  const luck = pages["public/research/luck-equivalent-trials.md"];
  const zoo = pages["public/research/null-zoo-v0.md"];
  const study = JSON.parse(readFileSync(new URL("../config/research/null-zoo-v0.json", import.meta.url), "utf8"));
  assert.equal((zoo.match(/^\| (?!Returns|---)/gm) ?? []).length, study.rows.length * 2, "every family appears in both the size and power tables");
  assert.match(luck, /## Evidence boundary/);
  assert.match(zoo, /## Evidence boundary/);
  assert.ok(luck.includes("/glassbox/research/luck-trials-size-study.json") && zoo.includes("/glassbox/research/null-zoo-v0.json"), "each page links its downloadable results");
});
