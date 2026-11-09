// Placebo study v2, round 2: reads the Open Source Asset Pricing long-short returns (the CSV written
// by osap_to_csv.py from the registered parquet file), checks its SHA-256, and returns it in the
// block form round 1's panel builder takes. Values are percent per month; we divide by 100. A
// missing value stays NaN; tests.mjs stops the run if a panel the study uses has one.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sha256 } from "../v2/data.mjs";

export function readOsap(dir, file) {
  const path = join(dir, file.csv);
  const got = sha256(path);
  if (got !== file.csv_sha256) throw new Error(`${file.csv}: SHA-256 ${got} is not the registered ${file.csv_sha256}`);
  const lines = readFileSync(path, "utf8").split("\n").filter((l) => l.length);
  const columns = lines[0].split(",").slice(1);
  const dates = [], rows = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(",");
    if (!/^\d{6}$/.test(cells[0])) throw new Error(`bad date ${cells[0]}`);
    dates.push(Number(cells[0]));
    rows.push(cells.slice(1).map((c) => (c === "" ? NaN : Number(c) / 100)));
  }
  return { columns, dates, rows };
}
