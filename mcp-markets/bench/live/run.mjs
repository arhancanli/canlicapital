// Live check of the newer tools against their real sources, with no AI and no keys: each must
// answer and its answer must pass a check that holds whatever the day's data are. Prints PASS or
// FAIL per check; the nightly watch runs it and alerts on a FAIL.
//   node bench/live/run.mjs
import { filingDiff } from "../../src/diff.mjs";
import { explainMove } from "../../src/explain.mjs";
import { latestFilings } from "../../src/latest.mjs";
import { news } from "../../src/news.mjs";
import { screenCompanies } from "../../src/research.mjs";
import { createSession } from "../../src/sources.mjs";
import { portfolioXray } from "../../src/xray.mjs";
import { comps } from "../../src/comps.mjs";

const s = createSession();
const day = (k) => new Date(Date.now() - k * 86400000).toISOString().slice(0, 10);
// The last weekday before yesterday: a day with a close.
const lastSession = (() => { for (let k = 2; k < 9; k += 1) { const d = new Date(Date.now() - k * 86400000); if (d.getUTCDay() % 6) return d.toISOString().slice(0, 10); } return day(3); })();
const CHECKS = [
  ["latest_filings", () => latestFilings(s, { forms: ["8-K"], limit: 50 }), (r) => r.rows.length > 0 && r.rows.every((x) => x[1].startsWith("8-K"))],
  ["filing_diff", () => filingDiff(s, { company: "AAPL" }), (r) => r.summary.new_paragraphs > 20 && r.summary.unchanged > 0 && r.older.filed < r.newer.filed],
  ["news", () => news(s, { company: "MSFT", days: 3, tone: false }), (r) => Array.isArray(r.articles.rows)],
  ["explain_move", () => explainMove(s, { symbol: "MSFT", date: lastSession, news: false }), (r) => Number.isFinite(r.move.return) && Number.isFinite(r.move.z_score)],
  ["portfolio_xray", () => portfolioXray(s, { holdings: [{ symbol: "IVV", weight: 1 }, { symbol: "AAPL", weight: 1 }], top: 5 }), (r) => r.positions_after_look_through > 400 && r.rows[0][1] > 0.05],
  ["comps", () => comps(s, { company: "NVDA", peers: 5 }), (r) => r.rows.length >= 4 && r.rows[0][0] === "NVDA" && r.company.sic === "3674"],
  ["screen_window", () => screenCompanies(s, { fiscal_year_end: [day(500), day(120)], filters: [{ metric: "revenue", op: ">", value: 1e11 }], limit: 50 }), (r) => r.matched >= 10 && r.rows.every((x) => x[4] >= day(500) && x[4] <= day(120))],
];
let failed = 0;
for (const [name, run, ok] of CHECKS) {
  const t0 = Date.now();
  try {
    const r = await run();
    const pass = ok(r);
    if (!pass) failed += 1;
    console.log(`${pass ? "PASS" : "FAIL"} ${name} ${Date.now() - t0}ms`);
  } catch (err) { failed += 1; console.log(`FAIL ${name} ${Date.now() - t0}ms ${String(err.message).slice(0, 200)}`); }
}
process.exitCode = failed ? 1 : 0;
