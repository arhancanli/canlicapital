// Views that show how far a result can be trusted (MCP Apps), beside atlas.js's: a strategy held
// against named crises with its capacity at each size, the luck cliff of a deflated Sharpe, the
// spread of cross-validated paths, and a reported figure traced down the filing's own arithmetic.
// Everything is drawn from the result in hand; dragging a limit or a count of tries is arithmetic
// in the frame and changes no verdict the tool gave.
import { esc, fmt, short } from "./render.js";
import { clamp, finite, pct, place, signed } from "./studio.js";

// ---------------------------------------------------------------------------------------------
// The deflated Sharpe at any number of tries (exported for the tests)
// ---------------------------------------------------------------------------------------------
export function normCdf(x) {
  const z = Math.abs(x) / Math.SQRT2, t = 1 / (1 + 0.5 * z);
  const c = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? 1 - c / 2 : c / 2;
}
export function normInv(p) {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const tail = (q) => (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  if (p < 0.02425) return tail(Math.sqrt(-2 * Math.log(p)));
  if (p > 1 - 0.02425) return -tail(Math.sqrt(-2 * Math.log(1 - p)));
  const q = p - 0.5, r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}
const GAMMA = 0.5772156649015329;
export const luckBar = (n) => (n < 2 ? 0 : (1 - GAMMA) * normInv(1 - 1 / n) + GAMMA * normInv(1 - 1 / (n * Math.E)));
// Inputs as the validator states them: the probability this Sharpe beats the best of n tries by luck.
export function deflatedAt(n, v) {
  const scale = Math.sqrt(v.periods_per_year), sr = v.observed_sharpe_annualized / scale, sd = v.cross_trial_sharpe_sd_annualized / scale;
  const term = 1 - v.skew * sr + ((v.non_excess_kurtosis - 1) / 4) * sr * sr;
  if (!(term > 0)) return null;
  const bar = sd * luckBar(n);
  return { probability: normCdf(((sr - bar) * Math.sqrt(v.observations - 1)) / Math.sqrt(term)), luck_sharpe: bar * scale };
}
// The most tries that still leave the probability at or above p (searched on whole numbers).
export function triesUntil(p, v, most = 1e7) {
  const at = (n) => deflatedAt(n, v)?.probability ?? 0;
  if (at(2) < p) return null;
  if (at(most) >= p) return Infinity;
  let lo = 2, hi = most;
  while (hi - lo > 1) { const mid = Math.floor(Math.sqrt(lo * hi)); if (mid === lo || mid === hi) break; if (at(mid) >= p) lo = mid; else hi = mid; }
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (at(mid) >= p) lo = mid; else hi = mid; }
  return lo;
}

// ---------------------------------------------------------------------------------------------
// Which results get which view
// ---------------------------------------------------------------------------------------------
export function proofFor(result, use) {
  const out = [];
  if (result.crises?.tested || (Array.isArray(result.series) && Array.isArray(result.series[0]?.tested))) {
    out.push(place("resilience", result)); use("crises", "capacity", "liquidity", "fails", "series", "causality", "plain_reading");
  }
  const d = [result.data, result.envelope?.data, result].find((x) => x?.derived_inputs && finite(x.result?.deflated_sharpe_ratio));
  if (d && finite(d.derived_inputs.cross_trial_sharpe_sd_annualized) && finite(d.derived_inputs.effective_independent_trials)) out.push(place("cliff", d));
  if (Array.isArray(result.path_sharpes) && result.out_of_sample_sharpe) { out.push(place("paths", result)); use("path_sharpes", "out_of_sample_sharpe", "in_sample_sharpe_median", "most_chosen"); }
  if (result.tree?.concept && result.filing) { out.push(place("trace", result)); use("tree", "feeds_into", "breakdowns", "checks", "filing", "period", "concept", "measure"); }
  return out;
}

// ---------------------------------------------------------------------------------------------
// A strategy against the crises, and at each size
// ---------------------------------------------------------------------------------------------
const money = (v) => (finite(v) ? `${v < 0 ? "−" : ""}$${short(Math.abs(v))}` : "–");
function mountResilience(el, r) {
  const list = Array.isArray(r.series) ? r.series : [{ name: null, ...r.crises }];
  let pick = 0, limit = list[0].drawdown_limit ?? 0.5, open = null;
  list.forEach((s, i) => { if ((s.tested?.filter((c) => c.ruptured).length ?? 0) > (list[pick].tested?.filter((c) => c.ruptured).length ?? 0)) pick = i; });
  const draw = () => {
    const s = list[pick], tested = (s.tested ?? []).slice().sort((a, b) => a.from.localeCompare(b.from));
    const top = Math.max(limit * 1.15, ...tested.map((c) => c.drawdown), 0.05), hit = tested.filter((c) => c.drawdown > limit).length;
    const row = (c) => `<button type="button" class="cr${c.drawdown > limit ? " over" : ""}" data-c="${esc(c.id)}" aria-expanded="${open === c.id}"><span class="cr-name">${esc(c.what.replace(/^the /, ""))}</span><span class="cr-track"><span class="cr-bar" style="width:${(100 * c.drawdown / top).toFixed(1)}%"></span><span class="cr-limit" style="left:${(100 * limit / top).toFixed(1)}%"></span></span><span class="cr-v">${pct(c.drawdown, 0)}</span></button>${open === c.id ? `<p class="note cr-more">${esc(c.from)} to ${esc(c.to)}, ${fmt(c.days)} trading days: return ${signed(c.return)}, worst day ${signed(c.worst_day)}, deepest fall ${pct(c.drawdown)}.</p>` : ""}`;
    const old = r.causality;
    el.innerHTML = `${(r.fails ?? []).map((f) => `<p class="tally"><span class="badge bad">Fails</span> ${esc(f)}</p>`).join("")}
${r.plain_reading && !r.fails?.length ? `<p>${esc(r.plain_reading)}</p>` : ""}
${finite(old?.checked_rebalances) ? `<p class="note">No lookahead: at each of ${fmt(old.checked_rebalances)} rebalances the signal used was at least ${fmt(old.min_days_signal_to_trade)} calendar ${old.min_days_signal_to_trade === 1 ? "day" : "days"} old.</p>` : ""}
${list.length > 1 ? `<div class="ctl"><label class="sub">Strategy <select data-s>${list.map((x, i) => `<option value="${i}"${i === pick ? " selected" : ""}>${esc(x.name)}</option>`).join("")}</select></label></div>` : ""}
<h3>Deepest fall in each crisis</h3>
${tested.length ? tested.map(row).join("") : '<p class="note">These dates fully cover none of the named crises, so none has been tested.</p>'}
${tested.length ? `<div class="sliders"><label>Drawdown limit <output>${pct(limit, 0)}</output><input type="range" data-l min="5" max="100" step="1" value="${Math.round(limit * 100)}"></label><p class="note">${hit ? `${hit} of ${tested.length} crises go past this limit.` : `None of the ${tested.length} crises goes past this limit.`} The tool's own verdict used ${pct(s.drawdown_limit ?? 0.5, 0)}.</p></div>` : ""}
${s.untested?.length ? `<p class="note"><b>Not tested</b>, because the dates do not cover them: ${s.untested.map((c) => esc(c.what.replace(/^the /, ""))).join(", ")}. Not having been there is not surviving them.</p>` : ""}
${Array.isArray(r.capacity) ? `<h3>At each size</h3><div class="scroll"><table><thead><tr><th>Size</th><th class="num">Sharpe</th><th>Orders filled</th><th class="num">Impact paid</th></tr></thead><tbody>${r.capacity.map((c) => `<tr${finite(r.liquidity?.capital_usd) && c.capital_usd === r.liquidity.capital_usd ? ' class="heading"' : ""}><td>${money(c.capital_usd)}</td><td class="num">${finite(c.sharpe_annualized) ? c.sharpe_annualized.toFixed(2) : '<span class="badge warn">too big</span>'}</td><td><span class="cr-track fill"><span class="cr-bar" style="width:${(100 * c.fill_ratio).toFixed(1)}%"></span></span> ${pct(c.fill_ratio, 0)}</td><td class="num">${pct(c.impact_paid)}</td></tr>`).join("")}</tbody></table></div><p class="note">An order fills only up to ${pct(r.liquidity?.max_participation ?? 0.1, 0)} of recent daily volume. A book that cannot fill holds stale positions, so no Sharpe is shown for it. Impact paid is in total, as a share of starting capital.</p>` : ""}`;
    el.querySelector("[data-s]")?.addEventListener("change", (e) => { pick = Number(e.target.value); open = null; draw(); });
    const slider = el.querySelector("[data-l]");
    slider?.addEventListener("change", (e) => { limit = Number(e.target.value) / 100; draw(); el.querySelector("[data-l]")?.focus(); });
    slider?.addEventListener("input", (e) => { const o = el.querySelector(".sliders output"); if (o) o.textContent = `${e.target.value}%`; });
    for (const b of el.querySelectorAll("button.cr")) b.addEventListener("click", () => { open = open === b.dataset.c ? null : b.dataset.c; draw(); });
  };
  draw();
}

// ---------------------------------------------------------------------------------------------
// The luck cliff: where a result turns into noise as tries are counted
// ---------------------------------------------------------------------------------------------
function mountCliff(el, d) {
  const v = d.derived_inputs, given = v.effective_independent_trials, top = 6;
  let logN = clamp(Math.log10(given), 0.31, top);
  const W = 720, H = 200, L = 40, R = 8, T = 8, B = 24, X = (x) => L + ((x - 0.31) / (top - 0.31)) * (W - L - R), Y = (p) => T + (1 - p) * (H - T - B);
  const points = [];
  for (let x = 0.31; x <= top + 1e-9; x += (top - 0.31) / 160) points.push([x, deflatedAt(Math.max(2, Math.round(10 ** x)), v)?.probability ?? 0]);
  const path = points.map(([x, p], i) => `${i ? "L" : "M"}${X(x).toFixed(1)},${Y(p).toFixed(1)}`).join("");
  const safe = triesUntil(0.95, v), even = triesUntil(0.5, v);
  const edge = (n) => (n === null ? null : n === Infinity ? null : n);
  el.innerHTML = `<p class="lead">The luck cliff <span class="sub">how many tries this Sharpe can survive</span></p>
<div class="chips"><span class="chip">Sharpe <b>${v.observed_sharpe_annualized.toFixed(2)}</b></span><span class="chip">You said <b>${fmt(given)}</b> tries</span><span class="chip">Above 95% up to <b>${safe === null ? "none" : safe === Infinity ? "any number" : fmt(safe)}</b></span><span class="chip">Even odds at <b>${even === null ? "under 2" : even === Infinity ? "never" : fmt(even)}</b></span></div>
<div class="plot cliff" tabindex="0" role="slider" aria-label="Number of tries" aria-valuemin="2" aria-valuemax="1000000"></div>
<div class="sliders"><label>Count of tries <output></output><input type="range" data-n min="0.31" max="${top}" step="0.01" value="${logN.toFixed(2)}"></label><p class="note cliff-read"></p></div>
<p class="note">Green is above 95%, red below 50%. Dragging changes the count here only; it does not change the tool's result. The Sharpes tried are assumed to spread as you said (${v.cross_trial_sharpe_sd_annualized}), and this says nothing about costs, data or lookahead.</p>`;
  const plot = el.querySelector(".cliff"), input = el.querySelector("[data-n]"), read = el.querySelector(".cliff-read"), out = el.querySelector(".sliders output");
  const ticks = [1, 2, 3, 4, 5, 6].map((e) => `<text x="${X(e).toFixed(1)}" y="${H - 6}" class="axis" text-anchor="${e === top ? "end" : "middle"}">${e < 4 ? 10 ** e : e < 6 ? `${10 ** (e - 3)}k` : "1M"}</text>`).join("");
  const grid = [0, 0.5, 0.95].map((p) => `<line x1="${L}" x2="${W - R}" y1="${Y(p).toFixed(1)}" y2="${Y(p).toFixed(1)}" class="grid"/><text x="${L - 4}" y="${(Y(p) + 4).toFixed(1)}" class="axis" text-anchor="end">${Math.round(p * 100)}%</text>`).join("");
  const bands = `<rect x="${L}" y="${Y(1)}" width="${W - L - R}" height="${(Y(0.95) - Y(1)).toFixed(1)}" class="band-ok"/><rect x="${L}" y="${Y(0.5).toFixed(1)}" width="${W - L - R}" height="${(Y(0) - Y(0.5)).toFixed(1)}" class="band-bad"/>`;
  const show = () => {
    const n = Math.max(2, Math.round(10 ** logN)), at = deflatedAt(n, v);
    const gx = clamp(Math.log10(given), 0.31, top);
    plot.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Deflated Sharpe probability against the number of tries">${bands}${grid}${ticks}<path d="${path}" class="line s0"/><line x1="${X(gx).toFixed(1)}" x2="${X(gx).toFixed(1)}" y1="${T}" y2="${H - B}" class="guide"/><circle cx="${X(logN).toFixed(1)}" cy="${Y(at.probability).toFixed(1)}" r="5" class="pt"/></svg>`;
    plot.setAttribute("aria-valuenow", String(n));
    out.textContent = fmt(n);
    read.textContent = `With ${fmt(n)} tries, luck alone would reach a Sharpe of about ${at.luck_sharpe.toFixed(2)}, and the probability this one beats that is ${pct(at.probability)}.`;
  };
  input.addEventListener("input", () => { logN = Number(input.value); show(); });
  plot.addEventListener("pointerdown", (e) => { const place1 = (ev) => { const b = plot.getBoundingClientRect(), x = ((ev.clientX - b.left) / b.width) * W; logN = clamp(0.31 + ((x - L) / (W - L - R)) * (top - 0.31), 0.31, top); input.value = logN.toFixed(2); show(); }; place1(e); plot.setPointerCapture?.(e.pointerId); plot.onpointermove = place1; plot.onpointerup = () => { plot.onpointermove = null; }; });
  plot.addEventListener("keydown", (e) => { const s = e.key === "ArrowRight" ? 0.05 : e.key === "ArrowLeft" ? -0.05 : 0; if (s) { logN = clamp(logN + s, 0.31, top); input.value = logN.toFixed(2); show(); e.preventDefault(); } });
  show();
}

// ---------------------------------------------------------------------------------------------
// Cross-validated paths: every held-out result against the in-sample one
// ---------------------------------------------------------------------------------------------
function mountPaths(el, r) {
  const v = r.path_sharpes, ins = r.in_sample_sharpe_median, lo = Math.min(0, ins, ...v), hi = Math.max(0, ins, ...v), pad = (hi - lo || 1) * 0.08;
  const W = 720, H = 92, X = (x) => 12 + ((x - lo + pad) / (hi - lo + 2 * pad)) * (W - 24);
  el.innerHTML = `<p class="lead">In sample against held out <span class="sub">${fmt(r.paths)} paths from ${fmt(r.splits)} splits</span></p>
<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Out-of-sample Sharpe of each path against the in-sample Sharpe"><line x1="${X(0).toFixed(1)}" x2="${X(0).toFixed(1)}" y1="10" y2="60" class="guide"/><text x="${X(0).toFixed(1)}" y="76" class="axis" text-anchor="middle">0</text>${v.map((s) => `<circle cx="${X(s).toFixed(1)}" cy="35" r="5" class="${s > 0 ? "pt" : "pt-bad"}" opacity=".7"><title>Path Sharpe ${s.toFixed(2)}</title></circle>`).join("")}<line x1="${X(ins).toFixed(1)}" x2="${X(ins).toFixed(1)}" y1="14" y2="56" class="ins"/><text x="${X(ins).toFixed(1)}" y="76" class="axis" text-anchor="middle">in sample ${ins.toFixed(2)}</text></svg>
<div class="chips"><span class="chip">Median held out <b>${r.out_of_sample_sharpe.median.toFixed(2)}</b></span><span class="chip">Lowest <b>${r.out_of_sample_sharpe.lowest.toFixed(2)}</b></span><span class="chip">Highest <b>${r.out_of_sample_sharpe.highest.toFixed(2)}</b></span><span class="chip">Paths at or below zero <b>${pct(r.out_of_sample_sharpe.share_of_paths_at_or_below_zero, 0)}</b></span></div>
${r.most_chosen?.length ? `<p class="note">Chosen most: ${r.most_chosen.slice(0, 5).map((c) => `${esc(c.trial)} (${fmt(c.splits)})`).join(", ")}.</p>` : ""}`;
}

// ---------------------------------------------------------------------------------------------
// A figure traced down the filing's own arithmetic
// ---------------------------------------------------------------------------------------------
const STATUS = { adds_up: ["ok", "adds up"], incomplete: ["warn", "a line is filed only by member"], does_not_add_up: ["bad", "does not add up"] };
function nodeHtml(n, depth, parentValue) {
  const sign = n.weight === null || n.weight === undefined ? "" : n.weight < 0 ? "−" : "+";
  const share = finite(n.value) && finite(parentValue) && parentValue !== 0 ? clamp(Math.abs(n.value / parentValue), 0, 1) : null;
  const st = n.check ? STATUS[n.check.status] : null;
  const row = `<span class="tr-sign">${sign}</span><span class="tr-name" title="${esc(n.concept)}">${esc(n.label)}</span>${share !== null ? `<span class="tr-share"><span class="cr-bar" style="width:${(100 * share).toFixed(1)}%"></span></span>` : ""}<span class="tr-v">${finite(n.value) ? (n.unit === "USD" ? money(n.value) : short(n.value)) : '<span class="sub">no value</span>'}</span>${st ? `<span class="badge ${st[0]}">${esc(st[1])}</span>` : ""}`;
  if (!n.children?.length) return `<div class="tr-leaf">${row}</div>`;
  const gap = n.check && n.check.status !== "adds_up" ? `<p class="note">The lines come to ${money(n.check.sum)}, ${money(Math.abs(n.check.difference))} ${n.check.difference < 0 ? "below" : "above"} what is filed.</p>` : "";
  return `<details${depth < 2 ? " open" : ""}><summary>${row}</summary><div class="tr-kids">${gap}${n.children.map((c) => nodeHtml(c, depth + 1, n.value)).join("")}</div></details>`;
}
function mountTrace(el, r) {
  const f = r.filing, url = /^https:\/\/www\.sec\.gov\//.test(f.url ?? "") ? f.url : null, p = r.period;
  el.innerHTML = `<p class="sub">${esc(r.tree.label)}, ${esc(p.instant ?? `${p.start} to ${p.end}`)}, from the ${esc(f.form)} filed ${esc(f.filed)}${url ? ` · <a href="${esc(url)}" target="_blank" rel="noopener noreferrer">open the filing</a>` : ""}</p>
${r.checks?.sums ? `<div class="chips"><span class="chip">Sums that add up <b>${fmt(r.checks.adding_up)} of ${fmt(r.checks.sums)}</b></span>${r.checks.incomplete ? `<span class="chip">Could not be completed <b>${fmt(r.checks.incomplete)}</b></span>` : ""}${r.checks.not_adding_up?.length ? `<span class="chip">Do not add up <b>${fmt(r.checks.not_adding_up.length)}</b></span>` : ""}</div>` : ""}
<div class="tr">${nodeHtml(r.tree, 0, null)}</div>
<p class="note">${r.tree.children?.length ? "Each bar shows a line against the line above it. Press a line to open or close it." : "Nothing in the filing's calculation adds up to this line: the company reports it directly."}</p>
${r.breakdowns?.length ? r.breakdowns.map((b) => `<h3>By ${esc(b.by)}${b.adds_up ? ' <span class="badge ok">adds up</span>' : ""}</h3>${b.lines.slice(0, 24).map((l) => `<div class="tr-leaf${l.in_the_sum === false ? " dim" : ""}"><span class="tr-sign"></span><span class="tr-name">${esc(l.member)}</span><span class="tr-share"><span class="cr-bar" style="width:${finite(r.tree.value) && r.tree.value ? (100 * clamp(Math.abs(l.value / r.tree.value), 0, 1)).toFixed(1) : 0}%"></span></span><span class="tr-v">${r.tree.unit === "USD" ? money(l.value) : short(l.value)}</span></div>`).join("")}${b.note ? '<p class="note">Some lines overlap. The dimmed ones are not counted; the rest add up to the total.</p>' : ""}`).join("") : ""}
${r.feeds_into?.length ? `<h3>This figure feeds into</h3><div class="chips">${r.feeds_into.slice(0, 8).map((x) => `<span class="chip">${x.weight < 0 ? "− " : "+ "}${esc(x.label)}${finite(x.value) ? ` <b>${r.tree.unit === "USD" ? money(x.value) : short(x.value)}</b>` : ""}</span>`).join("")}</div>` : ""}`;
}

export const PROOF_MOUNTS = { resilience: mountResilience, cliff: mountCliff, paths: mountPaths, trace: mountTrace };
