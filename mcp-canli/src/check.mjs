// `canli-mcp check returns.csv --trials 40`: the deflated Sharpe of a return series, for a CI job on
// any platform, computed on the machine it runs on. It prints the figures with every sentence that
// bounds them and the file's hash. It never says a strategy passed: there is no such mark, and a
// result here records that this check ran on this exact file, nothing more.
import { createHash } from "node:crypto";

// One column of returns from a CSV: a date column is skipped; a blank cell is no return that day.
export function readReturns(text, column) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 3) throw new RangeError("The file needs a header and at least two rows of returns.");
  const head = lines[0].split(",").map((x) => x.trim());
  const candidates = head.map((h, i) => [h, i]).filter(([h]) => !/^(date|time|timestamp|datetime)$/i.test(h));
  const pick = column ? candidates.find(([h]) => h === column) : candidates.length === 1 ? candidates[0] : null;
  if (!pick) throw new RangeError(column ? `No column ${column}. Columns: ${candidates.map(([h]) => h).join(", ")}.` : `Several columns; choose one with --column: ${candidates.map(([h]) => h).join(", ")}.`);
  const returns = [];
  for (const [n, line] of lines.slice(1).entries()) {
    const cell = (line.split(",")[pick[1]] ?? "").trim();
    if (cell === "") continue;
    const v = Number(cell);
    if (!Number.isFinite(v)) throw new RangeError(`Row ${n + 2}: ${cell.slice(0, 30)} is not a number.`);
    returns.push(v);
  }
  return { column: pick[0], returns };
}

export function checkReport({ file, bytes, column, count, trials, result, version }) {
  const data = result?.data ?? result, r = data?.result ?? {};
  const fileHash = createHash("sha256").update(bytes).digest("hex");
  return {
    tool: `canli-mcp@${version}`, file, file_sha256: fileHash, column, observations: count, trials_counted: trials,
    deflated_sharpe_probability: r.deflated_sharpe_ratio ?? null, best_sharpe_by_luck_annualized: r.expected_max_sharpe_annualized ?? null,
    plain_reading: data?.plain_reading ?? null,
    // Computed here, so no receipt was issued and no service quota applies: those lines are left out.
    limits: (result?.limits ?? []).filter((l) => !/^(?:The receipt|Quotas)/.test(l)),
    what_this_records: "That this check ran on this exact file. It does not say the strategy is valid, and no threshold here is an approval.",
  };
}

export function asMarkdown(r) {
  const pct = (x) => (x === null ? "not computed" : `${(100 * x).toFixed(1)}%`);
  return [
    `### Luck check on \`${r.file}\``,
    "",
    `Probability this Sharpe beats the best that luck gives across ${r.trials_counted} ${r.trials_counted === 1 ? "try" : "tries"}: **${pct(r.deflated_sharpe_probability)}**`,
    "",
    r.plain_reading ?? "",
    "",
    `Column \`${r.column}\`, ${r.observations} observations. File SHA-256 \`${r.file_sha256}\`. ${r.tool}.`,
    "",
    r.what_this_records,
    "",
    ...r.limits.map((l) => `- ${l}`),
  ].join("\n");
}
