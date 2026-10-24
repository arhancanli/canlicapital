// More interactive views (MCP Apps), beside studio.js's: the market map, the Treasury curve through
// time, financial statements as charts, correlation heatmaps with the number of independent bets,
// the volatility surface, and several prices compared. The same rules hold: everything is drawn from
// the result in hand, so ranges, orders, modes and the time scrubber cost no tool call and no
// tokens; only a press (a market's tile, a comparison further back than the result, Refresh) calls a
// tool again, through the host.
import { esc, fmt, short, table } from "./render.js";
import { btn, callAgain, clamp, colsOf, dateLabel, finite, mountCandles, mountLines, pathOf, pct, place, signed, tipAt, toggle, xTicks, yGrid } from "./studio.js";

// ---------------------------------------------------------------------------------------------
// Arithmetic the views share (exported for the tests)
// ---------------------------------------------------------------------------------------------
// Eigenvalues of a symmetric matrix by cyclic Jacobi rotations, largest first.
export function eigenSym(m) {
  const n = m.length, a = m.map((r) => r.map((v) => (finite(v) ? v : 0)));
  for (let sweep = 0; sweep < 80; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] ** 2;
    if (off < 1e-20) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(a[p][q]) < 1e-15) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]), t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const x = a[k][p], y = a[k][q]; a[k][p] = c * x - s * y; a[k][q] = s * x + c * y; }
      for (let k = 0; k < n; k++) { const x = a[p][k], y = a[q][k]; a[p][k] = c * x - s * y; a[q][k] = s * x + c * y; }
    }
  }
  return a.map((r, i) => r[i]).sort((x, y) => y - x);
}
// How many independent bets a correlation matrix holds: (sum of eigenvalues)^2 over the sum of their
// squares, as the backtest pack's effective_bets counts them; and the first eigenvalue's share.
export function effectiveBets(m) {
  const ev = eigenSym(m), s = ev.reduce((a, b) => a + b, 0), q = ev.reduce((a, b) => a + b * b, 0);
  return { bets: q > 0 ? (s * s) / q : null, first_share: s > 0 ? ev[0] / s : null };
}
// Pearson correlations between columns of returns, each pair over the periods both have.
export function correlationOf(cols) {
  const n = cols.length, m = Array.from({ length: n }, () => new Array(n).fill(1));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    let k = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    for (let t = 0; t < cols[i].length; t++) {
      const x = cols[i][t], y = cols[j][t];
      if (!finite(x) || !finite(y)) continue;
      k++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
    }
    const cov = sxy - (sx * sy) / k, vx = sxx - (sx * sx) / k, vy = syy - (sy * sy) / k;
    m[i][j] = m[j][i] = k > 2 && vx > 0 && vy > 0 ? clamp(cov / Math.sqrt(vx * vy), -1, 1) : null;
  }
  return m;
}
// An order that puts assets that move together side by side: average-linkage clustering on 1 - rho.
export function clusterOrder(m) {
  let groups = m.map((_, i) => [i]);
  const dist = (a, b) => { let s = 0, k = 0; for (const i of a) for (const j of b) if (finite(m[i][j])) { s += 1 - m[i][j]; k++; } return k ? s / k : 2; };
  while (groups.length > 1) {
    let bi = 0, bj = 1, bd = Infinity;
    for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) { const d = dist(groups[i], groups[j]); if (d < bd) { bd = d; bi = i; bj = j; } }
    groups[bi] = [...groups[bi], ...groups[bj]];
    groups.splice(bj, 1);
  }
  return groups[0] ?? [];
}
// A Treasury maturity ("1 Mo", "1.5 Month", "10 Yr") in years, or null.
export function tenorYears(h) {
  const m = /^(\d+(?:\.\d+)?)\s*(wk|weeks?|mo|months?|yr|years?)$/i.exec(String(h).trim());
  if (!m) return null;
  const u = m[2].toLowerCase();
  return Number(m[1]) * (u[0] === "w" ? 1 / 52 : u[0] === "m" ? 1 / 12 : 1);
}
const tenorLabel = (y) => (y < 1 ? `${Math.round(y * 12 * 10) / 10}m` : `${y}y`);
const isoDaysBefore = (iso, days) => new Date(Date.parse(`${iso}T00:00:00Z`) - days * 86400000).toISOString().slice(0, 10);
// Closes of several series on the dates they all have, oldest first.
export function alignCloses(list) {
  const maps = list.map((s) => new Map(s.dates.map((d, i) => [String(d).slice(0, 10), s.close[i]])));
  const dates = [...maps[0].keys()].filter((d) => maps.every((m) => finite(m.get(d)))).sort();
  return { dates, closes: maps.map((m) => dates.map((d) => m.get(d))) };
}
// A close series' figures: total return, CAGR (252 sessions a year), volatility and Sharpe (no
// risk-free rate) of simple daily returns, and the worst drawdown.
export function closeStats(c) {
  const r = [];
  for (let i = 1; i < c.length; i++) r.push(c[i] / c[i - 1] - 1);
  const n = r.length, mean = n ? r.reduce((a, b) => a + b, 0) / n : 0, sd = n > 1 ? Math.sqrt(r.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  let peak = c[0], worst = 0;
  for (const x of c) { peak = Math.max(peak, x); worst = Math.min(worst, x / peak - 1); }
  const total = c.at(-1) / c[0] - 1, years = n / 252;
  return { total, cagr: years >= 0.5 ? (1 + total) ** (1 / years) - 1 : null, volatility: sd * Math.sqrt(252), sharpe: sd > 0 ? (mean / sd) * Math.sqrt(252) : null, max_drawdown: worst, returns: r };
}
const betaOf = (y, x) => {
  const n = Math.min(x.length, y.length), mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n;
  let cov = 0, vx = 0;
  for (let i = 0; i < n; i++) { cov += (x[i] - mx) * (y[i] - my); vx += (x[i] - mx) ** 2; }
  return vx > 0 ? cov / vx : null;
};
// A statement's line other lines are read against: revenue for an income statement, total assets
// for a balance sheet (none for cash flows). An index into rows, or null.
export function baseLine(kind, rows, off) {
  const find = (re) => rows.findIndex((r) => re.test(String(r[0]).trim()) && r.slice(off).some(finite));
  if (kind === "balance_sheet") { const i = find(/^total assets$/i); return i >= 0 ? i : null; }
  if (kind === "income" || kind === "comprehensive_income") {
    const i = find(/^(total )?(net )?(revenues?|sales)( and other income)?,?( net)?$/i);
    if (i >= 0) return i;
    const j = find(/^(?!.*cost).*(revenue|sales)/i);
    return j >= 0 ? j : null;
  }
  return null;
}
// The date a period heading ends on ("12 months to 2025-09-27", "2025-09-27"), or null.
const periodEnd = (h) => (/(\d{4}-\d{2}-\d{2})\s*$/.exec(String(h)) ?? [])[1] ?? null;

// ---------------------------------------------------------------------------------------------
// What a result holds that these views draw (studioFor calls this)
// ---------------------------------------------------------------------------------------------
const STATEMENT_KEYS = [["income", "Income"], ["balance_sheet", "Balance sheet"], ["cash_flow", "Cash flows"], ["comprehensive_income", "Comprehensive income"], ["equity", "Equity"]];
const MARKET_COLS = ["symbol", "name", "day", "week", "month", "year_to_date"];
export function atlasFor(result, use, used) {
  const out = [], c = colsOf(result) ?? (Array.isArray(result.columns) ? result.columns.map(String) : null);
  if (c && MARKET_COLS.every((k) => c.includes(k))) {
    const groups = Object.entries(result).filter(([k, v]) => k !== "columns" && k !== "rows" && Array.isArray(v) && v.length && v.every((r) => Array.isArray(r) && r.length === c.length));
    if (groups.length) { out.push(place("market", { ...result, groups: groups.map(([k]) => k) })); use("columns", "meaning", ...groups.map(([k]) => k)); }
  }
  if (c && c[0] === "date" && c.slice(1).filter((h) => tenorYears(h) !== null).length >= 4 && Array.isArray(result.rows) && result.rows.length && !used.has("rows")) {
    out.push(place("curve", result)); use("columns", "rows", "yields", "spreads_points", "date", "start", "end", "count");
  }
  const statements = STATEMENT_KEYS.filter(([k]) => { const s = result[k], sc = colsOf(s); return sc && sc[0] === "line" && s.rows.length >= 2 && sc.length >= (sc[1] === "concept" ? 3 : 2); });
  if (statements.length) { out.push(place("statements", { company: result.company ?? null, items: statements.map(([k, label]) => [k, label, result[k]]) })); use(...statements.map(([k]) => k)); }
  const ts = colsOf(result.term_structure), sm = colsOf(result.smile);
  if (ts && sm && ts.includes("atm_iv") && sm[0] === "expiration" && result.smile.rows.length) { out.push(place("surface", result)); use("term_structure", "smile", "underlying"); }
  const m = result.matrix;
  if (Array.isArray(m) && m.length >= 2 && m.length <= 120 && m.every((r, i) => Array.isArray(r) && r.length === m.length && Math.abs(r[i] - 1) < 1e-6)) { out.push(place("corr", result)); use("matrix", "assets", "average_pairwise", "first_eigenvalue_share"); }
  return out;
}
// Several price series in a batch (two or more symbols, 30 closes or more each): one comparison.
export function compareFor(results) {
  if (!Array.isArray(results)) return "";
  const series = [], seen = new Set();
  for (const it of results) {
    const r = it && !it.error ? it.result : null;
    if (!r || !Array.isArray(r.dates) || !Array.isArray(r.close) || r.dates.length < 30 || r.close.length !== r.dates.length) continue;
    const symbol = String(r.symbol ?? `series ${series.length + 1}`);
    if (seen.has(symbol)) continue;
    seen.add(symbol); series.push({ symbol, name: r.name ?? null, dates: r.dates, close: r.close });
  }
  return series.length >= 2 ? place("compare", { series: series.slice(0, 8), more: Math.max(0, series.length - 8) }) : "";
}

// ---------------------------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------------------------
// A diverging fill for a change: the up or down colour, stronger for a bigger move.
const moveFill = (v, scale) => (finite(v) ? `background:color-mix(in srgb,var(${v >= 0 ? "--up" : "--dn"}) ${(8 + 40 * Math.min(1, Math.abs(v) / scale)).toFixed(0)}%,var(--bg))` : "");
// Lines over a numeric x (moneyness, years): a crosshair at the nearest x, a vertical guide.
function mountXY(box, spec) {
  const { xs, series, height = 220, fmtX = short, fmtY = short, guide = null, ticks = xs } = spec;
  box.style.position = "relative";
  box.innerHTML = '<div class="plot"></div><div class="xh" hidden></div><div class="tip" hidden></div>';
  const plot = box.querySelector(".plot"), tip = box.querySelector(".tip"), xh = box.querySelector(".xh"), x0 = Math.min(...xs), x1 = Math.max(...xs);
  let lay = null;
  const draw = () => {
    const W = clamp(plot.clientWidth || 700, 300, 1400), L = 6, R = 62, T = 8, B = 22, X = (x) => L + ((x - x0) / (x1 - x0 || 1)) * (W - L - R);
    const all = series.flatMap((s) => s.values.filter(finite));
    let lo = Math.min(...all), hi = Math.max(...all);
    if (lo === hi) { lo -= 0.01; hi += 0.01; }
    const pad = (hi - lo) * 0.06; lo -= pad; hi += pad;
    const Y = (y) => T + (1 - (y - lo) / (hi - lo)) * (height - T - B);
    let s = yGrid(lo, hi, Y, L, W - R, fmtY);
    if (finite(guide) && guide >= x0 && guide <= x1) s += `<line x1="${X(guide).toFixed(1)}" x2="${X(guide).toFixed(1)}" y1="${T}" y2="${height - B}" class="guide"/>`;
    for (const sr of series) s += `<path d="${pathOf(sr.values, (i) => X(xs[i]), Y)}" class="line ${sr.cls ?? "s0"}${sr.thin ? " thin" : ""}"${finite(sr.opacity) ? ` style="opacity:${sr.opacity.toFixed(2)}"` : ""}/>`;
    for (const t of ticks) s += `<text x="${X(t).toFixed(1)}" y="${height - 6}" class="axis" text-anchor="${t === x0 ? "start" : t === x1 ? "end" : "middle"}">${esc(fmtX(t))}</text>`;
    plot.innerHTML = `<svg viewBox="0 0 ${W} ${height}" width="${W}" height="${height}" role="img" aria-label="${esc(spec.title ?? "chart")}">${s}</svg>`;
    lay = { W, X };
  };
  plot.addEventListener("pointermove", (e) => {
    if (!lay) return;
    const rect = plot.getBoundingClientRect(), x = (e.clientX - rect.left) * (lay.W / rect.width);
    const i = xs.reduce((b, v, k) => (Math.abs(lay.X(v) - x) < Math.abs(lay.X(xs[b]) - x) ? k : b), 0), px = lay.X(xs[i]) * (rect.width / lay.W);
    xh.hidden = false; xh.style.left = `${px}px`; xh.style.top = "0px"; xh.style.height = `${plot.offsetHeight}px`;
    tipAt(tip, box, [`<b>${esc(fmtX(xs[i]))}</b>`, ...series.filter((sr) => finite(sr.values[i])).slice(0, 12).map((sr) => `${esc(sr.name)} ${esc(fmtY(sr.values[i]))}`)].join("<br>"), px, 40);
  });
  plot.addEventListener("pointerleave", () => { tip.hidden = true; xh.hidden = true; });
  if (typeof ResizeObserver === "function") { let w = 0; new ResizeObserver(() => { const now = plot.clientWidth; if (Math.abs(now - w) > 4) { w = now; draw(); } }).observe(plot); }
  draw();
}
// A correlation heatmap with its figures: the average pair, the first eigenvalue's share, the number
// of independent bets, the closest and most opposed pairs; as given or clustered.
function corrBlock(box, labels, m, given = {}) {
  let order = "given";
  const n = labels.length, eb = effectiveBets(m), cl = clusterOrder(m);
  const pairs = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (finite(m[i][j])) pairs.push([i, j, m[i][j]]);
  const avg = finite(given.average_pairwise) ? given.average_pairwise : pairs.length ? pairs.reduce((s, p) => s + p[2], 0) / pairs.length : null;
  const first = finite(given.first_eigenvalue_share) ? given.first_eigenvalue_share : eb.first_share;
  const hiPair = pairs.reduce((b, p) => (!b || p[2] > b[2] ? p : b), null), loPair = pairs.reduce((b, p) => (!b || p[2] < b[2] ? p : b), null);
  const meanTo = labels.map((_, i) => { const v = m[i].filter((x, j) => j !== i && finite(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; });
  const diversifier = meanTo.reduce((b, v, i) => (finite(v) && (b === null || v < meanTo[b]) ? i : b), null);
  const draw = () => {
    const ix = order === "given" ? labels.map((_, i) => i) : cl, show = n <= 16;
    const cell = (i, j) => {
      const v = m[i][j], k = finite(v) ? (70 * Math.abs(v)).toFixed(0) : 0;
      const bg = !finite(v) ? "" : i === j ? "background:var(--soft)" : `background:color-mix(in srgb,var(${v >= 0 ? "--dn" : "--info"}) ${k}%,var(--bg))`;
      return `<td class="cell${show ? "" : " dot"}" style="${bg}" title="${esc(`${labels[i]} and ${labels[j]}: ${finite(v) ? v.toFixed(3) : "n/a"}`)}">${show && finite(v) ? v.toFixed(2) : ""}</td>`;
    };
    box.innerHTML = `<div class="chips">${finite(avg) ? `<span class="chip">Average pair <b>${avg.toFixed(2)}</b></span>` : ""}${finite(eb.bets) ? `<span class="chip">Independent bets <b>${eb.bets.toFixed(1)}</b> of ${n}</span>` : ""}${finite(first) ? `<span class="chip">First factor <b>${pct(first, 0)}</b> of the variance</span>` : ""}${hiPair ? `<span class="chip">Closest <b>${esc(labels[hiPair[0]])} · ${esc(labels[hiPair[1]])}</b> ${hiPair[2].toFixed(2)}</span>` : ""}${loPair && n > 2 ? `<span class="chip">Most opposed <b>${esc(labels[loPair[0]])} · ${esc(labels[loPair[1]])}</b> ${loPair[2].toFixed(2)}</span>` : ""}${diversifier !== null && n > 2 ? `<span class="chip">Best diversifier <b>${esc(labels[diversifier])}</b> (average ${meanTo[diversifier].toFixed(2)})</span>` : ""}</div>
<div class="ctl"><span class="grp">${toggle("o-given", "As given", order === "given")}${toggle("o-cluster", "Clustered", order === "cluster")}</span></div>
<div class="scroll"><table class="hm corr"><thead><tr><th></th>${ix.map((j) => `<th class="c" title="${esc(labels[j])}">${esc(String(labels[j]).slice(0, 8))}</th>`).join("")}</tr></thead><tbody>${ix.map((i) => `<tr><th>${esc(String(labels[i]).slice(0, 14))}</th>${ix.map((j) => cell(i, j)).join("")}</tr>`).join("")}</tbody></table></div>
<p class="note">Orange: move together; blue: move apart; stronger is further from zero. Independent bets is (sum of eigenvalues)² over the sum of their squares: ${n} assets that all move as one are one bet, and a Sharpe ratio grows with the square root of the bets, not of the assets.</p>`;
  };
  box.addEventListener("click", (e) => { const b = e.target.closest("button[data-t]"); if (b && b.dataset.t.startsWith("o-")) { order = b.dataset.t === "o-cluster" ? "cluster" : "given"; draw(); } });
  draw();
}

// ---------------------------------------------------------------------------------------------
// Market map: every market as a tile, coloured by its move over the period; a tile opens its chart
// ---------------------------------------------------------------------------------------------
const MARKET_PERIODS = [["day", "Day", 0.02, 0.1], ["week", "Week", 0.04, 0.2], ["month", "Month", 0.08, 0.3], ["three_months", "3 months", 0.15, 0.5], ["year_to_date", "YTD", 0.25, 1], ["year", "Year", 0.3, 1]];
const MARKET_GROUPS = { us: "United States", sectors: "S&P 500 sectors", rates: "Treasury yields", currencies: "Currencies", commodities: "Commodities", crypto: "Crypto", world: "World" };
function mountMarket(el, data, p, host) {
  let r = data, period = "day", ranked = false, busy = false, error = null, showTable = false, refreshed = null;
  const draw = () => {
    const c = r.columns, ix = Object.fromEntries(c.map((k, i) => [k, i])), per = MARKET_PERIODS.find(([k]) => k === period), groups = r.groups.filter((g) => Array.isArray(r[g]));
    const change = (row, g) => row[ix[period]], points = (g) => g === "rates";
    const label = (v, g) => (!finite(v) ? "–" : points(g) ? `${v > 0 ? "+" : ""}${Math.round(v * 100)} bp` : signed(v, Math.abs(v) < 0.1 ? 2 : 1));
    const all = groups.filter((g) => !points(g)).flatMap((g) => r[g].map((row) => [row, g])).filter(([row]) => finite(change(row)));
    const best = all.reduce((b, x) => (!b || change(x[0]) > change(b[0]) ? x : b), null), worst = all.reduce((b, x) => (!b || change(x[0]) < change(b[0]) ? x : b), null);
    const sec = Array.isArray(r.sectors) ? r.sectors.filter((row) => finite(change(row))) : [];
    const latest = groups.flatMap((g) => r[g].map((row) => String(row[ix.date] ?? ""))).sort().at(-1);
    const sections = groups.map((g) => {
      const rows = ranked ? [...r[g]].sort((a, b) => (change(b) ?? -Infinity) - (change(a) ?? -Infinity)) : r[g];
      return `<h3>${esc(MARKET_GROUPS[g] ?? g.replace(/_/g, " "))}</h3><div class="mtiles">${rows.map((row) => `<button type="button" class="mt" data-s="${esc(row[ix.symbol])}" style="${moveFill(change(row), points(g) ? per[3] : per[2])}" title="${esc(`${row[ix.name]} (${row[ix.symbol]}), close ${fmt(row[ix.close])} on ${row[ix.date]}`)}"><span class="n">${esc(row[ix.name])}</span><span class="v">${esc(label(change(row), g))}</span><span class="sub">${esc(row[ix.symbol])} · ${fmt(row[ix.close])}</span></button>`).join("")}</div>`;
    }).join("");
    el.innerHTML = `<p class="lead">The market at a glance <span class="sub">${latest ? `closes to ${esc(latest)}` : ""}${refreshed ? ` · refreshed ${esc(refreshed)}` : ""}</span></p>
<div class="ctl" role="toolbar" aria-label="Market map controls"><span class="grp">${MARKET_PERIODS.map(([k, lab]) => toggle(`p-${k}`, lab, period === k)).join("")}</span>${toggle("rank", "Rank", ranked)}${toggle("table", "Table", showTable)}${host.canCall ? btn(busy ? "Refreshing…" : "Refresh", `data-m="refresh"${busy ? " disabled" : ""}`) : ""}${host.canMessage ? btn("Ask Claude what moved", 'data-m="ask"') : ""}</div>
${best && worst ? `<div class="chips"><span class="chip">Best <b>${esc(best[0][ix.name])}</b> ${esc(label(change(best[0]), best[1]))}</span><span class="chip">Worst <b>${esc(worst[0][ix.name])}</b> ${esc(label(change(worst[0]), worst[1]))}</span>${sec.length ? `<span class="chip">Sectors up <b>${sec.filter((row) => change(row) > 0).length} of ${sec.length}</b></span>` : ""}</div>` : ""}
${error ? `<p class="error">${esc(error)}</p>` : ""}${sections}
<p class="note">Colour: green up, orange down over the ${esc(per[1].toLowerCase())}, stronger for a bigger move; yields move in basis points. ${host.canCall ? "Click a market for its chart. " : ""}${r.meaning ? esc(r.meaning) : ""}</p>
${showTable ? groups.map((g) => table({ columns: c, rows: r[g], title: MARKET_GROUPS[g] ?? g })).join("") : ""}<div class="drill"></div>`;
  };
  el.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    // The chart opened below has its own controls.
    if (!b || e.target.closest(".drill")) return;
    if (b.dataset.t && b.dataset.t.startsWith("p-")) { period = b.dataset.t.slice(2); draw(); return; }
    if (b.dataset.t === "rank") { ranked = !ranked; draw(); return; }
    if (b.dataset.t === "table") { showTable = !showTable; draw(); return; }
    if (b.dataset.m === "refresh") {
      busy = true; error = null; draw();
      try { r = { ...(await callAgain(host, p, {})), groups: r.groups }; refreshed = new Date().toTimeString().slice(0, 8); } catch (err) { error = err.message; }
      busy = false; draw(); return;
    }
    if (b.dataset.m === "ask") {
      const ix = Object.fromEntries(r.columns.map((k, i) => [k, i])), per = MARKET_PERIODS.find(([k]) => k === period)[1].toLowerCase();
      const lines = r.groups.filter((g) => Array.isArray(r[g])).map((g) => `${MARKET_GROUPS[g] ?? g}: ${r[g].map((row) => `${row[ix.name]} ${finite(row[ix[period]]) ? (g === "rates" ? `${Math.round(row[ix[period]] * 100)}bp` : `${(row[ix[period]] * 100).toFixed(1)}%`) : "n/a"}`).join(", ")}`);
      host.message(`From the market map, the moves over the ${per}: ${lines.join(". ")}. What drove the biggest moves, and what do they say together?`).catch(() => {});
      return;
    }
    if (b.dataset.s && host.canCall) {
      const box = el.querySelector(".drill"), sym = b.dataset.s;
      box.innerHTML = `<p class="sub">Loading ${esc(sym)}…</p>`;
      try {
        const end = new Date().toISOString().slice(0, 10), px = await callAgain(host, { input: {}, call: null }, { symbol: sym, start: isoDaysBefore(end, 730) }, "price_history");
        box.innerHTML = `<h3>${esc(px.name ?? sym)} <span class="sub">${esc(sym)}</span></h3><div class="w"></div>`;
        mountCandles(box.querySelector(".w"), px);
        box.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
      } catch (err) { box.innerHTML = `<p class="error">${esc(err.message)}</p>`; }
    }
  });
  draw();
}

// ---------------------------------------------------------------------------------------------
// Yield curve: the curve on a day against earlier ones, a scrubber through its history, spreads
// ---------------------------------------------------------------------------------------------
const CURVE_COMPARE = [["1m", "1 month ago", 30, "s1"], ["1y", "1 year ago", 365, "s2"], ["5y", "5 years ago", 1826, "s3"]];
const CURVE_TICKS = new Set([1 / 12, 0.25, 0.5, 1, 2, 3, 5, 7, 10, 20, 30]);
function mountCurve(el, data, p, host) {
  let r = data, cols = [], hist = [], idx = 0, busy = false, error = null, timer = null;
  const cmp = new Set(), ranged = Array.isArray(data.rows) && data.rows.length > 20;
  let loaded = ranged;
  const take = (res) => {
    r = res; cols = res.columns.map((h, i) => ({ h, i, y: tenorYears(h) })).filter((t) => t.y !== null).sort((a, b) => a.y - b.y);
    hist = [...res.rows].filter((row) => cols.filter((t) => finite(row[t.i])).length >= 4).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    idx = hist.length - 1;
  };
  take(data);
  if (!hist.length || cols.length < 4) { el.innerHTML = '<p class="note">No day in this result has four maturities to draw.</p>'; return; }
  const at = (h, row) => { const t = cols.find((x) => x.h === h); return t ? row[t.i] : null; };
  const spread = (row, a, b) => (finite(at(a, row)) && finite(at(b, row)) ? at(a, row) - at(b, row) : null);
  const before = (days) => { const target = isoDaysBefore(String(hist[idx][0]), days); let k = -1; for (let i = 0; i <= idx; i++) if (String(hist[i][0]) <= target) k = i; return k; };
  const load = async () => {
    busy = true; error = null; build();
    try { const end = String(hist.at(-1)[0]); take(await callAgain(host, p, { start: isoDaysBefore(end, 5 * 365 + 7), end, date: undefined })); loaded = true; } catch (err) { error = err.message; }
    busy = false; build();
  };
  const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
  const paint = () => {
    const row = hist[idx], W = clamp(el.querySelector(".plot")?.clientWidth || 700, 300, 1400), H = 240, L = 6, R = 62, T = 10, B = 24, top = Math.sqrt(cols.at(-1).y);
    const X = (y) => L + (Math.sqrt(y) / top) * (W - L - R);
    const lines = [{ name: String(row[0]), row, cls: "s0", main: true }];
    const missing = [];
    for (const [k, lab, days, cls] of CURVE_COMPARE) if (cmp.has(k)) { const i = before(days); if (i >= 0) lines.push({ name: `${lab} (${hist[i][0]})`, row: hist[i], cls }); else missing.push(lab); }
    if (idx !== hist.length - 1) lines.push({ name: `latest (${hist.at(-1)[0]})`, row: hist.at(-1), cls: "s0", ghost: true });
    const vals = lines.flatMap((x) => cols.map((t) => x.row[t.i]).filter(finite));
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (lo === hi) { lo -= 0.5; hi += 0.5; }
    const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
    const Y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    let s = yGrid(lo, hi, Y, L, W - R, (v) => `${v.toFixed(2)}%`);
    for (const x of [...lines].reverse()) {
      const pts = cols.map((t) => [t.y, x.row[t.i]]).filter(([, v]) => finite(v));
      s += `<path d="${pts.map(([y, v], k) => `${k ? "L" : "M"}${X(y).toFixed(1)},${Y(v).toFixed(1)}`).join("")}" class="line ${x.cls}${x.main ? "" : " thin"}"${x.ghost ? ' style="opacity:.35;stroke-dasharray:4 3"' : ""}/>`;
      if (x.main) s += pts.map(([y, v]) => `<circle cx="${X(y).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="3" class="pt"/>`).join("");
    }
    for (const t of cols) if (CURVE_TICKS.has(t.y)) s += `<text x="${X(t.y).toFixed(1)}" y="${H - 6}" class="axis" text-anchor="middle">${esc(tenorLabel(t.y))}</text>`;
    el.querySelector(".plot").innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(`Treasury yield curve on ${row[0]}`)}">${s}</svg>`;
    el._curve = { W, X, lines };
    const s102 = spread(row, "10 Yr", "2 Yr"), s103 = spread(row, "10 Yr", "3 Mo"), s305 = spread(row, "30 Yr", "5 Yr"), ten = at("10 Yr", row);
    const chip = (lab, v) => (finite(v) ? `<span class="chip">${lab} <b>${v > 0 ? "+" : ""}${v.toFixed(2)} pt</b>${v < 0 ? ' <span class="badge warn">inverted</span>' : ""}</span>` : "");
    el.querySelector(".chips").innerHTML = `${finite(ten) ? `<span class="chip">10-year <b>${ten.toFixed(2)}%</b></span>` : ""}${chip("10Y − 2Y", s102)}${chip("10Y − 3M", s103)}${chip("30Y − 5Y", s305)}`;
    el.querySelector(".legend").innerHTML = lines.map((x) => `<span><i class="${x.cls}"${x.ghost ? ' style="opacity:.35"' : ""}></i>${esc(x.name)}</span>`).join("") + (missing.length ? `<span>${esc(missing.join(", "))}: before the history loaded</span>` : "");
    const lab = el.querySelector(".when");
    if (lab) lab.textContent = String(row[0]);
  };
  const build = () => {
    stop();
    const n = hist.length, inverted = n > 20 ? hist.filter((row) => finite(spread(row, "10 Yr", "2 Yr")) && spread(row, "10 Yr", "2 Yr") < 0).length : 0;
    el.innerHTML = `<p class="lead">US Treasury yield curve <span class="sub">${esc(r.curve ?? "nominal")} · ${esc(r.units ?? "percent a year")}${n > 1 ? ` · ${esc(hist[0][0])} to ${esc(hist.at(-1)[0])}` : ""}</span></p><div class="chips"></div>
<div class="ctl" role="toolbar" aria-label="Curve controls"><span class="grp">${CURVE_COMPARE.map(([k, lab]) => toggle(`c-${k}`, lab, cmp.has(k))).join("")}</span>${!loaded && host.canCall ? btn(busy ? "Loading…" : "Load 5 years", `data-c="load"${busy ? " disabled" : ""}`) : ""}</div>
${error ? `<p class="error">${esc(error)}</p>` : ""}<div class="wrap"><div class="plot"></div><div class="tip" hidden></div></div><div class="legend"></div>
${n > 20 ? `<div class="scrub">${btn("▶ Play", 'data-c="play"')}<input type="range" data-c="scrub" min="0" max="${n - 1}" value="${idx}" aria-label="Date"><b class="when"></b></div>
<h3>Spreads over time</h3><div class="spreads"></div><div class="legend"><span><i class="s0"></i>10Y − 2Y</span><span><i class="s1"></i>10Y − 3M</span></div><p class="note">The 10-year minus the 2-year was below zero (inverted) on ${fmt(inverted)} of these ${fmt(n)} days. An inverted curve has come before most US recessions, with long and varying lags.</p>` : ""}
<p class="note">Maturities are spaced by the square root of their length, so the short end is readable. ${loaded ? "Drag the slider, or press Play, to run the curve through time." : host.canCall ? "Comparisons further back than this result load five years of history once." : ""}</p>`;
    if (n > 20) mountLines(el.querySelector(".spreads"), { labels: hist.map((row) => String(row[0])), series: [{ name: "10Y − 2Y", values: hist.map((row) => spread(row, "10 Yr", "2 Yr")), cls: "s0" }, { name: "10Y − 3M", values: hist.map((row) => spread(row, "10 Yr", "3 Mo")), cls: "s1" }], height: 160, zero: true, title: "Spreads", fmtY: (v) => (finite(v) ? `${v.toFixed(2)} pt` : "–") });
    paint();
  };
  el.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.t && b.dataset.t.startsWith("c-")) {
      const k = b.dataset.t.slice(2), days = CURVE_COMPARE.find((x) => x[0] === k)[2];
      if (cmp.has(k)) cmp.delete(k); else cmp.add(k);
      b.setAttribute("aria-pressed", String(cmp.has(k)));
      if (cmp.has(k) && before(days) < 0 && !loaded && host.canCall) { await load(); return; }
      paint(); return;
    }
    if (b.dataset.c === "load") { load(); return; }
    if (b.dataset.c === "play") {
      if (timer) { stop(); b.textContent = "▶ Play"; return; }
      if (idx >= hist.length - 1) idx = 0;
      b.textContent = "❚❚ Pause";
      const step = Math.max(1, Math.round(hist.length / 300)), slider = el.querySelector('input[data-c="scrub"]');
      timer = setInterval(() => {
        if (!el.isConnected) { stop(); return; }
        idx = Math.min(hist.length - 1, idx + step); slider.value = String(idx); paint();
        if (idx >= hist.length - 1) { stop(); b.textContent = "▶ Play"; }
      }, 40);
    }
  });
  el.addEventListener("input", (e) => { const s = e.target.closest('input[data-c="scrub"]'); if (s) { idx = +s.value; paint(); } });
  el.addEventListener("pointermove", (e) => {
    const plot = e.target.closest(".plot"), c = el._curve;
    if (!plot || !c) return;
    const tip = el.querySelector(".tip"), rect = plot.getBoundingClientRect(), x = (e.clientX - rect.left) * (c.W / rect.width);
    const t = cols.reduce((b, k) => (Math.abs(c.X(k.y) - x) < Math.abs(c.X(b.y) - x) ? k : b), cols[0]), main = c.lines[0].row[t.i];
    tipAt(tip, el.querySelector(".wrap"), [`<b>${esc(tenorLabel(t.y))}</b>`, ...c.lines.map((l) => { const v = l.row[t.i]; return `${esc(l.name)} ${finite(v) ? `${v.toFixed(2)}%` : "–"}${!l.main && finite(v) && finite(main) ? (l.ghost ? ` (${v - main >= 0 ? "+" : ""}${Math.round((v - main) * 100)} bp later)` : ` (${main - v >= 0 ? "+" : ""}${Math.round((main - v) * 100)} bp since)`) : ""}`; })].join("<br>"), c.X(t.y) * (rect.width / c.W), 40);
  });
  el.addEventListener("pointerleave", () => { const tip = el.querySelector(".tip"); if (tip) tip.hidden = true; });
  build();
}

// ---------------------------------------------------------------------------------------------
// Statements: as filed, as a share of revenue or assets, or year-on-year growth; lines charted
// ---------------------------------------------------------------------------------------------
function mountStatements(el, data) {
  let tab = 0, mode = "filed";
  const picked = new Map();
  const draw = () => {
    const [key, , st] = data.items[tab], cols = st.columns, off = cols[1] === "concept" ? 2 : 1, periods = cols.slice(off), rows = st.rows;
    const ends = periods.map(periodEnd), base = baseLine(key, rows, off);
    // Columns are newest first as filed; each period's older neighbour is the one ending before it.
    const older = periods.map((_, j) => { const e = ends[j]; let b = -1; ends.forEach((x, k) => { if (x && e && x < e && (b < 0 || x > ends[b])) b = k; }); return b; });
    const chron = periods.map((_, j) => j).sort((a, b) => String(ends[a] ?? a).localeCompare(String(ends[b] ?? b)));
    if (!picked.has(tab)) { const want = [base, rows.findIndex((x) => /^net (income|earnings)( \(loss\))?$|^net (loss|income \(loss\))$/i.test(String(x[0]).trim())), rows.findIndex((x) => /operating activities$/i.test(String(x[0]).trim()) && x.slice(off).some(finite))]; picked.set(tab, [...new Set(want.filter((i) => i !== null && i >= 0))].slice(0, 2)); if (!picked.get(tab).length) { const f = rows.findIndex((x) => x.slice(off).some(finite)); picked.set(tab, f >= 0 ? [f] : []); } }
    const sel = picked.get(tab), shown = (row, j) => {
      const v = row[off + j];
      if (!finite(v)) return null;
      if (mode === "share") { const b = base === null ? null : rows[base][off + j]; return finite(b) && b ? v / b : null; }
      if (mode === "growth") { const k = older[j], w = k >= 0 ? row[off + k] : null; return finite(w) && w ? v / Math.abs(w) - (w < 0 ? -1 : 1) : null; }
      return v;
    };
    const cellText = (v) => (!finite(v) ? "" : mode === "filed" ? fmt(v) : mode === "share" ? pct(v) : signed(v));
    const mini = (row) => {
      const vs = chron.map((j) => row[off + j]);
      if (vs.filter(finite).length < 2) return "";
      const mx = Math.max(...vs.filter(finite).map(Math.abs)) || 1, w = 9, gap = 3, H = 18, mid = vs.some((v) => v < 0) ? H / 2 : H;
      return `<svg class="mini" viewBox="0 0 ${vs.length * (w + gap)} ${H}" width="${vs.length * (w + gap)}" height="${H}" aria-hidden="true">${vs.map((v, i) => { if (!finite(v)) return ""; const h = Math.max(1, (Math.abs(v) / mx) * (mid === H ? H : H / 2)); return `<rect x="${i * (w + gap)}" y="${(v >= 0 ? mid - h : mid).toFixed(1)}" width="${w}" height="${h.toFixed(1)}" rx="1.5" class="${v >= 0 ? "b0" : "bn"}"/>`; }).join("")}</svg>`;
    };
    const body = rows.map((row, i) => {
      const heading = row.slice(off).every((v) => v === null || v === "");
      if (heading) return `<tr class="heading"><td colspan="${periods.length + 2}">${esc(row[0])}</td></tr>`;
      return `<tr data-i="${i}" class="pick${sel.includes(i) ? " sel" : ""}${i === base && mode === "share" ? " base" : ""}"><td title="${esc(off === 2 ? String(row[1]) : "")}">${esc(row[0])}</td>${periods.map((_, j) => { const v = shown(row, j); return `<td class="num">${cellText(v)}</td>`; }).join("")}<td>${mini(row)}</td></tr>`;
    }).join("");
    const can = { share: base !== null, growth: older.some((k) => k >= 0) };
    // As a share, the line everything is over is 100% everywhere; it is left out of the chart.
    const charted = mode === "share" && sel.length > 1 ? sel.filter((i) => i !== base) : sel;
    el.innerHTML = `${data.company?.name ? `<p class="lead">${esc(data.company.name)} <span class="sub">${esc(st.units ?? "")}</span></p>` : ""}<div class="ctl" role="toolbar" aria-label="Statement controls">${data.items.length > 1 ? `<span class="grp">${data.items.map(([, label], i) => toggle(`tab-${i}`, label, i === tab)).join("")}</span>` : ""}<span class="grp">${toggle("m-filed", "As filed", mode === "filed")}${can.share ? toggle("m-share", key === "balance_sheet" ? "% of total assets" : "% of revenue", mode === "share") : ""}${can.growth ? toggle("m-growth", "Growth", mode === "growth") : ""}</span></div>
<div class="bars"></div><div class="legend">${charted.map((i, k) => `<span><i class="s${k}"></i>${esc(rows[i][0])}</span>`).join("")}</div>
<h3>${esc(st.title ?? data.items[tab][1])}</h3><div class="scroll"><table class="stmt"><thead><tr><th>line</th>${periods.map((h) => `<th class="num">${esc(ends[periods.indexOf(h)] ? dateLabel(ends[periods.indexOf(h)], true) : h)}</th>`).join("")}<th>trend</th></tr></thead><tbody>${body}</tbody></table></div>
<p class="note">Figures as filed (${esc(st.units ?? "as the statement shows them")}). Click lines to chart them (up to four); hover a line for its XBRL concept.${mode === "share" ? ` Each figure over ${esc(rows[base][0])} in the same period: for an income statement these are its margins.` : mode === "growth" ? " Each figure against the period before it." : ""}</p>`;
    bars(el.querySelector(".bars"), chron.map((j) => (ends[j] ? dateLabel(ends[j], true) : periods[j])), charted.map((i, k) => ({ name: String(rows[i][0]), values: chron.map((j) => shown(rows[i], j)), cls: `b${k}` })), mode === "filed" ? short : mode === "share" ? (v) => pct(v) : (v) => signed(v));
  };
  el.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-t]"), tr = e.target.closest("tr[data-i]");
    if (b && b.dataset.t.startsWith("tab-")) { tab = +b.dataset.t.slice(4); mode = "filed"; draw(); return; }
    if (b && b.dataset.t.startsWith("m-")) { mode = b.dataset.t.slice(2); draw(); return; }
    if (tr) { const i = +tr.dataset.i, sel = picked.get(tab), at = sel.indexOf(i); if (at >= 0) sel.splice(at, 1); else { sel.push(i); if (sel.length > 4) sel.shift(); } draw(); }
  });
  draw();
}
// Grouped bars: one group per period, one bar per line, from zero.
function bars(box, labels, series, fmtY) {
  if (!series.length) { box.innerHTML = ""; return; }
  const W = clamp(box.clientWidth || 700, 300, 1400), H = 190, L = 6, R = 70, T = 8, B = 22, all = series.flatMap((s) => s.values.filter(finite));
  let lo = Math.min(0, ...all), hi = Math.max(0, ...all);
  if (lo === hi) hi = 1;
  const Y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B), gw = (W - L - R) / labels.length, bw = Math.min(28, (gw * 0.72) / series.length);
  let s = yGrid(lo, hi, Y, L, W - R, fmtY, 3) + `<line x1="${L}" x2="${W - R}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}" class="guide"/>`;
  labels.forEach((lab, g) => {
    const x0 = L + g * gw + (gw - bw * series.length) / 2;
    series.forEach((sr, k) => { const v = sr.values[g]; if (!finite(v)) return; const y = Y(Math.max(v, 0)), h = Math.max(1, Math.abs(Y(v) - Y(0))); s += `<rect x="${(x0 + k * bw + 1).toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="2" class="${sr.cls}"><title>${esc(`${sr.name}, ${lab}: ${fmtY(v)}`)}</title></rect>`; });
    s += `<text x="${(L + g * gw + gw / 2).toFixed(1)}" y="${H - 6}" class="axis" text-anchor="middle">${esc(lab)}</text>`;
  });
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(series.map((x) => x.name).join(", "))} by period">${s}</svg>`;
}

// ---------------------------------------------------------------------------------------------
// Correlation matrix (correlation_matrix): the heatmap and its figures
// ---------------------------------------------------------------------------------------------
function mountCorr(el, r) {
  const labels = r.matrix.map((_, i) => String(Array.isArray(r.assets) && r.assets.length === r.matrix.length ? r.assets[i] : `asset ${i + 1}`));
  el.innerHTML = '<p class="lead">Correlations</p><div class="cb"></div>';
  corrBlock(el.querySelector(".cb"), labels, r.matrix, r);
}

// ---------------------------------------------------------------------------------------------
// Volatility surface (volatility_surface): smiles by expiration, the term structure, the grid
// ---------------------------------------------------------------------------------------------
function mountSurface(el, r) {
  const sm = r.smile, sc = sm.columns, ts = r.term_structure, tc = Object.fromEntries(ts.columns.map((k, i) => [k, i])), u = r.underlying || {};
  const ms = sc.slice(1).map((h) => Number(String(h).replace(/^iv_at_/, ""))), n = sm.rows.length;
  const all = sm.rows.flatMap((row) => row.slice(1).filter(finite)), lo = Math.min(...all), hi = Math.max(...all);
  const days = new Map(ts.rows.map((row) => [String(row[tc.expiration]), row[tc.days]]));
  const atm = ts.rows.map((row) => row[tc.atm_iv]).filter(finite), shape = atm.length >= 2 ? (atm.at(-1) > atm[0] ? "upward: later expirations are priced more volatile (calm now)" : "inverted: the near term is priced more volatile (stress now)") : null;
  const shade = (v) => (finite(v) ? `background:color-mix(in srgb,var(--s0) ${(10 + 60 * ((v - lo) / (hi - lo || 1))).toFixed(0)}%,var(--bg))` : "");
  const front = ts.rows[0];
  el.innerHTML = `<p class="lead">${esc(u.symbol ?? "")} volatility surface <span class="sub">${u.as_of ? `Cboe delayed, ${esc(u.as_of)}` : ""}</span></p>
<div class="chips">${finite(u.price) ? `<span class="chip">Price <b>${fmt(u.price)}</b></span>` : ""}${finite(u.iv30) ? `<span class="chip">IV30 <b>${pct(u.iv30)}</b></span>` : ""}${front && finite(front[tc.atm_iv]) ? `<span class="chip">Front ATM IV <b>${pct(front[tc.atm_iv])}</b></span>` : ""}${front && finite(front[tc.risk_reversal]) ? `<span class="chip">Front 25Δ skew <b>${(front[tc.risk_reversal] * 100).toFixed(1)} pt</b> puts over calls</span>` : ""}${shape ? `<span class="chip">Term structure <b>${esc(shape.split(":")[0])}</b></span>` : ""}</div>
<h3>Smile by expiration</h3><div class="smile"></div><div class="legend"><span><i class="s0" style="opacity:.3"></i>${esc(sm.rows[0][0])}${days.has(String(sm.rows[0][0])) ? ` (${days.get(String(sm.rows[0][0]))} days)` : ""}</span><span><i class="s0"></i>${esc(sm.rows.at(-1)[0])}${days.has(String(sm.rows.at(-1)[0])) ? ` (${days.get(String(sm.rows.at(-1)[0]))} days)` : ""}</span><span>darker is later</span></div>
<h3>Term structure</h3><div class="term"></div><div class="legend"><span><i class="s0"></i>at the money</span>${"put_25_delta_iv" in tc ? '<span><i class="s1"></i>25Δ put</span>' : ""}${"call_25_delta_iv" in tc ? '<span><i class="s2"></i>25Δ call</span>' : ""}</div>
<h3>Surface</h3><div class="scroll"><table class="hm"><thead><tr><th>expiration ↓ strike/price →</th>${ms.map((m) => `<th class="c">${m.toFixed(2)}</th>`).join("")}</tr></thead><tbody>${sm.rows.map((row) => `<tr><th>${esc(row[0])}${days.has(String(row[0])) ? ` <span class="sub">${days.get(String(row[0]))}d</span>` : ""}</th>${row.slice(1).map((v) => `<td class="cell" style="${shade(v)}">${finite(v) ? pct(v) : "–"}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
<p class="note">${shape ? `The term structure is ${esc(shape)}. ` : ""}Moneyness is strike over the price: below 1 are puts' strikes, above 1 calls'. Darker cells are higher implied volatility. ${esc(sm.note ?? "")}</p>`;
  mountXY(el.querySelector(".smile"), { xs: ms, series: sm.rows.map((row, k) => ({ name: String(row[0]), values: row.slice(1), cls: "s0", thin: true, opacity: n > 1 ? 0.3 + (0.7 * k) / (n - 1) : 1 })), fmtX: (x) => x.toFixed(2), fmtY: (v) => pct(v), guide: 1, title: "Implied volatility by moneyness" });
  mountLines(el.querySelector(".term"), { labels: ts.rows.map((row) => String(row[tc.expiration])), series: [["atm_iv", "at the money", "s0"], ["put_25_delta_iv", "25Δ put", "s1"], ["call_25_delta_iv", "25Δ call", "s2"]].filter(([k]) => k in tc).map(([k, name, cls]) => ({ name, values: ts.rows.map((row) => row[tc[k]]), cls })), height: 170, title: "Term structure", fmtY: (v) => pct(v) });
}

// ---------------------------------------------------------------------------------------------
// Several prices compared: growth of 1, their figures, and how their returns move together
// ---------------------------------------------------------------------------------------------
const COMPARE_RANGES = [["3M", 63], ["6M", 126], ["YTD", "ytd"], ["1Y", 252], ["3Y", 756], ["5Y", 1260], ["All", "all"]];
// Eight categorical colours checked for colour-blind separation in both themes (--k0 to --k7).
const COMPARE_CLASSES = ["k0", "k1", "k2", "k3", "k4", "k5", "k6", "k7"];
function mountCompare(el, data) {
  const { dates, closes } = alignCloses(data.series), N = dates.length, syms = data.series.map((s) => s.symbol);
  if (N < 20) { el.innerHTML = `<p class="note">${esc(syms.join(", "))} share only ${N} dates, too few to compare.</p>`; return; }
  let span = Math.min(N, 252), sort = null;
  const draw = () => {
    const from = N - span, d = dates.slice(from), cs = closes.map((c) => c.slice(from)), st = cs.map(closeStats), bench = st[0].returns;
    const rows = st.map((x, i) => [syms[i], x.total, x.cagr, x.volatility, x.sharpe, x.max_drawdown, i ? correlationOf([x.returns, bench])[0][1] : 1, i ? betaOf(x.returns, bench) : 1]);
    const order = rows.map((_, i) => i);
    if (sort) order.sort((a, b) => ((rows[a][sort.i] ?? -Infinity) - (rows[b][sort.i] ?? -Infinity)) * sort.dir);
    const heads = ["symbol", "return", "CAGR", "volatility", "Sharpe", "max drawdown", `ρ to ${syms[0]}`, `β to ${syms[0]}`];
    const f = [String, (v) => signed(v), (v) => signed(v), (v) => pct(v), (v) => (finite(v) ? v.toFixed(2) : "–"), (v) => pct(v), (v) => (finite(v) ? v.toFixed(2) : "–"), (v) => (finite(v) ? v.toFixed(2) : "–")];
    el.innerHTML = `<p class="lead">${esc(syms.join(" · "))} <span class="sub">${esc(d[0])} to ${esc(d.at(-1))}, ${fmt(d.length)} common closes${data.more ? `; ${data.more} more not compared` : ""}</span></p>
<div class="ctl" role="toolbar" aria-label="Range"><span class="grp">${COMPARE_RANGES.map(([k, v]) => btn(k, `data-r="${v}"${(v === "all" ? N : v === "ytd" ? null : Math.min(N, v)) === span ? ' aria-pressed="true"' : ""}`)).join("")}</span></div>
<h3>Growth of 1</h3><div class="eq"></div><div class="legend">${syms.map((s, i) => `<span><i class="${COMPARE_CLASSES[i]}"></i>${esc(s)}</span>`).join("")}</div>
<div class="scroll"><table class="cmp"><thead><tr>${heads.map((h, i) => `<th class="sort${i ? " num" : ""}" data-ci="${i}">${esc(h)}${sort && sort.i === i ? (sort.dir > 0 ? " ↑" : " ↓") : ""}</th>`).join("")}</tr></thead><tbody>${order.map((i) => `<tr>${rows[i].map((v, k) => `<td${k ? ' class="num"' : ""}>${k ? f[k](v) : `<i class="sw ${COMPARE_CLASSES[i]}"></i>${esc(v)}`}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
<p class="note">Daily closes on the dates every series has. Sharpe uses no risk-free rate; ρ and β are of daily returns against ${esc(syms[0])}.</p>
<h3>How their daily returns move together</h3><div class="cb"></div>`;
    mountLines(el.querySelector(".eq"), { labels: d, series: cs.map((c, i) => ({ name: syms[i], values: c.map((x) => x / c[0]), cls: COMPARE_CLASSES[i] })), title: "Growth of 1", fmtY: (y) => (finite(y) ? y.toFixed(2) : "–") });
    corrBlock(el.querySelector(".cb"), syms, correlationOf(st.map((x) => x.returns)));
  };
  el.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-r]"), th = e.target.closest("th[data-ci]");
    if (b) { const k = b.dataset.r; span = k === "all" ? N : k === "ytd" ? Math.max(2, N - dates.findIndex((x) => x.slice(0, 4) === dates[N - 1].slice(0, 4))) : Math.min(N, +k); draw(); return; }
    if (th) { const i = +th.dataset.ci; sort = sort && sort.i === i ? (sort.dir < 0 ? { i, dir: 1 } : null) : { i, dir: -1 }; draw(); }
  });
  draw();
}

export const ATLAS_MOUNTS = { market: mountMarket, curve: mountCurve, statements: mountStatements, corr: mountCorr, surface: mountSurface, compare: mountCompare };
