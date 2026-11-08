// The track record's ledger and files (the tools are src/track.mjs): track_commit's salted hash into the signed proof
// ledger with the positions kept beside it, readable only by their owner, and track_score's check of every committed
// day against its hash, scored on a prices file. Arguments arrive parsed by the tools' schemas.
import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";

import { appendRecords, canonical, readLines, verifyLedger } from "canli-backtest-mcp/src/proof.mjs";

const sha = (s) => createHash("sha256").update(s).digest("hex");
export const TRACK_LIMITS = "It shows these positions, each committed before its day, earned this on these prices. The ledger's times are its own clock until its heads are published elsewhere before the days they cover (pass them as anchors). Someone keeping several tracks can show the best one; this sees one. Past returns, not a forecast.";

const normalize = (p) => Object.fromEntries(Object.entries(p).filter(([, w]) => w !== 0).sort(([a], [b]) => (a < b ? -1 : 1)));
const commitmentOf = (forDay, positions, salt) => sha(canonical({ for_day: forDay, positions: normalize(positions), salt }));
const revealsOf = (ledger, given) => given ?? `${ledger}.reveals.jsonl`;

export function trackCommit(args, { now = () => new Date() } = {}) {
  const a = args;
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
  const a = args;
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
