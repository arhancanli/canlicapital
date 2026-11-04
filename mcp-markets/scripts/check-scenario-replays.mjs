// How well scenario_risk's model replays crises it was not fitted on (node scripts/check-scenario-replays.mjs):
// twelve broad funds, equally weighted, through six crises, each holding's model return beside its actual
// one, and the spread of the misses. Reads the live sources; the betas come from the latest years.
import { scenarioRisk } from "../src/scenarios.mjs";
import { createSession } from "../src/sources.mjs";

const session = createSession();
const funds = ["SPY", "QQQ", "IWM", "TLT", "IEF", "LQD", "HYG", "GLD", "XLE", "XLF", "EFA", "EEM"];
const holdings = funds.map((symbol) => ({ symbol, weight: 1 / funds.length }));
const misses = [];
for (const scenario of ["bank_crisis", "taper_tantrum", "q4_2018", "pandemic_crash", "inflation_shock", "regional_bank_run"]) {
  const r = await scenarioRisk(session, { holdings, scenario });
  const c = r.holdings.columns, im = c.indexOf("model_return"), ia = c.indexOf("actual_return");
  for (const row of r.holdings.rows) if (row[ia] != null) misses.push(Math.abs(row[im] - row[ia]));
  const pct = (x) => (x == null ? "-" : `${Math.round(x * 100)}%`);
  console.log(`${scenario}: portfolio model ${pct(r.portfolio.model_return)}, actual ${pct(r.portfolio.actual_return)}`);
  console.log(`  ${r.holdings.rows.map((row) => `${row[0]} ${pct(row[im])}/${pct(row[ia])}`).join("  ")}`);
}
misses.sort((x, y) => x - y);
const q = (p) => misses[Math.min(misses.length - 1, Math.floor(misses.length * p))];
console.log(`holding misses (model against actual), ${misses.length} pairs: median ${(q(0.5) * 100).toFixed(1)} points, 75th percentile ${(q(0.75) * 100).toFixed(1)}`);
