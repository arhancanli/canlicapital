// filing_diff's comparison on texts whose changes are known.
import assert from "node:assert/strict";
import test from "node:test";

import { diffText } from "../src/diff.mjs";

const OLD = [
  "Our business depends on a small number of suppliers in Asia, and any disruption at those suppliers could delay shipments to our customers.",
  "We face intense competition in every market we serve, and our competitors may introduce products that are cheaper or better than ours.",
  "Changes in interest rates could raise our cost of borrowing and reduce the value of the investments we hold in our portfolio.",
  "Item 1B. Unresolved Staff Comments",
].join("\n");
const NEW = [
  "Our business depends on a small number of suppliers in Asia, and any disruption at those suppliers could delay shipments to our customers. New tariffs on imported components could raise our costs further.",
  "We face intense competition in every market we serve, and our competitors may introduce products that are cheaper or better than ours.",
  "We have entered into a technology license arrangement that required significant payments, and the licensed technology may never produce commercially viable products for us.",
  "Tariffs and retaliatory tariffs on our products could reduce demand for them in several of our largest markets, and tariffs may change with little notice.",
].join("\n");

test("new, dropped, changed and unchanged paragraphs, and the words that rose", () => {
  const d = diffText(OLD, NEW);
  assert.deepEqual(d.summary, { old_paragraphs: 3, new_paragraphs: 4, added: 2, removed: 1, changed: 1, unchanged: 1, old_words: d.summary.old_words, new_words: d.summary.new_words });
  assert.match(d.removed[0], /interest rates/);
  assert.ok(d.added.some((p) => /license arrangement/.test(p)));
  assert.deepEqual(d.changed[0].added_sentences, ["New tariffs on imported components could raise our costs further."]);
  assert.deepEqual(d.changed[0].removed_sentences, []);
  assert.equal(d.terms_rising.rows[0][0], "tariffs");
  assert.ok(d.terms_falling.rows.some(([w]) => w === "interest" || w === "rates" || w === "investments") || d.terms_falling.rows.length === 0);
  assert.deepEqual(diffText(OLD, OLD).summary.unchanged, 3, "a section compared with itself is all unchanged");
});
