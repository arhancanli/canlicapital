// red_flags: each flag found with its filings, not found, or not checked when its source failed (never "no");
// "filed no ..." is an answer; old name changes and forward splits are not flags; the screens use their lines.
import assert from "node:assert/strict";
import test from "node:test";

import { runRedFlags } from "../src/redflags.mjs";

const NOW = Date.parse("2026-11-04T09:00:00Z");
const ctx = (replies) => ({ call: async (name) => { const r = replies[name]; if (r instanceof Error) throw r; return r; } });
const flag = (out, text) => out.rows.find((r) => r[0].startsWith(text));

test("flags found, not found, and not checked", async () => {
  const out = await runRedFlags(ctx({
    company_events: { columns: ["filed", "items", "url"], rows: [["2024-11-18", ["4.01"], "https://www.sec.gov/a.htm"], ["2025-02-26", ["3.01", "9.01"], "https://www.sec.gov/b.htm"], ["2025-01-10", ["2.02"], "https://www.sec.gov/c.htm"]] },
    list_filings: new Error("list_filings: X filed no NT 10-K, NT 10-Q or NT 20-F since 2023-11-04."),
    search_filings: new Error("search_filings: efts.sec.gov could not be reached."),
    company_profile: { name: "X Corp", former_names: [{ name: "OLD X", until: "2025-06-01" }, { name: "OLDER X", until: "2001-01-01" }] },
    history: { columns: ["end", "start", "val", "filed", "form"], rows: [["2025-03-31", null, 0.1, "2025-05-01", "10-Q"], ["2024-03-31", null, 4, "2024-05-01", "10-Q"]] },
    forensic_scores: { beneish: { m_score: -1.2 }, altman: { z_score: 3.1 } },
  }), { company: "X" }, { now: NOW });
  assert.equal(flag(out, "The auditor changed")[1], true);
  assert.deepEqual(flag(out, "A delisting notice")[2], ["2025-02-26 https://www.sec.gov/b.htm"]);
  assert.equal(flag(out, "Earlier statements")[1], false);
  assert.equal(flag(out, "Late-filing notices")[1], false, "filed no ... is an answer");
  assert.equal(flag(out, "Going-concern")[1], null, "a source that failed is not checked, never no");
  assert.match(flag(out, "Going-concern")[2], /not checked: .*could not be reached/);
  assert.deepEqual(flag(out, "Name changes")[2], ["OLD X (until 2025-06-01)"], "only names used inside the window");
  assert.deepEqual(flag(out, "Reverse splits")[2], ["2025-03-31: 1 for 10 (10-Q filed 2025-05-01)"], "a forward split is not a flag");
  assert.equal(flag(out, "Forensic screens")[1], true, "an M-score above -1.78");
  assert.deepEqual([out.flags_found, out.not_checked], [5, 1]);
  assert.match(out.reading, /not accusations and not investment advice/);
});
