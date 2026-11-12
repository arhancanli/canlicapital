// What someone typed into the look-through, as holdings. People write "VOO 60", "VOO 60%", "VOO, $6,000",
// or only "VOO", so the amounts are read as weights, and anything that cannot be read is said back to them.
const MAX = 25;
const LINE = /^\$?([A-Za-z][A-Za-z.-]{0,9})(?:[\s,:=]+\$?([\d][\d,]*(?:\.\d+)?)\s*%?)?$/;

export function parseHoldings(text) {
  const holdings = [], unread = [];
  for (const raw of String(text ?? "").split(/[\n;]+/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(LINE);
    if (!m) { unread.push(line.slice(0, 40)); continue; }
    const symbol = m[1].toUpperCase().replace(/\./g, "-");
    const amount = m[2] === undefined ? null : Number(m[2].replace(/,/g, ""));
    if (amount === 0) { unread.push(line.slice(0, 40)); continue; }
    const same = holdings.find((h) => h.symbol === symbol);
    if (same) { if (amount !== null) same.amount = (same.amount ?? 0) + amount; continue; }
    holdings.push({ symbol, amount });
  }
  // With no amounts at all, each holding counts the same. With only some, the rest cannot be sized.
  const given = holdings.filter((h) => h.amount !== null).length;
  if (given && given < holdings.length) return { holdings: [], unread, problem: "Give an amount for every holding, or for none." };
  if (holdings.length > MAX) return { holdings: [], unread, problem: `That is more than ${MAX} holdings. Keep the largest ${MAX}.` };
  return { holdings: holdings.map((h) => ({ symbol: h.symbol, weight: h.amount ?? 1 })), unread, problem: null };
}

// The same holdings as a link someone can share, and back.
export const toLink = (holdings) => holdings.map((h) => `${h.symbol}:${h.weight}`).join(",");
export const fromLink = (value) => String(value ?? "").split(",").map((p) => p.split(":").join(" ")).join("\n").slice(0, 2000);

// Where a fund's positions come from, and, where the server gives it, a check on that report itself: its holdings'
// dollar values against its net assets, apart by cash and what the fund owes.
export const sourceLine = (f) => `${f.symbol}: ${f.fund}, its report for ${f.period}, filed ${f.filed}.${Number.isFinite(f.values_add_to) ? ` Its holdings add up to ${(100 * f.values_add_to).toFixed(2)}% of its net assets; cash and what the fund owes make up the difference.` : ""}`;
