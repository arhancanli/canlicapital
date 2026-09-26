import assert from "node:assert/strict";
import test from "node:test";

import { compactAmount, historySummary, summaryDescription, summarySentences } from "./company-history-summary.mjs";

const row = (end, val, unit = "USD", filed = `${end.slice(0, 4)}-12-31`) => ({ end, val, unit, filed });

test("the change is against the observation a year earlier, measured against its absolute size", () => {
  const s = historySummary({ observations: [row("2023-12-31", -100), row("2024-12-31", -50)] });
  assert.equal(s.prior.end, "2023-12-31");
  assert.equal(s.change.abs, 50);
  assert.equal(s.change.pct, 0.5, "a loss shrinking from 100 to 50 is up 50% of its size");
  const text = summarySentences(s, { company: "Acme", label: "Net income or loss", kind: "duration" }).join(" ");
  assert.match(text, /up 50\.0% from -\$50\.0 thousand|up 50\.0% from -\$100/);
});

test("no year-earlier comparison when the prior observation is not about a year before", () => {
  const s = historySummary({ observations: [row("2022-12-31", 10), row("2024-12-31", 20)] });
  assert.equal(s.prior, null);
  assert.equal(s.change, null);
  assert.doesNotMatch(summarySentences(s, { company: "Acme", label: "Assets", kind: "instant" }).join(" "), /a year earlier/);
});

test("a zero prior value gives no percent change", () => {
  const s = historySummary({ observations: [row("2023-12-31", 0), row("2024-12-31", 5)] });
  assert.equal(s.change, null);
});

test("the compound rate needs three years and positive values throughout", () => {
  const positive = historySummary({ observations: ["2019", "2020", "2021", "2022", "2023"].map((y, i) => row(`${y}-12-31`, 100 * 2 ** i)) });
  assert.ok(positive.cagr && Math.abs(positive.cagr.rate - 1) < 0.01, "doubling every year is about 100% a year");
  const crossesZero = historySummary({ observations: [row("2019-12-31", 100), row("2020-12-31", -5), row("2021-12-31", 50), row("2022-12-31", 80), row("2023-12-31", 120)] });
  assert.equal(crossesZero.cagr, null);
  const short = historySummary({ observations: [row("2022-12-31", 1), row("2023-12-31", 2), row("2024-12-31", 3)] });
  assert.equal(short.cagr, null, "three observations are too few");
});

test("one unit per summary: the most observed, ties to the most recent", () => {
  const s = historySummary({ observations: [row("2023-12-31", 1, "EUR"), row("2024-12-31", 2, "USD"), row("2022-12-31", 3, "USD")] });
  assert.equal(s.unit, "USD");
  assert.equal(s.latest.val, 2);
});

test("amounts read naturally and the description stays near search-snippet length", () => {
  assert.equal(compactAmount(359241000000, "USD"), "$359.2 billion");
  assert.equal(compactAmount(3500000000, "USD"), "$3.50 billion");
  assert.equal(compactAmount(6.08, "USD/shares"), "$6.08 per share");
  assert.equal(compactAmount(15943425000, "shares"), "15.9 billion shares");
  const s = historySummary({ observations: ["2016", "2017", "2018", "2019", "2020", "2021", "2022", "2023", "2024", "2025"].map((y, i) => row(`${y}-09-30`, 1e9 * (1 + i))) });
  const description = summaryDescription(s, { company: "Example Holdings", label: "Total assets", kind: "instant" });
  assert.ok(description.length <= 170, description);
  assert.match(description, /^Example Holdings total assets: \$10\.0 billion at 2025-09-30, up 11\.1% on the year\. 10 values since 2016/);
});

test("an empty history has no summary and no sentences", () => {
  assert.equal(historySummary({ observations: [] }), null);
  assert.deepEqual(summarySentences(null, { company: "Acme", label: "Assets", kind: "instant" }), []);
});
