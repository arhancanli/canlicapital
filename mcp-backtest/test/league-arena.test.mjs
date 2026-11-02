import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { createHash } from "node:crypto";

import { arenaNew, arenaOrders, arenaStep, clearAuction, standings, stepOnce } from "../src/arena.mjs";
import { leagueCommit, leagueNew, leagueScore, luckT, parseEntry, ranks, spearman } from "../src/league.mjs";
import { appendRecords } from "../src/proof.mjs";

const tempDir = (t) => { const d = mkdtempSync(path.join(tmpdir(), "canli-league-")); t.after(() => rmSync(d, { recursive: true, force: true })); return d; };

test("ranks share ties, and Spearman reads order rather than size", () => {
  assert.deepEqual(ranks([10, 20, 20, 30]), [0, 1.5, 1.5, 3]);
  assert.equal(spearman([1, 2, 3, 4], [10, 200, 3000, 40000]), 1);
  assert.equal(spearman([1, 2, 3, 4], [4, 3, 2, 1]), -1);
  assert.equal(spearman([1, 1, 1], [1, 2, 3]), null);
  assert.ok(Math.abs(luckT(100) - 2.53) < 0.03, `${luckT(100)}`);
  assert.equal(luckT(1), 0);
});

test("an entry is checked before it counts", () => {
  assert.equal(parseEntry("ticker,score\nA,1\nB,2\n", 2).get("B"), 2);
  assert.throws(() => parseEntry("A,1\nA,2\n", 1), /appears twice/);
  assert.throws(() => parseEntry("A,oops\n", 1), /expected ticker,score/);
  assert.throws(() => parseEntry("A,1\n", 20), /at least 20 names/);
});

// A market of 40 names where a name's edge is known in advance, so skill can be told from none.
function pricesFile(dir) {
  let s = 5;
  const u = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const names = Array.from({ length: 40 }, (_, i) => `N${i}`), px = names.map(() => 100), rows = [`date,${names.join(",")}`];
  const d = new Date(Date.UTC(2026, 0, 1));
  for (let k = 0; k < 200; ) {
    if (d.getUTCDay() % 6) { names.forEach((_, i) => { px[i] *= 1 + (i - 20) * 0.0002 + 0.01 * (u() - 0.5); }); rows.push(`${d.toISOString().slice(0, 10)},${px.map((p) => p.toFixed(4)).join(",")}`); k += 1; }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  const f = path.join(dir, "prices.csv");
  writeFileSync(f, `${rows.join("\n")}\n`);
  return { f, names, u };
}

test("the league: commit first, reveal later, scored in the open, and the ways to cheat are refused", (t) => {
  const dir = tempDir(t), league = path.join(dir, "lg"), { f, names, u } = pricesFile(dir), key = path.join(dir, "k.pem");
  leagueNew({ league_dir: league, name: "Test league", first_close: "2026-02-02", rounds: 12 });
  assert.throws(() => leagueNew({ league_dir: league, name: "x", first_close: "2026-02-02", rounds: 1 }), /already exists/, "rules do not change after a start");
  const rules = JSON.parse(readFileSync(path.join(league, "league.json"), "utf8"));
  const entry = (name, round, fn) => {
    const file = path.join(dir, `${name}-${round.id}.csv`);
    writeFileSync(file, `ticker,score\n${names.map((n, i) => `${n},${fn(i)}`).join("\n")}\n`);
    leagueCommit({ league_dir: league, round: round.id, entrant: name, file, key_file: key, entrant_key_file: path.join(dir, `${name}.pem`) }, () => new Date(`${round.closes.slice(0, 8)}01T00:00:00Z`));
    return file;
  };
  const reveal = (name, round, file) => { mkdirSync(path.join(league, round.id), { recursive: true }); writeFileSync(path.join(league, round.id, `${name}.csv`), readFileSync(file)); };
  for (const round of rules.rounds) {
    reveal("skilled", round, entry("skilled", round, (i) => i + u() * 5));
    reveal("random1", round, entry("random1", round, () => u()));
    reveal("random2", round, entry("random2", round, () => u()));
  }
  const round = rules.rounds[0];
  assert.throws(() => leagueCommit({ league_dir: league, round: round.id, entrant: "late", file: path.join(dir, "skilled-r001.csv"), key_file: key, entrant_key_file: path.join(dir, "late.pem") }, () => new Date(`${round.closes}T00:00:00Z`)), /closed on/, "the day it closes is too late");
  assert.throws(() => leagueCommit({ league_dir: league, round: "r999", entrant: "x1", file: path.join(dir, "skilled-r001.csv"), key_file: key, entrant_key_file: path.join(dir, "x1.pem") }), /no round/);
  // Someone else's key cannot commit under a name, so nobody can knock out another entrant's entry.
  assert.throws(() => leagueCommit({ league_dir: league, round: rules.rounds[0].id, entrant: "skilled", file: path.join(dir, "random1-r001.csv"), key_file: key, entrant_key_file: path.join(dir, "random1.pem") }, () => new Date("2026-02-01T00:00:00Z")), /belongs to the key/);
  entry("swapper", rules.rounds[1], () => u());
  writeFileSync(path.join(league, "r002", "swapper.csv"), `ticker,score\n${names.map((n, i) => `${n},${i}`).join("\n")}\n`);
  entry("hider", rules.rounds[2], () => u());
  // Two files committed, the better one shown: the first no longer counts, so it is not scored.
  const firstShown = readFileSync(entry("hedger", rules.rounds[3], (i) => i));
  entry("hedger", rules.rounds[3], (i) => -i);
  mkdirSync(path.join(league, "r004"), { recursive: true });
  writeFileSync(path.join(league, "r004", "hedger.csv"), firstShown);
  const r = leagueScore({ league_dir: league, prices_file: f, book_size: 1 });
  assert.equal(r.rounds_scored, 12);
  assert.equal(r.table[0].entrant, "skilled");
  assert.ok(r.table[0].mean_score > 0.3, `${r.table[0].mean_score}`);
  assert.ok(r.table[0].chance_it_beats_luck > 0.95);
  for (const row of r.table.filter((x) => x.entrant.startsWith("random"))) assert.ok(Math.abs(row.mean_score) < 0.15, `${row.entrant} ${row.mean_score}`);
  assert.ok(r.problems.some((p) => /swapper r002: the revealed file is not the one committed/.test(p)));
  assert.ok(r.problems.some((p) => /hider r003: committed but not revealed/.test(p)));
  assert.ok(r.problems.some((p) => /hedger r004: the revealed file is not the one committed/.test(p)));
  assert.equal(r.table.some((x) => ["swapper", "hider", "hedger"].includes(x.entrant)), false);
  assert.ok(r.inputs.ledger_head.hash);
  assert.ok(r.paper_book.rounds >= 10, "chosen from earlier rounds, so the first has no book");
  assert.ok(r.paper_book.average_round_return > 0, `${r.paper_book.average_round_return}`);
  assert.deepEqual(leagueScore({ league_dir: league, prices_file: f, book_size: 1 }).table, r.table, "same files, same table");
  assert.ok(r.limits.some((l) => /Paper only/.test(l)));
  // A forged line in the ledger, sealed by whoever holds the league's key, still cannot take a name.
  const forged = path.join(dir, "forged");
  leagueNew({ league_dir: forged, name: "F", first_close: "2026-02-02", rounds: 1 });
  const fr = JSON.parse(readFileSync(path.join(forged, "league.json"), "utf8")).rounds[0], ff = path.join(dir, "ff.csv");
  writeFileSync(ff, `ticker,score\n${names.map((n, i) => `${n},${i}`).join("\n")}\n`);
  leagueCommit({ league_dir: forged, round: fr.id, entrant: "owner1", file: ff, key_file: key, entrant_key_file: path.join(dir, "owner1.pem") }, () => new Date("2026-02-01T00:00:00Z"));
  const digest = createHash("sha256").update(readFileSync(ff)).digest("hex");
  appendRecords(path.join(forged, "ledger.jsonl"), [{ kind: "file", body: { id: "forged", sha256: digest, label: "x", kind: "league_entry", round: fr.id, entrant: "owner1", entrant_public_key: "nope", entrant_signature: "nope" } }], { keyFile: key, now: () => new Date("2026-02-01T00:00:00Z") });
  mkdirSync(path.join(forged, fr.id));
  writeFileSync(path.join(forged, fr.id, "owner1.csv"), readFileSync(ff));
  const fs1 = leagueScore({ league_dir: forged, prices_file: f });
  assert.ok(fs1.problems.some((p) => /not signed by the key/.test(p)));
  assert.equal(fs1.table[0].entrant, "owner1", "the real commit still stands");
  const ledger = path.join(league, "ledger.jsonl"), lines = readFileSync(ledger, "utf8").trim().split("\n");
  writeFileSync(ledger, `${lines.slice(0, -2).join("\n")}\n${lines.at(-2).replace("entrant", "entrant2")}\n${lines.at(-1)}\n`);
  assert.throws(() => leagueScore({ league_dir: league, prices_file: f }), /ledger does not verify/, "a changed ledger scores nothing");
});

test("the auction clears where the most can trade, at one price for everyone", () => {
  const o = (agent, side, quantity, limit, at) => ({ agent, side, quantity, limit, at });
  const r = clearAuction([o("a", "buy", 10, 105, 0), o("b", "buy", 5, 100, 1), o("c", "sell", 8, 95, 2), o("d", "sell", 8, 100, 3)], 100);
  assert.equal(r.price, 100);
  assert.equal(r.volume, 15);
  const bought = r.fills.filter((f) => f.side === "buy").reduce((n, f) => n + f.quantity, 0), sold = r.fills.filter((f) => f.side === "sell").reduce((n, f) => n + f.quantity, 0);
  assert.equal(bought, sold, "what is bought is sold");
  assert.equal(clearAuction([o("a", "buy", 1, 90, 0), o("b", "sell", 1, 110, 1)], 100).volume, 0, "no overlap, no trade");
  assert.equal(clearAuction([o("a", "buy", 10, 100, 0), o("b", "buy", 10, 100, 1), o("c", "sell", 10, 100, 2)], 100).fills.find((f) => f.side === "buy").agent, "a", "at the same limit, first in fills first");
});

test("the arena: no borrowing, no shorting, money and shares conserved, the same seed gives the same market", (t) => {
  const dir = tempDir(t), file = path.join(dir, "a.json");
  const made = arenaNew({ arena_file: file, seed: 7, assets: 2, bots: 6 });
  assert.match(made.limits[0], /Paper only/);
  assert.throws(() => arenaNew({ arena_file: file }), /already exists/);
  assert.throws(() => arenaOrders({ arena_file: file, agent: "me", orders: [{ asset: "ART1", side: "buy", quantity: 1e6, limit: 1000 }] }), /no borrowing/);
  assert.throws(() => arenaOrders({ arena_file: file, agent: "me", orders: [{ asset: "ART1", side: "sell", quantity: 101, limit: 1 }] }), /no short selling/);
  assert.throws(() => arenaOrders({ arena_file: file, agent: "me", orders: [{ asset: "ART9", side: "buy", quantity: 1, limit: 1 }] }), /no asset ART9/);
  assert.throws(() => arenaOrders({ arena_file: file, agent: "me", orders: [{ asset: "AAPL", side: "buy", quantity: 1, limit: 1 }] }), /an arena asset/, "a real ticker cannot be named");
  assert.throws(() => arenaOrders({ arena_file: file, agent: "bot-noise-0", orders: [] }), /scripted traders/);
  for (const reserved of ["constructor", "toString", "hasOwnProperty"]) assert.throws(() => arenaOrders({ arena_file: file, agent: reserved, orders: [] }), /reserved/, reserved);
  arenaOrders({ arena_file: file, agent: "me", orders: [{ asset: "ART1", side: "buy", quantity: 5, limit: 500 }] });
  const stepped = arenaStep({ arena_file: file, steps: 40 });
  assert.equal(stepped.step, 40);
  const s = JSON.parse(readFileSync(file, "utf8"));
  const cash = Object.values(s.agents).reduce((n, a) => n + a.cash, 0);
  assert.ok(Math.abs(cash - s.starting_cash * Object.keys(s.agents).length) < 1e-6, `cash ${cash}`);
  for (const x of s.assets) assert.equal(Object.values(s.agents).reduce((n, a) => n + a.holdings[x.id], 0), 100 * Object.keys(s.agents).length, x.id);
  for (const a of Object.values(s.agents)) { assert.ok(a.cash >= -1e-9); for (const q of Object.values(a.holdings)) assert.ok(q >= 0); }
  assert.ok(s.history.some((h) => Object.values(h.auctions).some((x) => x.volume > 0)), "the bots do trade");
  const twin = path.join(dir, "b.json");
  arenaNew({ arena_file: twin, seed: 7, assets: 2, bots: 6 });
  arenaOrders({ arena_file: twin, agent: "me", orders: [{ asset: "ART1", side: "buy", quantity: 5, limit: 500 }] });
  arenaStep({ arena_file: twin, steps: 40 });
  assert.deepEqual(JSON.parse(readFileSync(twin, "utf8")).assets, s.assets);
  assert.equal(standings(s).length, Object.keys(s.agents).length);
  assert.equal(typeof stepOnce, "function");
});
