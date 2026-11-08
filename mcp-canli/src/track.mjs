// mcp-canli/src/track.mjs
//
// A track record from positions committed before each day, scored on public prices. track_commit puts only a salted
// hash of tomorrow's positions into the signed proof ledger (canli-backtest-mcp's), so the positions stay private
// until their owner shows them; track_score checks every shown day against its hash and scores it on a prices file
// anyone can hash and read. What it rules out: positions picked after the prices were known, a bad day left out
// (every committed day must be shown), and a choice among several commits for one day (only the latest made before the
// day counts). What it cannot rule out alone: a ledger's times are its own clock until its heads are published
// elsewhere before the days they cover (anchors), and someone running many tracks can show the best one.
// Step 4b proves the same score without showing the positions.
import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";

import { appendRecords, canonical, readLines, verifyLedger } from "canli-backtest-mcp/src/proof.mjs";
import { z } from "zod";

const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date as YYYY-MM-DD");
const sha = (s) => createHash("sha256").update(s).digest("hex");
export const TRACK_LIMITS = "It shows these positions, each committed before its day, earned this on these prices. The ledger's times are its own clock until its heads are published elsewhere before the days they cover (pass them as anchors). Someone keeping several tracks can show the best one; this sees one. Past returns, not a forecast.";

const weights = z.record(z.string().regex(/^[A-Za-z0-9.\-/^=_]{1,20}$/), z.number().finite().min(-10).max(10));
export const TRACK_TOOLS = Object.freeze([
  { name: "track_commit", pack: "desk", toolset: "desk", title: "Commit tomorrow's positions before the day", annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    input: z.object({ ledger_file: z.string().min(1).max(500), for_day: DAY.describe("The day these positions trade; it must be after today (UTC)."), positions: weights.describe("Weight per symbol, fractions of the book (negative is short), named as in the prices file."), key_file: z.string().max(500).optional() }).strict(),
    description: "Put a salted hash of the positions for a coming day into a signed, append-only ledger, and keep the positions and salt in a private file beside it. Later, track_score checks each day against its hash. Publish the ledger's head somewhere public before the day if others are to trust the timing. Local server only.",
    keywords: "track record commit positions before the day precommit hash ledger forward test prove performance investor audit",
    args: "ledger_file: string, for_day: date, positions: {symbol: weight}, key_file?: string" },
  { name: "track_score", pack: "desk", toolset: "desk", title: "Score a committed track record on public prices", annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    input: z.object({ ledger_file: z.string().min(1).max(500), reveals_file: z.string().max(500).optional().describe("The positions and salts, default the ledger's .reveals.jsonl."), prices_file: z.string().min(1).max(500).describe("A wide CSV: date, then one closing price column per symbol."), cost_bps: z.number().min(0).max(1000).optional().describe("Cost per unit of turnover, default 5."), anchors: z.array(z.object({ seq: z.number().int().min(0), hash: z.string().regex(/^[0-9a-f]{64}$/) })).max(1000).optional().describe("Ledger heads published elsewhere, {seq, hash}.") }).strict(),
    description: "Check every committed day's positions against its hash in the ledger and score the track on a prices file: each day's positions are the latest committed before that day, entered at its close and held until the next. A day committed but not shown stops the score, since leaving out bad days is what a track record must not allow. Returns the Sharpe, return, drawdown and the hashes a checker needs.",
    keywords: "track record score verify commitments reveal sharpe performance audit investor public prices",
    args: "ledger_file: string, reveals_file?: string, prices_file: string, cost_bps?: number, anchors?: {seq,hash}[]" },
]);

const normalize = (p) => Object.fromEntries(Object.entries(p).filter(([, w]) => w !== 0).sort(([a], [b]) => (a < b ? -1 : 1)));
const commitmentOf = (forDay, positions, salt) => sha(canonical({ for_day: forDay, positions: normalize(positions), salt }));
const revealsOf = (ledger, given) => given ?? `${ledger}.reveals.jsonl`;

export function trackCommit(args, { now = () => new Date() } = {}) {
  const a = TRACK_TOOLS[0].input.parse(args ?? {});
  const today = now().toISOString().slice(0, 10);
  if (a.for_day <= today) throw new Error(`Positions for ${a.for_day} must be committed before that day begins (UTC); today is ${today}.`);
  if (!Object.keys(normalize(a.positions)).length) throw new Error("No positions: give at least one non-zero weight.");
  const salt = randomBytes(32).toString("hex"), commitment = commitmentOf(a.for_day, a.positions, salt);
  const res = appendRecords(a.ledger_file, [{ kind: "positions_commit", body: { id: commitment, for_day: a.for_day, commitment } }], { keyFile: a.key_file, now });
  const reveals = revealsOf(a.ledger_file);
  appendFileSync(reveals, `${JSON.stringify({ for_day: a.for_day, positions: normalize(a.positions), salt, commitment })}\n`, { mode: 0o600 });
  return { for_day: a.for_day, commitment, head: res.head, reveals_file: reveals, next: "Keep the reveals file private until you show the track. Publish the head (seq and hash) somewhere public before the day so others can trust the timing; track_score takes it back as an anchor." };
}

function readPrices(file) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/).filter((l) => l.trim());
  const header = lines[0].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
  if (!/^date$/i.test(header[0])) throw new Error("The prices file starts with a date column, then one column per symbol.");
  const rows = lines.slice(1).map((l) => l.split(",").map((c) => c.trim()));
  return { symbols: header.slice(1), days: rows.map((r) => r[0]), px: rows.map((r) => r.slice(1).map((c) => (c === "" ? NaN : Number(c)))), sha256: sha(readFileSync(file)) };
}

export function trackScore(args) {
  const a = TRACK_TOOLS[1].input.parse(args ?? {});
  const check = verifyLedger(a.ledger_file, a.anchors ?? []);
  if (!check.valid) throw new Error(`The ledger does not hold: ${check.problems.join(" ")}`);
  const lines = readLines(a.ledger_file).filter((l) => l.kind === "positions_commit");
  const revealsFile = revealsOf(a.ledger_file, a.reveals_file);
  const reveals = new Map((existsSync(revealsFile) ? readFileSync(revealsFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []).map((r) => [r.commitment, r]));
  // The commits that count: for each day, the latest one made before that day began.
  const byDay = new Map(), late = [];
  let replaced = 0;
  for (const l of lines) {
    if (l.at.slice(0, 10) >= l.body.for_day) { late.push(l.body.for_day); continue; }
    if (byDay.has(l.body.for_day)) replaced += 1;
    byDay.set(l.body.for_day, l);
  }
  const hidden = [], wrong = [], held = new Map();
  for (const [day, l] of byDay) {
    const r = reveals.get(l.body.commitment);
    if (!r) { hidden.push(day); continue; }
    if (r.for_day !== day || commitmentOf(day, r.positions, r.salt) !== l.body.commitment) { wrong.push(day); continue; }
    held.set(day, r.positions);
  }
  if (wrong.length) throw new Error(`The shown positions for ${wrong.join(", ")} do not match their commitments.`);
  if (hidden.length) throw new Error(`${hidden.length} committed day${hidden.length === 1 ? " is" : "s are"} not shown (${hidden.slice(0, 5).join(", ")}${hidden.length > 5 ? ", ..." : ""}). Every committed day must be shown: a track record that leaves days out is not one.`);
  if (!held.size) throw new Error("No commitment made before its day is in this ledger.");

  const P = readPrices(a.prices_file), col = new Map(P.symbols.map((s, i) => [s, i]));
  const cost = (a.cost_bps ?? 5) / 10000, commitDays = [...held.keys()].sort();
  // Positions for a day are entered at that day's close (an order placed before the day can be), and earn from it.
  const first = P.days.findIndex((d) => d >= commitDays[0]);
  if (first < 0 || first + 1 >= P.days.length) throw new Error(`The prices file needs ${commitDays[0]} (or the next trading day) and at least one day after it.`);
  const returns = [], used = [];
  let w = {}, k = 0;
  for (let i = first + 1; i < P.days.length; i += 1) {
    const day = P.days[i], entered = P.days[i - 1];
    let next = w;
    while (k < commitDays.length && commitDays[k] <= entered) { next = held.get(commitDays[k]); k += 1; }
    const turnover = [...new Set([...Object.keys(w), ...Object.keys(next)])].reduce((t, s) => t + Math.abs((next[s] ?? 0) - (w[s] ?? 0)), 0);
    w = next;
    let r = 0;
    for (const [s, wt] of Object.entries(w)) {
      if (!col.has(s)) throw new Error(`${s} is not a column of the prices file.`);
      const p1 = P.px[i][col.get(s)], p0 = P.px[i - 1][col.get(s)];
      if (!Number.isFinite(p1) || !Number.isFinite(p0) || p0 <= 0) throw new Error(`No price for ${s} on ${!Number.isFinite(p1) ? day : P.days[i - 1]}.`);
      r += wt * (p1 / p0 - 1);
    }
    returns.push(r - turnover * cost);
    used.push(day);
  }
  const n = returns.length, mean = returns.reduce((s, x) => s + x, 0) / n;
  const sd = Math.sqrt(returns.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, n - 1));
  let equity = 1, peak = 1, maxDd = 0;
  for (const r of returns) { equity *= 1 + r; peak = Math.max(peak, equity); maxDd = Math.min(maxDd, equity / peak - 1); }
  const round = (x, d = 6) => Number(x.toFixed(d));
  return {
    days: n, first_day: used[0], last_day: used.at(-1), commitments_counted: held.size,
    ...(replaced ? { replaced_before_their_day: replaced } : {}), ...(late.length ? { late_ignored: late.length } : {}),
    sharpe_annualized: sd > 0 ? round((mean / sd) * Math.sqrt(252), 4) : null, total_return: round(equity - 1), max_drawdown: round(maxDd),
    checks: { ledger: { valid: true, head: check.head, anchors_checked: check.anchors_checked, key_fingerprint: check.key_fingerprint }, prices_sha256: P.sha256, reveals_sha256: sha(readFileSync(revealsFile)) },
    ...(check.anchors_checked ? {} : { caution: "No anchors: the commit times are the ledger's own clock. Heads published before the days would show the commits came first." }),
    limits: TRACK_LIMITS,
  };
}
