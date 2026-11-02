// What the model reads of a result, before and after leanResult, across the recorded answers on the site
// (public/demos/canli-mcp/answers). A first call, and the same tool called again in a session.
//   node bench/result-chars.mjs [--json]
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { leanResult } from "../src/server.mjs";

const DIR = resolve(import.meta.dirname, "../../public/demos/canli-mcp/answers");
let full = 0, first = 0, again = 0, n = 0;
for (const f of readdirSync(DIR).filter((x) => x.endsWith(".json"))) {
  const { result, call } = JSON.parse(readFileSync(resolve(DIR, f), "utf8"));
  if (!result || typeof result !== "object" || Array.isArray(result)) continue;
  const name = call?.name ?? f, size = (x) => JSON.stringify(x).length, seen = new Set();
  full += size(result);
  first += size(leanResult(result, { name, ref: "r1", seen }));
  again += size(leanResult(result, { name, ref: "r2", seen }));
  n += 1;
}
const pct = (x) => Math.round((1 - x / full) * 1000) / 10;
const out = { answers: n, chars_before: full, chars_first_call: first, chars_called_again: again, fewer_first_call_percent: pct(first), fewer_called_again_percent: pct(again) };
process.stdout.write(`${JSON.stringify(out, null, process.argv.includes("--json") ? 0 : 2)}\n`);
