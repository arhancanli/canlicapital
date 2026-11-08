// mcp-canli/src/track.mjs
//
// A track record from positions committed before each day, scored on public prices. track_commit puts only a salted
// hash of tomorrow's positions into the signed proof ledger (canli-backtest-mcp's), so the positions stay private
// until their owner shows them; track_score checks every shown day against its hash and scores it on a prices file
// anyone can hash and read. What it rules out: positions picked after the prices were known, a bad day left out
// (every committed day must be shown), and a choice among several commits for one day (only the latest made before the
// day counts). What it cannot rule out alone: a ledger's times are its own clock until its heads are published
// elsewhere before the days they cover (anchors), and someone running many tracks can show the best one.
// Step 4b proves the same score without showing the positions. The ledger and files are local/track.mjs's.
import { z } from "zod";

const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date as YYYY-MM-DD");

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

