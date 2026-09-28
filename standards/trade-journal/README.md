# canli.trade-journal.v0

**Status: draft, not yet published.**

A trade journal is an append-only file of signed, hash-chained entries. It records what a trading
process decided, checked, sent, heard back and filled, in order. Anyone holding the file can check,
offline, that no entry was changed, dropped, reordered or inserted after it was written, and that
every entry was signed by the one key named at the start.

The format is small on purpose. A verifier needs only sha256, Ed25519 and a JSON parser, and never
re-serialises a number: every check runs on bytes already in the file.

## The file

UTF-8 text, one entry per line, each line ending in a single `\n` (LF). The file ends with a
newline. There are no blank lines.

Each line is exactly:

```
{"entry":ENTRY,"sig":"SIG"}
```

- `ENTRY` is a JSON object: the entry itself, in canonical form (below).
- `SIG` is the standard base64 encoding (RFC 4648 section 4, with padding) of the 64-byte Ed25519
  signature (RFC 8032) over the UTF-8 bytes of `ENTRY`, exactly as they appear in the line.

So the signed bytes are the line with its first 9 bytes (`{"entry":`) and everything from the
last occurrence of `,"sig":"` removed.

## The entry

`ENTRY` has exactly these members:

| member | type | meaning |
|---|---|---|
| `v` | integer | `1` |
| `seq` | integer | `0` for the first line, then one more than the line before |
| `ts` | string | when the entry was written, as exactly `YYYY-MM-DDTHH:MM:SS.sssZ` (UTC, milliseconds, 24 characters: what JavaScript's `toISOString` writes), a real calendar time in year 0001 or later; never earlier than the previous entry's `ts` (compared as text, which for this form is time order) |
| `kind` | string | one of the kinds below |
| `payload` | object | the kind's content |
| `prev` | string or null | `null` on line 0; on line n, `"sha256:"` and the lowercase hex sha256 of line n-1's bytes, excluding its `\n` |

The head of a journal is `"sha256:"` and the hex sha256 of its last line, excluding the `\n`.

## Canonical form

`ENTRY` must be canonical, so that two writers given the same entry write the same bytes:

- member names are ASCII, and object members are sorted by name, recursively;
- there is no whitespace outside strings;
- characters above U+007F are written as `\uXXXX` escapes (surrogate pairs for characters above
  U+FFFF); everything else follows ordinary JSON string escaping;
- every number is finite and below 1e15 in magnitude;
- an integral value is written as digits with no fraction or exponent (`100`, not `100.0`);
- any other number is written as Python's `repr` of that float writes it: the shortest digits that
  round-trip, fixed notation when the decimal exponent is from -4 up to 15, otherwise
  `d.ddde+XX` or `d.ddde-XX` with at least two exponent digits.

This is Python's `json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)`
applied to a value whose integral numbers are integers. A verifier checks the rule by parsing
`ENTRY` and serialising it again: the bytes must match.

## Kinds

Line 0 must have kind `config`, with `payload.journal_key`: the base64 of the 32-byte Ed25519
public key that signs every line, line 0 included. The key cannot change within a journal.

| kind | payload members that must be present |
|---|---|
| `config` | `journal_key` on line 0; afterwards `limits_digest` (`"sha256:"` + 64 hex) |
| `decision` | `decision_id` |
| `check` | `decision_seq`, `limits_digest`, `result_sha256` |
| `order` | `client_order_id`, `symbol`, `side` (`buy` or `sell`), `qty` (above 0), `type` (`market` or `limit`), `venue` |
| `ack` | `client_order_id`, `status` |
| `fill` | `client_order_id`, `symbol`, `side`, `qty` (above 0), `price` (above 0) |
| `cancel` | `client_order_id`, or `all: true` |
| `reconcile` | `status` (`AGREE`, `DIVERGENT`, `ORPHAN` or `MISSING`) |
| `mark` | `marks` (an object of symbol to price above 0), `source` |
| `correction` | `corrects_seq` (an earlier seq), `reason` |

A payload may carry other members; a verifier ignores them. Nothing is ever rewritten: a mistake
is corrected by a later `correction` entry.

## Verifying

A journal is valid when every line passes, in order:

1. The line has the shape above, its `ENTRY` is canonical, and the members and kinds are as stated.
2. `seq` equals the line number counted from 0, `prev` chains to the previous line, and `ts` does
   not go backwards.
3. `SIG` verifies over the `ENTRY` bytes with the key from line 0.

The result names the first line that fails (counted from 0) and why, as the first of these codes
that applies, checked in this order:

| code | the line |
|---|---|
| `encoding` | is not UTF-8, contains a carriage return, is blank, or is the last line and has no final newline |
| `shape` | is not `{"entry":ENTRY,"sig":"SIG"}`, or `ENTRY` is not an object with exactly the six members |
| `canonical` | has an `ENTRY` that is not canonical, including a number outside the rules |
| `version` | has `v` other than `1` |
| `seq` | has `seq` other than its line number |
| `prev` | has `prev` that does not chain to the line before (or is not `null` on line 0) |
| `ts` | has `ts` not in the stated form, not a real time, or earlier than the line before |
| `kind` | has an unknown kind, or is line 0 and not `config` |
| `payload` | has a payload that is not an object or lacks a stated member (or, on line 0, a valid `journal_key`) |
| `signature` | has a `SIG` that is not 64 bytes of base64, or does not verify |

An empty file fails at line 0 with `encoding`. A single changed byte anywhere breaks either that
line's own checks or the next line's `prev`, so the first failing line is the one that changed or
the one after it.

## What it does not establish

- The signature shows the key holder wrote the entries. It does not show they were written at the
  times stated, or that no other journal exists. Anchoring the head with a third party does that.
- A fill entry records what the trader's software was told. A paper fill is not a market fill.
