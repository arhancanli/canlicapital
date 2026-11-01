// The league: anyone's model, scored on what happens after it committed. An entrant commits the hash
// of a CSV of scores before a round closes, the hash goes in a proof ledger, and the file is shown
// only after the round. Scoring is open: the same files and prices give the same table on any
// machine. An entry's rank correlation with what followed is its score, the table sets each
// entrant's record against the best that luck gives across that many entrants, and the top entrants
// are combined into a paper book, so the league shows what a pool of them would have done.
//
// Paper only. There are no prizes, no stakes and nobody's money in it.
import { createHash, createPublicKey, sign, verify } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import { readPanel } from "./panel-io.mjs";
import { appendRecords, loadKey, readLines, verifyLedger } from "./proof.mjs";

export const LEAGUE_LIMITS_TEXT = Object.freeze([
  "Paper only: no prizes, no stakes, and nobody's money is in the league or its paper book.",
  "A commit's time is the clock of the machine that wrote the ledger. For a public round, keep the ledger in a public repository or service so the time can be checked from outside.",
  "A place in the table is a record over these rounds, not a forecast. With few rounds, luck and skill cannot be told apart, which the deflated figure tries to show.",
  "One person can enter under many names and nothing here stops it. Every name counts toward the luck bar, so that raises the bar for everyone including them.",
]);

const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const dir = z.string().min(1).max(1000);

export const leagueNewInput = z.object({
  league_dir: dir.describe("A folder for the league's rules, ledger and entries."),
  name: z.string().min(1).max(120),
  first_close: date.describe("When entries for the first round close; scoring starts the next trading day."),
  rounds: z.number().int().min(1).max(520).describe("Number of rounds."),
  days_per_round: z.number().int().min(1).max(90).optional().describe("Calendar days from one close to the next, and each round's scoring span. Default 7."),
  min_names: z.number().int().min(5).max(5000).optional().describe("Fewest scored names an entry needs. Default 20."),
}).strict();
export function leagueNew(args) {
  const a = leagueNewInput.parse(args);
  const file = join(a.league_dir, "league.json");
  const step = a.days_per_round ?? 7, day = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const rounds = Array.from({ length: a.rounds }, (_, i) => { const closes = day(a.first_close, i * step); return { id: `r${String(i + 1).padStart(3, "0")}`, closes, ends: day(closes, step) }; });
  mkdirSync(a.league_dir, { recursive: true });
  const rules = { schema: "canli.league.v1", name: a.name, min_names: a.min_names ?? 20, rounds };
  try { writeFileSync(file, `${JSON.stringify(rules, null, 1)}\n`, { flag: "wx" }); } catch (err) {
    if (err.code === "EEXIST") throw new RangeError(`${file} already exists; a league's rules do not change after it starts`);
    throw err;
  }
  return { league_dir: a.league_dir, rules_sha256: sha256(readFileSync(file)), rounds: rounds.length, first_round: rounds[0], last_round: rounds.at(-1), plain_reading: `${a.name}: ${rounds.length} rounds. Publish the rules' hash before the first close, so the schedule cannot quietly change.`, limits: LEAGUE_LIMITS_TEXT };
}

const readRules = (leagueDir) => {
  const file = join(leagueDir, "league.json");
  if (!existsSync(file)) throw new RangeError(`${leagueDir} is not a league: no league.json`);
  return JSON.parse(readFileSync(file, "utf8"));
};
// An entry: rows of ticker,score. Every score a finite number, no ticker twice.
export function parseEntry(text, minNames = 20) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const scores = new Map();
  for (const [i, line] of lines.entries()) {
    const [t, s] = line.split(",").map((x) => x.trim());
    if (i === 0 && /^ticker$/i.test(t)) continue;
    if (!t || s === undefined || s === "" || !Number.isFinite(Number(s))) throw new RangeError(`entry line ${i + 1}: expected ticker,score with a number`);
    if (scores.has(t)) throw new RangeError(`entry line ${i + 1}: ${t} appears twice`);
    scores.set(t, Number(s));
  }
  if (scores.size < minNames) throw new RangeError(`an entry needs at least ${minNames} names; this has ${scores.size}`);
  return scores;
}

const NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{1,39}$/;
const entrantName = z.string().regex(NAME, "2 to 40 letters, digits, _ or -");
export const leagueCommitInput = z.object({
  league_dir: dir,
  round: z.string().regex(/^r\d{3}$/),
  entrant: entrantName,
  file: dir.describe("The entry: a CSV of ticker,score, higher meaning expected to do better. Only its hash is recorded now."),
  entrant_key_file: dir.describe("The entrant's own signing key (PEM), created if new. A name belongs to the key that first committed under it, so nobody else can replace an entrant's entry."),
  key_file: dir.optional().describe("The league's signing key for its ledger (PEM); created if new."),
}).strict();
// What an entrant signs: which round, which name, which file, so a signature cannot be replayed elsewhere.
const commitMessage = (round, entrant, digest) => Buffer.from(`canli.league.commit.v1|${round}|${entrant}|${digest}`);
function commitIsSigned(c) {
  try { return verify(null, commitMessage(c.round, c.entrant, c.sha256), createPublicKey(c.entrant_public_key), Buffer.from(c.entrant_signature, "base64")); } catch { return false; }
}
export function leagueCommit(args, now = () => new Date()) {
  const a = leagueCommitInput.parse(args);
  const rules = readRules(a.league_dir), round = rules.rounds.find((r) => r.id === a.round);
  if (!round) throw new RangeError(`no round ${a.round} in this league`);
  const today = now().toISOString().slice(0, 10);
  if (today >= round.closes) throw new RangeError(`round ${a.round} closed on ${round.closes}: an entry must be committed before the day it closes`);
  const bytes = readFileSync(a.file);
  parseEntry(bytes.toString("utf8"), rules.min_names);
  const digest = sha256(bytes);
  const ledger = join(a.league_dir, "ledger.jsonl"), { key, publicPem } = loadKey(a.entrant_key_file);
  const holder = existsSync(ledger) ? readLines(ledger).find((e) => e.kind === "file" && e.body?.kind === "league_entry" && e.body.entrant === a.entrant) : null;
  if (holder && holder.body.entrant_public_key !== publicPem) throw new RangeError(`the name ${a.entrant} belongs to the key that first committed under it; this is another key`);
  const r = appendRecords(ledger, [{ kind: "file", body: { id: `league|${a.round}|${a.entrant}|${digest}`, sha256: digest, label: `league entry ${a.round} ${a.entrant}`, kind: "league_entry", round: a.round, entrant: a.entrant, entrant_public_key: publicPem, entrant_signature: sign(null, commitMessage(a.round, a.entrant, digest), key).toString("base64") } }], { keyFile: a.key_file, now });
  return { round: a.round, entrant: a.entrant, sha256: digest, ...r, plain_reading: `Committed ${a.entrant}'s entry for ${a.round}. Keep the file unchanged and reveal it after ${round.ends}: put it at ${join(a.league_dir, a.round, `${a.entrant}.csv`)}.`, limits: LEAGUE_LIMITS_TEXT };
}

// Average ranks, ties shared, for Spearman's correlation.
export function ranks(values) {
  const order = values.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]), out = new Array(values.length);
  for (let i = 0; i < order.length;) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j += 1;
    for (let k = i; k <= j; k += 1) out[order[k][1]] = (i + j) / 2;
    i = j + 1;
  }
  return out;
}
export function pearson(x, y) {
  const n = x.length, mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i += 1) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}
export const spearman = (x, y) => pearson(ranks(x), ranks(y));

// The return of each name from the last close on or before `from` to the last close on or before `to`.
function forwardReturns(prices, from, to) {
  const last = (d) => { let k = -1; for (let i = 0; i < prices.dates.length && prices.dates[i] <= d; i += 1) k = i; return k; };
  const a = last(from), b = last(to), out = new Map();
  if (a < 0 || b <= a) return out;
  for (const t of prices.tickers) { const p0 = prices.values[t][a], p1 = prices.values[t][b]; if (p0 > 0 && p1 > 0) out.set(t, p1 / p0 - 1); }
  return out;
}
function scoreEntry(scores, returns, minNames) {
  const names = [...scores.keys()].filter((t) => returns.has(t));
  if (names.length < minNames) return null;
  const s = names.map((t) => scores.get(t)), r = names.map((t) => returns.get(t));
  const corr = spearman(s, r);
  if (corr === null) return null;
  const k = Math.floor(names.length / 5), sorted = names.map((_, i) => i).sort((p, q) => s[q] - s[p]);
  const mean = (idx) => idx.reduce((n, i) => n + r[i], 0) / idx.length;
  return { names: names.length, corr, top_minus_bottom: mean(sorted.slice(0, k)) - mean(sorted.slice(-k)) };
}

const GAMMA = 0.5772156649015329;
function normInv(p) {
  // Acklam's rational approximation, enough for a table's luck bar.
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239], b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572], c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783], d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const tail = (q) => (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  if (p < 0.02425) return tail(Math.sqrt(-2 * Math.log(p)));
  if (p > 1 - 0.02425) return -tail(Math.sqrt(-2 * Math.log(1 - p)));
  const q = p - 0.5, r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}
const normCdf = (x) => { const z = Math.abs(x) / Math.SQRT2, t = 1 / (1 + 0.5 * z), e = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))); return x >= 0 ? 1 - e / 2 : e / 2; };
// The t-statistic the best of n entrants reaches by luck alone (expected maximum of n standard normals).
export const luckT = (n) => (n < 2 ? 0 : (1 - GAMMA) * normInv(1 - 1 / n) + GAMMA * normInv(1 - 1 / (n * Math.E)));

export const leagueScoreInput = z.object({
  league_dir: dir,
  prices_file: dir.describe("CSV: a date column and one column of closing prices per ticker. Everyone re-running the table needs the same file."),
  book_size: z.number().int().min(1).max(100).optional().describe("How many top entrants the paper book combines. Default 5."),
}).strict();
export function leagueScore(args) {
  const a = leagueScoreInput.parse(args);
  const rules = readRules(a.league_dir), prices = readPanel(a.prices_file, "prices_file");
  const ledger = join(a.league_dir, "ledger.jsonl"), lastDate = prices.dates.at(-1);
  const results = [], problems = [], perRound = new Map();
  const check = existsSync(ledger) ? verifyLedger(ledger) : null;
  if (check && !check.valid) throw new RangeError(`the league's ledger does not verify: ${check.problems[0]}`);
  const commitLines = existsSync(ledger) ? readLines(ledger).filter((e) => e.kind === "file" && e.body?.kind === "league_entry").map((e) => ({ ...e.body, at: e.at })) : [];
  // A name belongs to the first validly signed commit's key.
  const owners = new Map();
  for (const c of commitLines) if (commitIsSigned(c) && !owners.has(c.entrant)) owners.set(c.entrant, c.entrant_public_key);
  let open = 0;
  for (const round of rules.rounds) {
    if (round.ends > lastDate) { open += 1; continue; }
    const returns = forwardReturns(prices, round.closes, round.ends);
    // Only an entrant's latest commit before the close counts, so committing several files and
    // revealing whichever did best is refused: a reveal must match that one.
    const latest = new Map();
    for (const c of commitLines) {
      if (c.round !== round.id) continue;
      if (!NAME.test(c.entrant ?? "")) { problems.push(`A commit for ${round.id} has an unusable entrant name, not scored.`); continue; }
      if (!commitIsSigned(c) || owners.get(c.entrant) !== c.entrant_public_key) { problems.push(`${c.entrant} ${round.id}: a commit not signed by the key that holds this name, not scored.`); continue; }
      if (String(c.at).slice(0, 10) >= round.closes) { problems.push(`${c.entrant} ${round.id}: committed on or after the close, not scored.`); continue; }
      latest.set(c.entrant, c);
    }
    const entries = new Map();
    for (const c of latest.values()) {
      const file = join(a.league_dir, round.id, `${c.entrant}.csv`);
      if (!existsSync(file)) { problems.push(`${c.entrant} ${round.id}: committed but not revealed, not scored.`); continue; }
      const bytes = readFileSync(file);
      if (sha256(bytes) !== c.sha256) { problems.push(`${c.entrant} ${round.id}: the revealed file is not the one committed, not scored.`); continue; }
      entries.set(c.entrant, parseEntry(bytes.toString("utf8"), rules.min_names));
    }
    perRound.set(round.id, { round, returns, entries });
    for (const [entrant, scores] of entries) {
      const s = scoreEntry(scores, returns, rules.min_names);
      if (s) results.push({ round: round.id, entrant, ...s }); else problems.push(`${entrant} ${round.id}: too few of its names have prices for the round, not scored.`);
    }
  }
  const byEntrant = new Map();
  for (const r of results) (byEntrant.get(r.entrant) ?? byEntrant.set(r.entrant, []).get(r.entrant)).push(r);
  const bar = luckT(byEntrant.size);
  const table = [...byEntrant].map(([entrant, list]) => {
    const n = list.length, mean = list.reduce((x, r) => x + r.corr, 0) / n, sd = n > 1 ? Math.sqrt(list.reduce((x, r) => x + (r.corr - mean) ** 2, 0) / (n - 1)) : null;
    const t = sd > 0 ? mean / (sd / Math.sqrt(n)) : null;
    return { entrant, rounds: n, mean_score: mean, score_sd: sd, t_stat: t, chance_it_beats_luck: t === null ? null : normCdf(t - bar) };
  }).sort((x, y) => (y.chance_it_beats_luck ?? -1) - (x.chance_it_beats_luck ?? -1) || y.mean_score - x.mean_score);
  // How different each entrant is from the rest: its average correlation with the others' scores.
  for (const row of table) {
    const cs = [];
    for (const { entries } of perRound.values()) {
      const mine = entries.get(row.entrant);
      if (!mine) continue;
      for (const [other, theirs] of entries) {
        if (other === row.entrant) continue;
        const names = [...mine.keys()].filter((t) => theirs.has(t));
        if (names.length >= 5) { const c = spearman(names.map((t) => mine.get(t)), names.map((t) => theirs.get(t))); if (c !== null) cs.push(c); }
      }
    }
    row.average_correlation_with_others = cs.length ? cs.reduce((x, y) => x + y, 0) / cs.length : null;
  }
  // The paper book: in each round, the entrants ranked best on rounds before it only, their ranks averaged.
  const size = a.book_size ?? 5, book = [];
  for (const { round, returns, entries } of perRound.values()) {
    const before = results.filter((r) => r.round < round.id), tally = new Map();
    for (const r of before) { const t = tally.get(r.entrant) ?? { sum: 0, n: 0 }; t.sum += r.corr; t.n += 1; tally.set(r.entrant, t); }
    const chosen = [...tally].filter(([e]) => entries.has(e)).sort((x, y) => y[1].sum / y[1].n - x[1].sum / x[1].n).slice(0, size).map(([e]) => e);
    if (!chosen.length) continue;
    const combined = new Map();
    for (const e of chosen) {
      const s = entries.get(e), names = [...s.keys()], rk = ranks(names.map((t) => s.get(t)));
      names.forEach((t, i) => { const c = combined.get(t) ?? { sum: 0, n: 0 }; c.sum += rk[i] / (names.length - 1 || 1); c.n += 1; combined.set(t, c); });
    }
    const scores = new Map([...combined].map(([t, c]) => [t, c.sum / c.n]));
    const s = scoreEntry(scores, returns, rules.min_names);
    if (s) book.push({ round: round.id, entrants: chosen, ...s });
  }
  const bookMean = book.length ? book.reduce((x, r) => x + r.top_minus_bottom, 0) / book.length : null;
  const inputs = { rules_sha256: sha256(readFileSync(join(a.league_dir, "league.json"))), prices_sha256: sha256(readFileSync(a.prices_file)), ledger_head: check?.head ?? null };
  return {
    name: rules.name, rounds_scored: perRound.size, rounds_still_open: open, entrants: table.length, luck_bar_t: bar, table,
    paper_book: { rounds: book.length, average_round_return: bookMean, chosen_on_earlier_rounds_only: true, by_round: book.slice(-52) }, problems, inputs,
    plain_reading: table.length ? `${table.length} ${table.length === 1 ? "entrant" : "entrants"} over ${perRound.size} rounds. With this many entrants the best reaches a t of about ${bar.toFixed(2)} by luck alone; ${table.filter((r) => (r.chance_it_beats_luck ?? 0) > 0.95).length} clear that with more than 95%.${book.length ? ` The paper book of the top ${size} made ${(100 * bookMean).toFixed(2)}% a round, top fifth minus bottom fifth, before costs.` : ""}` : "No entry has been scored yet.",
    limits: LEAGUE_LIMITS_TEXT,
  };
}
