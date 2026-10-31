// How verify_claims reads a person's sentence: the measure, the period and the figure, with no network.
import test from "node:test";
import assert from "node:assert/strict";

import { plainClaimsIn, plainYear } from "../src/plainclaims.mjs";
import { claimsFromText } from "../src/verify.mjs";

const read = (s, name = "Apple Inc.") => plainClaimsIn(s, { name }).map((c) => [c.measure, c.value, c.when ?? null, c.change ?? null, c.bound ?? null]);

// sentence, then what it should be read as: [measure, value, when, change, bound].
const READS = [
  ["Amazon earned $9 per share in 2025.", [["eps", 9, null, null, null]], "Amazon.com, Inc."],
  ["Amazon made $7.17 a share.", [["eps", 7.17, null, null, null]], "Amazon.com, Inc."],
  ["Apple made $416 billion in revenue in fiscal 2025.", [["revenue", 416, null, null, null]]],
  ["Apple brought in $416 billion in sales.", [["revenue", 416, null, null, null]]],
  ["Apple pulled in 416 billion dollars of revenue.", [["revenue", 416, null, null, null]]],
  ["Nvidia made $100 billion profit last year.", [["net_income", 100, "last year", null, null]], "NVIDIA CORP"],
  ["Apple made 112 billion dollars in profit in 2025.", [["net_income", 112, null, null, null]]],
  ["Apple's profit was $112 billion.", [["net_income", 112, null, null, null]]],
  ["Apple profits hit $112bn.", [["net_income", 112, null, null, null]]],
  ["Apple earned $112 billion in 2025.", [["net_income", 112, null, null, null]]],
  ["Intel lost $18.8 billion in 2024.", [["net_income", -18.8, null, null, null]], "Intel Corp"],
  ["Intel had a net loss of $18.8 billion in 2024.", [["net_income", -18.8, null, null, null]], "Intel Corp"],
  ["Microsoft has $90 billion in cash.", [["cash", 90, null, null, null]], "Microsoft Corp"],
  ["Microsoft is sitting on $90 billion of cash.", [["cash", 90, null, null, null]], "Microsoft Corp"],
  ["Boeing has $50 billion in debt.", [["long_term_debt", 50, null, null, null]], "Boeing Co"],
  ["Coca-Cola's profit margin is 30%.", [["net_margin", 30, null, null, null]], "Coca-Cola Co"],
  ["Coca-Cola has a 30% profit margin.", [["net_margin", 30, null, null, null]], "Coca-Cola Co"],
  ["Apple's gross margin was 46% in 2025.", [["gross_margin", 46, null, null, null]]],
  ["Apple's sales rose 6% in 2025.", [["revenue", 6, null, "growth", null]]],
  ["Tesla's profit fell 46% in 2025.", [["net_income", -46, null, "growth", null]], "Tesla, Inc."],
  ["Apple's revenue was over $400 billion.", [["revenue", 400, null, null, "over"]]],
  ["Apple made more than $100 billion in profit.", [["net_income", 100, null, null, "over"]]],
  ["Apple's revenue was about $420 billion.", [["revenue", 420, null, null, "about"]]],
  ["Apple's revenue was under $500 billion.", [["revenue", 500, null, null, "under"]]],
  ["Apple's revenue last quarter was $102 billion.", [["revenue", 102, "last quarter", null, null]]],
  ["Apple spent $34 billion on R&D in 2025.", [["rnd", 34, null, null, null]]],
  ["Apple's free cash flow was $99 billion in 2025.", [["free_cash_flow", 99, null, null, null]]],
  ["Apple revenue was $416 billion.", [["revenue", 416, null, null, null]]],
  ["Revenue was $416 billion.", [["revenue", 416, null, null, null]]],
];

// Sentences that must give no figure to check: another measure, a part of the business, the future.
const NOT_READ = [
  "Tesla sold 1.8 million cars in 2025.",
  "Apple has a $3 trillion market cap.",
  "Apple lost $200 billion in market value in a day.",
  "Apple bought back $90 billion of stock.",
  "Apple made a $2 billion acquisition.",
  "Apple will make $500 billion in revenue next year.",
  "Analysts expect revenue of $450 billion.",
  "Apple could earn $150 billion by 2030.",
  "iPhone revenue was $209 billion.",
  "Apple made $209 billion in iPhone revenue.",
  "Apple's revenue from China was $64 billion.",
  "Apple's revenue in Europe was $111 billion.",
  "The stock trades at $270 per share.",
  "Apple paid a $1.04 per share dividend.",
  "Apple's revenue was $416 billion, up from $391 billion.",
];

for (const [sentence, want, name] of READS) test(`reads: ${sentence}`, () => assert.deepEqual(read(sentence, name), want));

test("two figures in one sentence are both read", () => {
  assert.deepEqual(read("Apple's revenue was $500 billion in 2025 and net income was $112 billion."), [["revenue", 500, null, null, null], ["net_income", 112, null, null, null]]);
  assert.deepEqual(read("Apple's sales were $416 billion, with profit of $112 billion."), [["revenue", 416, null, null, null], ["net_income", 112, null, null, null]]);
});

for (const sentence of NOT_READ) test(`leaves alone: ${sentence}`, () => {
  const kept = sentence.includes("up from") ? read(sentence).filter((r) => r[1] === 391) : read(sentence);
  assert.deepEqual(kept, []);
});

test("a year at the end of a sentence is a year; one inside a figure is not", () => {
  assert.equal(plainYear("Tesla's net income was $20 billion in 2025."), "2025");
  assert.equal(plainYear("Tesla's net income was $20 billion in 2025, a record."), "2025");
  assert.equal(plainYear("Revenue was $2025.5 million."), null);
  assert.equal(plainYear("Margin was 2025%."), null);
  assert.equal(plainYear("Tesla's FY'25 net income."), "FY'25");
});

test("a part of the business is named as one, not checked against the whole", () => {
  const [row] = plainClaimsIn("Cloud revenue was $168 billion.", { name: "Microsoft Corp", parts: true });
  assert.equal(row.part, "Cloud");
});

test("loose words are marked, so a mismatch can be told apart from a wrong figure", () => {
  assert.equal(plainClaimsIn("Apple's profit was $133 billion.", { name: "Apple Inc." })[0].loose, "profit");
  assert.equal(plainClaimsIn("Microsoft has $90 billion in cash.", { name: "Microsoft Corp" })[0].loose, "cash");
  assert.equal(plainClaimsIn("Boeing has $50 billion in debt.", { name: "Boeing Co" })[0].loose, "debt");
  assert.equal(plainClaimsIn("Apple's net income was $112 billion.", { name: "Apple Inc." })[0].loose, undefined);
});

// The whole text path, both readings together.
test("a whole draft: nothing unread is judged, and every period is accounted for", () => {
  for (const s of NOT_READ) {
    const { claims } = claimsFromText(s, "Apple Inc.");
    const judged = claims.filter((c) => !c.part && !(c.basis && c.basis !== "GAAP") && (c.value !== 416));
    assert.deepEqual(judged.map((c) => [c.measure, c.value]), [], s);
  }
  const [a] = claimsFromText("Apple's revenue was $416 billion.", "Apple Inc.").claims;
  assert.equal(a.assume, "latest");
  const [b] = claimsFromText("Apple's revenue last year was $416 billion.", "Apple Inc.").claims;
  assert.equal(b.assume, "last year");
  assert.equal(b.period, null);
  const [c] = claimsFromText("Apple's revenue in 2025 was $416 billion.", "Apple Inc.").claims;
  assert.deepEqual(c.period, { fy: 2025, fp: "FY" });
});

test("a part of the business from a release's reading is held back, the company and period are not parts", () => {
  const [cloud] = claimsFromText("Microsoft Cloud revenue was $168 billion in fiscal 2026.", "Microsoft Corp").claims;
  assert.equal(cloud.part, "Cloud");
  const [own] = claimsFromText("Apple's 2025 revenue was $416.2 billion.", "Apple Inc.").claims;
  assert.equal(own.part, undefined);
});

test("a figure the words call something else is dropped from a release's reading too", () => {
  const { claims, unread } = claimsFromText("Apple's revenue was $416 billion, and it has a $3 trillion market cap.", "Apple Inc.");
  assert.deepEqual(claims.map((c) => [c.measure, c.value]), [["revenue", 416]]);
  assert.equal(unread, 1);
});
