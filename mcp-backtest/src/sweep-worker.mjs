// One worker of breadth_sweep: reads the panel once, runs its share of the settings, posts each
// result back. Runs in a worker thread; nothing here writes files.
import { parentPort, workerData } from "node:worker_threads";

import { runBreadth } from "./breadth.mjs";
import { loadInputs } from "./sweep.mjs";

const { files, combos, splitDate } = workerData;
const base = loadInputs(files);
for (const c of combos) {
  try {
    const r = runBreadth({ ...base, signals: c.signals ?? null, minNames: c.min_names ?? 10, smoothing: c.smoothing ?? null, costBps: c.cost_bps ?? 10, targetVol: c.target_vol ?? 0.1, splitDate });
    const book = r.book ?? {};
    parentPort.postMessage({ k: c.k, ok: true, sleeves: r.sleeves ?? 0, bets: r.effective_bets?.effective_bets ?? null, all: book.netted ?? null, search: book.search?.netted ?? null, test: book.test?.netted ?? null });
  } catch (err) {
    parentPort.postMessage({ k: c.k, ok: false, error: String(err?.message ?? err).slice(0, 200) });
  }
}
parentPort.postMessage({ done: true });
