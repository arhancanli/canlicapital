// A dataset card prints figures read from the dataset's own files; a committed card or checksum
// file that differs from the generator's output has a figure nobody is keeping honest.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { build, FILING_FACTS } from "./build-dataset-cards.mjs";

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url));

test("each committed card and checksum file is exactly what the generator writes", () => {
  for (const [rel, text] of Object.entries(build({ write: false }).outputs)) {
    assert.equal(read(rel).toString("utf8"), text, `${rel} drifted: run node scripts/build-dataset-cards.mjs`);
  }
});

test("the summary counts are recomputed from the items, and every published file matches its checksum", () => {
  const { record } = build({ write: false });
  const items = read(`${FILING_FACTS.dir}/${FILING_FACTS.files.items}`).toString("utf8").trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(record.items, items.length);
  assert.equal(Object.values(record.by_template).reduce((a, b) => a + b, 0), items.length);
  assert.equal(record.companies, new Set(items.map((item) => item.company.cik)).size);
  for (const [key, name] of Object.entries(FILING_FACTS.files)) {
    const bytes = read(`${FILING_FACTS.dir}/${name}`);
    assert.equal(record.files[key].sha256, createHash("sha256").update(bytes).digest("hex"), `${name} checksum`);
    assert.equal(record.files[key].bytes, bytes.length, `${name} size`);
    assert.equal(record.files[key].kilobytes, Math.round(bytes.length / 1024), `${name} printed size`);
  }
});

test("the Dataset node is complete enough for dataset search and carries the license", () => {
  const { record } = build({ write: false });
  const node = record.jsonld;
  assert.equal(node["@type"], "Dataset");
  assert.ok(node.name && node.description && node.license && node.creator && node.distribution.length >= 1);
  assert.equal(node.license, "https://creativecommons.org/licenses/by/4.0/");
  assert.match(node.description, new RegExp(record.items.toLocaleString("en-US")));
  for (const download of node.distribution) assert.match(download.contentUrl, /^https:\/\/canlicapital\.com\/datasets\/filing-facts\/v0\//);
});

test("the card links its record, states that no item is human-verified yet, and keeps an evidence boundary", () => {
  const card = build({ write: false }).outputs[`public/research/${FILING_FACTS.slug}.md`];
  assert.ok(card.includes(`(/glassbox/datasets/${FILING_FACTS.slug}.json)`), "the record link is what build-papers reads the Dataset node from");
  assert.match(card, /No item has been verified by a person yet \(0 of /);
  assert.match(card, /## Evidence boundary/);
});
