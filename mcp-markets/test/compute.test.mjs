// compute_prices on replayed Cirrun index pages: models by price, one model's offers, a provider's
// offers, list-price changes from the CSV (quoted fields), and an unknown model named with the list.
import assert from "node:assert/strict";
import test from "node:test";

import { computePrices } from "../src/compute.mjs";
import { createSession } from "../src/sources.mjs";
import { replayFetch } from "./replay.mjs";

const NOW = Date.parse("2026-10-24T12:00:00Z");
const REF = {
  name: "Cirrun GPU reference prices", date: "2026-10-24", currency: "USD", unit: "per GPU-hour, on-demand list price",
  index: { name: "Cirrun GPU Index", level: 99.2, started: "2026-10-23", start_level: 100, gpu_models: 2, offers: 4 },
  method: "chained Jevons", license: "CC BY 4.0", cite: "Cirrun GPU price index, https://cirrun.com/prices.html (2026-10-24), CC BY 4.0",
  gpus: [
    { gpu: "H100 SXM", vram_gb: 80, offers: 3, low: 1.99, low_from: "Voltage Park, On-demand", median: 3.95, high: 12.29, high_from: "Azure, ND96isr H100 v5, per GPU", low_datacentre: 1.99, first_day: "2026-10-23", first_day_median: 3.99 },
    { gpu: "H100 PCIe", vram_gb: 80, offers: 1, low: 2.89, low_from: "RunPod, Community", median: 2.89, high: 2.89, high_from: "RunPod, Community", low_datacentre: null, first_day: "2026-10-23", first_day_median: 2.89 },
  ],
};
const PRICES = {
  checked: "2026-10-24", billing: { on: "Billed while the machine is on, until you stop it", second: "Per second; stops when your code stops" },
  sources: { "Voltage Park": "https://www.voltagepark.com/pricing", Azure: "https://azure.microsoft.com/pricing", RunPod: "https://www.runpod.io/pricing", Modal: "https://modal.com/pricing" },
  gpus: [
    { id: "h100-sxm", name: "H100 SXM", vram: 80, rows: [["Azure", "ND96isr H100 v5, per GPU", 12.29, "on", "2026-10-24"], ["Voltage Park", "On-demand", 1.99, "on", "2026-10-24"], ["Modal", "Serverless", 3.95, "second", "2026-10-24"]] },
    { id: "h100-pcie", name: "H100 PCIe", vram: 80, rows: [["RunPod", "Community", 2.89, "on", "2026-10-24"]] },
  ],
};
const CSV = "date,gpu,provider,tier,old,new,shown,source\n2026-10-23,H100 SXM,Modal,Serverless,3.99,3.95,3.95,https://modal.com/pricing\n2026-10-24,H100 SXM,Azure,\"ND96isr H100 v5, per GPU\",12.00,12.29,12.29,https://azure.microsoft.com/pricing\n";
const session = () => createSession({ fetchImpl: replayFetch({ "https://cirrun.com/api/v1/reference": REF, "https://cirrun.com/api/v1/prices": PRICES, "https://cirrun.com/api/v1/changes.csv": CSV }).fetchImpl, env: {}, now: () => NOW, sleep: async () => {} });

test("every model by price, with the index and its change since the first day", async () => {
  const r = await computePrices(session(), {});
  assert.equal(r.index.level, 99.2);
  const h = Object.fromEntries(r.columns.map((c, i) => [c, r.rows[0][i]]));
  assert.equal(h.gpu, "H100 SXM"); assert.equal(h.low, 1.99); assert.equal(h.median_change_since_first_day, -0.01);
  assert.deepEqual(r.changes.rows.map((x) => x[2]), ["Azure", "Modal"], "newest first");
  assert.equal(r.changes.rows[0][3], "ND96isr H100 v5, per GPU", "a quoted field keeps its comma");
  assert.equal(r.changes.rows[0][6], 0.0242);
  assert.match(r.cite, /CC BY 4\.0/);
});

test("one model's offers, cheapest first, a partial name that matches two models, and a provider's offers", async () => {
  const r = await computePrices(session(), { gpu: "h100" });
  assert.equal(r.gpu, "H100 SXM"); assert.deepEqual(r.also_matched, ["H100 PCIe"]);
  assert.deepEqual(r.rows.map((x) => x[0]), ["Voltage Park", "Modal", "Azure"]);
  assert.equal(r.rows[1][3], "Per second; stops when your code stops");
  assert.deepEqual(Object.keys(r.sources).sort(), ["Azure", "Modal", "Voltage Park"]);
  assert.equal(r.changes.rows.length, 2);
  const p = await computePrices(session(), { provider: "runpod", changes: 0 });
  assert.deepEqual(p.provider_offers.rows, [["H100 PCIe", "RunPod", "Community", 2.89, "Billed while the machine is on, until you stop it", "2026-10-24"]]);
  assert.equal(p.changes, undefined);
  await assert.rejects(computePrices(session(), { gpu: "Z9" }), /No GPU model Z9 in the index; models: H100 SXM, H100 PCIe/);
  await assert.rejects(computePrices(session(), { provider: "nobody" }), /No offers from nobody/);
});
