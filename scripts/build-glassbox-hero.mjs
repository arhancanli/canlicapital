import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const state = JSON.parse(readFileSync(new URL("public/paper-state.json", root), "utf8"));
const styles = [
  ["alphamax", "#476dff"], ["managed_futures", "#f4a46b"],
  ["alphavintage", "#c6d5ec"], ["alphaforge", "#82d2c5"],
];
const escape = (value) => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
// A suspended sleeve has no public curve by design (state.suspended_sleeves, v4 2026-09-24): it is
// left out of the illustration. Every sleeve still in the book must have a valid curve.
const suspended = new Set((state.suspended_sleeves ?? []).map((item) => item.key));
const algorithms = styles.filter(([key]) => !suspended.has(key)).map(([key, color]) => {
  const algorithm = state.algorithms.find((item) => item.key === key);
  const curve = algorithm?.live_curve;
  if (!curve || curve.length < 2 || curve.some((p) => !Number.isFinite(p.equity) || p.equity <= 0 || !Number.isFinite(Date.parse(p.date)))) {
    throw new Error(`Cannot illustrate ${key}: valid published paper curve required`);
  }
  return { ...algorithm, color, points: curve.map((p) => ({ time: Date.parse(p.date), value: p.equity / curve[0].equity - 1 })) };
});
const points = algorithms.flatMap((a) => a.points);
const start = Math.min(...points.map((p) => p.time));
const end = Math.max(...points.map((p) => p.time));
const extent = Math.max(0.01, ...points.map((p) => Math.abs(p.value)));
const round = (n) => n.toFixed(2);
const project = (x, y, layer) => [90 + x + y * .64, 398 + y * .5 - layer * 125];
const coord = (x, y, layer) => project(x, y, layer).map(round).join(",");
const planes = algorithms.map((a, i) => {
  const layer = 3 - i;
  const d = a.points.map((p, j) => `${j ? "L" : "M"}${coord(510 * (p.time - start) / Math.max(1, end - start), 115 - p.value / extent * 92, layer)}`).join(" ");
  const polygon = [[0, 0], [510, 0], [510, 230], [0, 230]].map(([x, y]) => coord(x, y, layer)).join(" ");
  const [tx, ty] = project(0, 230, layer);
  const last = a.points.at(-1);
  const lastPoint = project(510 * (last.time - start) / Math.max(1, end - start), 115 - last.value / extent * 92, layer);
  return `<g class="glass-plane" data-strategy="${a.key}"><polygon points="${polygon}" fill="url(#plane-${i})" stroke="${a.color}" stroke-opacity=".45"/><path d="M${coord(0, 115, layer)} L${coord(510, 115, layer)}" stroke="${a.color}" stroke-opacity=".3" stroke-dasharray="3 6"/><path d="${d}" fill="none" stroke="${a.color}" stroke-width="2.5" stroke-linejoin="round"/><circle cx="${round(lastPoint[0])}" cy="${round(lastPoint[1])}" r="4" fill="${a.color}"/><text x="${round(tx + 10)}" y="${round(ty - 14)}" fill="${a.color}" font-family="Arial, sans-serif" font-size="12" letter-spacing="1.2">${escape(a.name.toUpperCase())}</text></g>`;
}).reverse().join("\n");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -130 900 730" role="img" aria-labelledby="glass-title glass-desc"><title id="glass-title">ALPHAC, an open view of the strategies</title><desc id="glass-desc">Published paper equity curves on separate transparent planes, normalized to each strategy's first observation. Perspective separates the strategies; use the live console for a conventional chart. Snapshot ${escape(state.generated_at)}.</desc><defs>${algorithms.map((a, i) => `<linearGradient id="plane-${i}" x2="0.8" y2="1"><stop stop-color="${a.color}" stop-opacity=".2"/><stop offset="1" stop-color="${a.color}" stop-opacity=".025"/></linearGradient>`).join("")}</defs>${planes}</svg>`;
const target = new URL("public/glassbox-hero.svg", root);
writeFileSync(target, svg);
console.log(`Glassbox hero: published curves rendered to ${fileURLToPath(target)}`);
