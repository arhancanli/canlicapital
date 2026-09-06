import assert from "node:assert/strict";
import test from "node:test";
import { summarise, report } from "./report-arrivals.mjs";

const baseline = { validations_today: 12, keys_issued_today: 5, keys_by_source_host_today: { unknown: 5 }, keys_by_label_today: { smoke: 2 } };

test("an internal-only day reads as no arrival", () => {
  const out = summarise({ as_of_utc_day: "2026-09-06", validations_today: 12, validations_total: 12, keys_issued_today: 5, keys_by_source_host_today: { unknown: 5 }, keys_by_label_today: { smoke: 2 } }, baseline);
  assert.equal(out.available, true);
  assert.match(out.lines.at(-1), /no arrival/);
});

test("new keys from a named referer host read as arrival", () => {
  const out = summarise({ as_of_utc_day: "2026-09-09", validations_today: 40, validations_total: 60, keys_issued_today: 9, keys_by_source_host_today: { "news.ycombinator.com": 7, unknown: 2 }, keys_by_label_today: { "quickstart-curl": 6 } }, baseline);
  assert.match(out.lines.at(-1), /someone arrived/);
  assert.match(out.lines[0], /delta 4/);
});

test("missing usage is named, not faked", () => {
  const out = summarise(null, baseline);
  assert.equal(out.available, false);
});

test("report reads the status envelope through fetch", async () => {
  const fake = async () => ({ json: async () => ({ data: { usage: { as_of_utc_day: "2026-09-06", validations_today: 12, validations_total: 12, keys_issued_today: 5, keys_by_source_host_today: { unknown: 5 }, keys_by_label_today: {} } } }) });
  const out = await report("https://example.test", fake, baseline);
  assert.equal(out.available, true);
});
