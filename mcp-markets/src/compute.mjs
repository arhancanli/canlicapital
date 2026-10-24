// Compute as a market: what an hour of each data-centre GPU costs on demand across the clouds, and
// the Cirrun GPU Index, a daily chained index of those prices (public data, no key, CC BY 4.0).
// Every price is the provider's own list price, confirmed on its pricing page on the date shown.
import { z } from "zod";

import { getJson, getText } from "./sources.mjs";

const BASE = "https://cirrun.com/api/v1";

export const computeInput = z.object({
  gpu: z.string().min(2).max(40).regex(/^[A-Za-z0-9 .\-]+$/, "a GPU model such as H100 or B200").optional().describe("A GPU model (H100, H200, B200, A100, L40S, RTX 4090...): every provider's offer for it. Default: one row per model."),
  provider: z.string().min(2).max(40).regex(/^[A-Za-z0-9 .\-]+$/, "a provider's name").optional().describe("Only this provider's offers, e.g. RunPod or AWS."),
  changes: z.number().int().min(0).max(200).optional().describe("Latest list-price changes to return; default 20."),
}).strict();

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const pct = (a, b) => (Number.isFinite(a) && Number.isFinite(b) && b ? Math.round((a / b - 1) * 1e4) / 1e4 : null);

function parseCsv(text) {
  const rows = [];
  for (const line of String(text).split(/\r?\n/).filter(Boolean)) {
    const out = [];
    let cur = "", quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (quoted) { if (ch === "\"" && line[i + 1] === "\"") { cur += "\""; i += 1; } else if (ch === "\"") quoted = false; else cur += ch; }
      else if (ch === "\"") quoted = true;
      else if (ch === ",") { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    rows.push(out);
  }
  return rows;
}

export async function computePrices(session, args) {
  const a = computeInput.parse(args);
  const [ref, prices] = await Promise.all([getJson(session, `${BASE}/reference`), getJson(session, `${BASE}/prices`)]);
  const byProvider = (p) => !a.provider || norm(p).includes(norm(a.provider));
  const index = ref.index ?? {};
  const out = {
    date: ref.date ?? null, currency: ref.currency ?? "USD", unit: ref.unit ?? "per GPU-hour, on-demand list price",
    index: { name: index.name ?? "Cirrun GPU Index", level: index.level ?? null, started: index.started ?? null, start_level: index.start_level ?? null, gpu_models: index.gpu_models ?? null, offers: index.offers ?? null },
  };
  if (a.gpu) {
    const partial = (prices.gpus ?? []).filter((x) => norm(x.name).includes(norm(a.gpu)));
    const g = (prices.gpus ?? []).find((x) => norm(x.name) === norm(a.gpu) || norm(x.id) === norm(a.gpu)) ?? partial[0];
    if (g && partial.length > 1 && norm(g.name) !== norm(a.gpu)) out.also_matched = partial.filter((x) => x !== g).map((x) => x.name);
    if (!g) throw new Error(`No GPU model ${a.gpu} in the index; models: ${(prices.gpus ?? []).map((x) => x.name).join(", ")}.`);
    const summary = (ref.gpus ?? []).find((x) => norm(x.gpu) === norm(g.name)) ?? {};
    const rows = (g.rows ?? []).filter((r) => byProvider(r[0])).map(([provider, tier, price, billing, confirmed]) => [provider, tier, price, prices.billing?.[billing] ?? billing, confirmed]).sort((x, y) => x[2] - y[2]);
    Object.assign(out, {
      gpu: g.name, vram_gb: g.vram ?? summary.vram_gb ?? null,
      summary: { offers: summary.offers ?? rows.length, low: summary.low ?? null, low_from: summary.low_from ?? null, median: summary.median ?? null, high: summary.high ?? null, high_from: summary.high_from ?? null, low_datacentre: summary.low_datacentre ?? null, low_datacentre_from: summary.low_datacentre_from ?? null, median_change_since_first_day: pct(summary.median, summary.first_day_median), first_day: summary.first_day ?? null },
      columns: ["provider", "tier", "price", "billing", "confirmed"], rows,
      sources: Object.fromEntries(Object.entries(prices.sources ?? {}).filter(([p]) => rows.some((r) => r[0] === p))),
    });
  } else {
    const rows = (ref.gpus ?? []).map((x) => [x.gpu, x.vram_gb ?? null, x.offers ?? null, x.low ?? null, x.low_from ?? null, x.median ?? null, x.high ?? null, x.high_from ?? null, x.low_datacentre ?? null, pct(x.median, x.first_day_median)]);
    Object.assign(out, { columns: ["gpu", "vram_gb", "offers", "low", "low_from", "median", "high", "high_from", "low_datacentre", "median_change_since_first_day"], rows });
    if (a.provider) {
      const offers = [];
      for (const g of prices.gpus ?? []) for (const [provider, tier, price, billing, confirmed] of g.rows ?? []) if (byProvider(provider)) offers.push([g.name, provider, tier, price, prices.billing?.[billing] ?? billing, confirmed]);
      if (!offers.length) throw new Error(`No offers from ${a.provider}; providers: ${Object.keys(prices.sources ?? {}).join(", ")}.`);
      out.provider_offers = { columns: ["gpu", "provider", "tier", "price", "billing", "confirmed"], rows: offers.sort((x, y) => x[3] - y[3]) };
    }
  }
  const n = a.changes ?? 20;
  if (n) {
    try {
      const [head, ...body] = parseCsv(await getText(session, `${BASE}/changes.csv`, { maxBytes: 4 * 1024 * 1024 }));
      const at = (k) => head.indexOf(k);
      const rows = body.filter((r) => (!a.gpu || norm(r[at("gpu")]) === norm(out.gpu)) && byProvider(r[at("provider")])).map((r) => [r[at("date")], r[at("gpu")], r[at("provider")], r[at("tier")], Number(r[at("old")]) || null, Number(r[at("new")]) || null, pct(Number(r[at("new")]), Number(r[at("old")]))]);
      out.changes = { note: "List-price changes the daily check found, newest first.", columns: ["date", "gpu", "provider", "tier", "old", "new", "change"], rows: rows.reverse().slice(0, n) };
    } catch (err) { out.changes = { not_read: String(err.message).slice(0, 160) }; }
  }
  return {
    ...out,
    method: ref.method ?? null,
    source: `${BASE}/reference and ${BASE}/prices (Cirrun GPU price index)`,
    cite: ref.cite ?? "Cirrun GPU price index, https://cirrun.com/prices.html, CC BY 4.0",
    limits: ["On-demand list prices from each provider's pricing page; spot, reserved and negotiated prices are lower, and availability is not shown.", "The index began on 2026-10-23, so its history is short.", "Not investment advice."],
  };
}
