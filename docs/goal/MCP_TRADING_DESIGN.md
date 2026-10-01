# Canli trading capability: design for a solo build

Date: 2026-09-28. This is a design only. Nothing here is built, and every effort figure is an estimate. Paths are absolute. Numbers come from files I read or pages I fetched today, and each is cited. If a number is a target, it is labelled as one.

---

## 0. What checking the brief changed

I checked the research brief against the code and the primary sources. These findings change the design, so I list them first.

- **Canli receipts carry no signed time.** The signed statement contains id, endpoint, input_sha256, output_sha256 and bindings (`/Users/arhancanli/cc-xs-20260928/js/receipt-statement.js:27`). `generated_at` sits in the unsigned envelope (`api/_lib/envelope.js:17`). The receipt id is a content hash, so the same input always gives the same id. There is also no anchor endpoint: `api/v1` holds only `keys`, `receipts/[id]` (GET) and `validate/*`. Anchoring a journal head therefore needs a new endpoint and a new signed-time statement. That is new hosted state, so it goes to the owner as decision 7.
- **WebAuthn cannot use an IP address as its relying-party ID.** The review's "127.0.0.1 approval page" would fail registration. Use `http://localhost:<port>` with rpId `localhost`. Browsers treat that as a secure context, and it is a valid RP ID (web.dev "RP ID deep dive"; W3C webauthn issue #1358).
- **The MCP spec (2025-11-25) forbids form-mode elicitation for secrets "that grant access or authorize transactions".** Form data "is exposed to the client". URL mode is the required path: the client must show the full URL, get consent, and open it where the client and LLM cannot inspect it. This rules out a TOTP typed into a form.
- **The ccxt-mcp wiki describes "an append-only audit log" and a secret-redaction filter.** It does not say whether the log is signed or hash-chained (edited 2026-08-22). Our advantage has to be stated as "a signed, chained journal that other tools can verify", never as "theirs is unsigned".
- **Alpaca's paper engine does not simulate** market impact, information leakage, latency slippage, queue position, price improvement, regulatory fees or dividends. Borrow fees are listed as "Coming Soon". Partial fills are random in size 10% of the time. Paper fills cannot calibrate an impact model, so any calibration bar that used them is dropped.
- **Alpaca exposes account configurations a live release can read and require:** `max_margin_multiplier` ("1", "2" or "4"), `no_shorting`, `max_options_trading_level` (0-3), `suspend_trade` and `trade_confirm_email` ("all" or "none"). With "all", the broker emails the human every fill, which gives a check that lives off the machine.
- **Binance `GET /sapi/v1/account/apiRestrictions` returns `ipRestrict`, `enableWithdrawals`, `enableInternalTransfer`, `permitsUniversalTransfer`, `enableMargin`, `enableFutures`, `enableVanillaOptions` and more.** This matters for a later crypto live release.
- **Six AlphaForge behaviours must not be ported as they are.** Each was verified at alphaforge 8633f95:
  - The calendar gate fails open (`scripts/live_cycle.py`, "proceeding (fail-open)").
  - The book ladder fails open ("a missing or unreadable file sizes at full gross").
  - `is_trading_day` uses a fixed UTC-5 offset (`execution/alpaca_broker.py:209`).
  - Paper mode is decided by `"paper" in self._base` (`:110`).
  - A 422 on a duplicate client_order_id returns the earlier ack without comparing parameters (`:140-144`).
  - The "US equity 1 bp" preset is "a deliberately conservative round number" (`costs/fees.py:82-90`).
- **The public claim that crypto commission "MATCHES exactly" is circular.** `PaperBroker` writes `fee_quote` from the cost model itself (`execution/paper.py:638`), and the same artifact shows 0 crypto fills since go-live (24 in total) (`/Users/arhancanli/cc-xs-20260928/public/glassbox/cost_model_realism.json`).
- **The next-majors plan (`docs/goal/MCP_NEXT_MAJORS_PLAN.md`) already schedules three pieces this design must reuse, not duplicate:**
  - validation 1.0 item 5, `research_session`, which counts trials;
  - validation 1.0 item 6, the net cost ladder and the impact/capacity table;
  - fundamentals F6, filings and events, in the following major.

---

## 1. What the trading capability is for

In plain words: it helps a person or an agent do four things around a trade, without Canli ever holding money, keys or orders.

1. **Before a trade:** what this order will likely cost, whether it breaks the trader's own limits or the market's state (closed, halted, unknown), and how big a position the trader's own risk budget allows. It is arithmetic on inputs the user states. It never chooses what, which way, when or how much.
2. **Placing it, on paper first:** send the order to the trader's own paper account (Alpaca paper) or to a local simulator. The pre-trade check is mandatory, as is a kill switch the agent cannot bypass through the tools. Each order is recorded before it is sent, with the market quote at the moment of sending.
3. **After a trade:** what it actually cost against the decision price, split into delay, execution, unfilled and fees, in basis points anyone can recompute.
4. **Proving it:** a signed, hash-chained journal of every decision, order and fill. It exports a `canli.paper-evidence.v0` record, which validation can check against the journal itself, not just for shape. The result is a track record a trader can show, with its limits written into it.

Real-money order placement is not in the first release. It would come in a later, separately red-teamed release, and only if the owner decides after counsel and with an adult account holder. Until then, a trader who trades live elsewhere still gets items 1, 3 and 4 by passing in their own fills.

What each server becomes:
- **canli-execution-mcp (new):** the cost, limits and evidence layer around orders. Among the broker servers reviewed on 2026-09-28 (sources at the end), none documents a pre-trade cost estimate, a post-trade shortfall decomposition, or a signed journal that exports to a checkable evidence standard.
- **canli-validation-mcp:** today it checks whether a backtest is real. It also becomes the check of whether a trading record is what it claims to be, by recomputing the record from the journal's fills.
- **canli-research-mcp:** it publishes Canli's own measured paper execution costs and fill rates, each bound to an artifact hash. Later it may publish Canli's own journal as a reference.
- **canli-fundamentals-mcp:** it adds point-in-time filing and 8-K event risk before a US stock is traded, in its following major.

---

## 2. Where it lives, the tools, and their token cost

### 2.1 A new fourth server, plus small extensions to the other three

Build `canli-execution-mcp` as a new package at `/Users/arhancanli/cc-xs-20260928/mcp-execution/`, laid out like `mcp-fundamentals/`. Reasons:
- **Tokens:** validation's list is 4,194 o200k for 15 tools (LOG 2026-09-28), and its 1.0 bar forbids growth. Order tools there would be paid for on every turn by every validation user.
- **Trust boundary:** the order-capable code ships in a package that users opt into. It has its own SECURITY.md and its own provenance-only release path. Nothing in the read-only servers can place an order.
- **Hosted split:** the hosted build of the new server must not even import broker code. That is easier to prove with a separate entry file in a separate package.
- **Release cadence:** it follows the owner's "fewer, bigger releases" rule independently.

The shared cores live in `/Users/arhancanli/cc-xs-20260928/js/` so validation reuses them:
- `exec-cost-core.js`: a port of `TransactionCostModel`, `FeeSchedule` and the book walk. Validation 1.0 item 6 must use this same core for its cost ladder and capacity table.
- `pretrade-core.js`: a port of `PreTradeChecker` and `RiskLimits`, with the fixes in section 0.
- `trade-journal-core.js`: append, verify, export and recompute. Validation's journal check uses it too.
- The RFC 8785 canonical-JSON plus sha256 module from foundation 0c of the next-majors plan.

Dependencies stay the same as validation's two: `@modelcontextprotocol/server` 2.1.0 and `zod` 4.6.5. Use Node built-ins for Ed25519, sha256 and HTTP. There is no ccxt in 0.1.0 (see 4.4).

### 2.2 Toolsets and builds

Toolsets follow validation's pattern (`TOOLSETS`, with an unknown name refused), under `CANLI_EXEC_TOOLSETS`:
- **`plan`** (on by default): `check_orders`, `size_position`, `measure_shortfall`.
- **`journal`** (local): `journal`.
- **`broker`** (local only): `place_order`, `cancel_order`, `broker_state`. They are registered only after a human has run `npx canli-execution init`, which writes `~/.canli/config.json` with a broker section. With no such section, the toolset is absent, not just disabled.

Builds:
- **Local stdio build:** all three toolsets.
- **Hosted build** at `canlicapital.com/mcp/execution`: `api/mcp-execution.js` imports `mcp-execution/src/hosted.mjs`, which imports only `pretrade-core` and `exec-cost-core`. It is stateless and unlogged, with the same 64 KiB cap as its siblings.
  - Owner says yes to decision 3: hosted has `check_orders` and `measure_shortfall`.
  - Owner says no: hosted has `check_orders` in cost-and-order-checks-only mode, and it refuses the `account` fields.
  - Either way, the hosted build follows next-majors item 0a: it serves released code only.

Resources, which cost no tool-list tokens:
- `execution://limits`: the effective limits, the file path, its modification time and `limits_digest`. Read-only.
- `execution://journal/head`: the journal head.

The server's `instructions` are 3 to 5 byte-stable sentences, pinned by a test, as on the other three servers.

### 2.3 The tools

The first five tools below make up the default local list, in the order an agent uses them. Wording rule for every description and output: "computes", "returns", "estimates". Never "suggests", "should" or "recommend".

**`check_orders`**: pre-trade cost plus limits and market-state check. It rejects and never resizes. The broker path calls this same function, so a check can never be more permissive than a submit.
```
inputs
  orders[1..200]: {symbol, side: buy|sell, qty>0, type: market|limit, limit_price?, tif?: day|gtc|ioc, reduce_only?}
  asset_class: us_equity | crypto_spot
  market: {<symbol>: {price, bid?, ask?, adv_usd?, daily_vol?, as_of?, book?: {bids:[[px,qty]], asks:[[px,qty]]}}}
  derive?: bool          local only: fill missing price/bid/ask/ADV/vol from the user's own broker data; the feed is recorded
  fees?: {commission_bps?, per_share_usd?, min_usd?, sell_fee_rate?, sell_fee_per_share?, source_url, as_of} | {preset}
  execution?: immediate (default) | at_open
  holding_days?, borrow_annual_rate?        carry for shorts, ACT/360
  account?: {equity, positions: {<symbol>: qty}}
  limits?: {max_position_frac, max_gross, max_net, max_adv_frac, price_collar_frac,
            max_order_notional, max_daily_notional, allowed_symbols, allowed_types}   tighten only
  event_risk?: {<symbol>: {in_window: bool, source, as_of}}                            warn only in 0.1.0
  as_of?: ISO date-time
outputs (columnar)
  columns: symbol, side, qty, accepted, reasons, notional_usd, adv_pct, regime,
           commission_bps, half_spread_bps, impact_bps_low, impact_bps_base, impact_bps_high,
           total_bps_base, total_usd_base
  walked_book?: [{symbol, vwap, levels_used, book_exhausted}]
  checks_applied[], checks_skipped[{check, reason}]      e.g. position caps skipped: no account given
  market_state?: {<symbol>: open|closed|halted|unknown, source}
  systemic_breach, limits_digest (sha256 of the canonical effective limits)
  impact_band: "impact coefficient 0.5 / 1.0 / 1.5 (Toth et al. 2011; Almgren et al. 2005); a range of the model's parameter, not a probability interval"
  fee_sources[{source_url, as_of, stale}], not_modelled[], limits[]
annotations: readOnlyHint true, destructiveHint false, openWorldHint false (hosted) / true (local with derive)
token target: 350 o200k or fewer (revised 2026-09-28 to 700 local / 660 hosted after measuring; see the amendment in 2.5)
```
Rules inside it:
- Impact uses the square-root law, `Y * sigma_daily * sqrt(notional/ADV)`, as in `costs/model.py:196-222`.
- Regime is `ok` up to 1% of ADV and `warn` above 1%. Above 5% it is `refused`, with no impact number, because the law is not valid there (`MAX_ADV_PARTICIPATION = 0.05`).
- With no fee input, commission is listed in `not_modelled`. It is never a silent 1 bp.
- Every fee preset carries `source_url` and `as_of`, and is flagged stale after 90 days.
- US sell-side regulatory fees are sourced inputs, never constants.
- `at_open` adds no spread number for the overnight gap. It adds a `timing_risk` line: an sd derived from `overnight_vol` when the user supplies it, otherwise `not_modelled`. This follows `cost_model_realism.json`: equity submit-to-fill is an overnight gap, not a 2 bp add-on.

Reason codes: `price_collar`, `position_cap`, `gross_cap`, `net_cap`, `adv_participation`, `order_notional_cap`, `daily_notional_cap`, `reduce_only_not_reducing`, `symbol_not_allowed`, `order_type_not_allowed`, `market_closed`, `halted`, `market_status_unknown`, `stale_mark`, `kill_switch_engaged`, `event_window` (warn), `inputs_missing`.

**`size_position`**: turns a budget the user states into a lot-rounded quantity and names the limit that binds. Local only unless the owner says otherwise (decision 3).
```
inputs
  side, equity, price, vol: {daily|annual}
  budget: {method: vol_target, annual_vol} | {method: risk_per_trade, stop_distance_pct, risk_pct_equity} | {method: fixed_fraction, fraction}
  caps: {max_position_frac, max_gross, max_net, max_adv_frac}     required, unless the local limits file supplies them; no defaults
  book?: {gross, net, current_qty}, adv_usd?, lot_size, min_notional
  drawdown?: {current_dd, half_at, flat_at}
outputs
  quantity (never above any cap), notional, pct_equity, binding_constraint,
  constraints[{name, cap, value_at_quantity, headroom}], drawdown_multiplier (1, 0.5 or 0), est_cost (from exec-cost-core),
  one_day_move_1sd_usd ("normal approximation"), limits[]
annotations: readOnlyHint true, openWorldHint false
token target: 220 o200k or fewer (measured 447 when built, 2026-09-28: 22 fields; the guard is set there)
```
- There is no Kelly output and no "evidence tier". Both were cut after the review, because Kelly invites leverage and a tier reads as an endorsement.
- A supplied `drawdown` that is invalid means refusal.
- If the limits file sets `require_drawdown_state: true` and `drawdown` is missing, the tool refuses. It never sizes at full gross by default, which reverses AlphaForge's fail-open ladder.
- The engine's own limits (15% position, 1.0 gross, 0.5 net, 1% ADV, `risk/limits.py:55-58`) may appear in docs only as "ALPHAC's own settings, not a template".

**`measure_shortfall`**: post-trade implementation shortfall (Perold 1988).
```
inputs
  orders[]: {id, side, qty, decision_price, decision_ts, arrival_mid?, arrival_feed?: iex|sip|crypto|unknown,
             fills[{qty, price, fee?, ts}], horizon_price?}     or journal_range {from, to} (local)
  benchmark: decision (default) | arrival | at_open (needs open prices)
  fill_source: broker_paper | simulated | funded | self_reported   read from the journal when journal_range is used
  backtest_cost_bps?        the user's own backtest cost assumption
  seed?
outputs (per order and aggregate, bp of decision notional; positive = cost)
  delay, execution, opportunity, fees, total; fill_rate_by_count, fill_rate_by_notional;
  excess_over_assumption_bps (when backtest_cost_bps is given); bootstrap CI (seeded stationary bootstrap) on the aggregate;
  excluded {implausible_move (>30%), no_price, zero_quantity}; not_measurable[] (e.g. fees when fills carry none);
  feed_warning when any arrival quote is IEX ("not the NBBO"); boundary sentence; costs_block for a paper-evidence record
annotations: readOnlyHint true
token target: 220 o200k or fewer; result 400 tokens or fewer for 1 order, 900 or fewer for a 1,000-order aggregate
```
- There is no optimistic, consistent or pessimistic verdict in 0.1.0. On paper fills such a verdict compares one model with another, so it is deferred to the release that has funded fills.
- On `broker_paper` fills the boundary reads: "measured against the broker's paper engine, which simulates no impact, latency slippage, queue position or regulatory fees; not the market".

**`journal`**: one tool with four actions, to save tokens.
```
journal {action: head | export | verify | anchor, strategy_id?, from?, to?, session_id?, publish_url?}
  head   -> {seq, head_sha256, entries, first_ts, last_ts, pubkey_fingerprint, last_anchor?}
  export -> canli.paper-evidence.v0 record (inline if it is 16 KB or less, else the file path) + journal sha256 + entry range
  verify -> {valid, first_bad_seq, checks: {chain, signatures, anchors}}     offline
  anchor -> opt-in, only if the owner approves the anchor service (decision 7); sends {pubkey, seq, head, prev_anchor_id, sig}
annotations: readOnlyHint false for anchor (it writes to a remote ledger), true otherwise
token target: 150 o200k or fewer
```
Entries are JSONL: `{v:1, seq, ts, kind, payload, prev, sig}`.

**Amendment 2026-09-28 (built):** each line is `{"entry":ENTRY,"sig":"SIG"}`. SIG is Ed25519 over ENTRY's exact bytes, and `prev` is the sha256 of the previous line's exact bytes. So no verifier ever re-serialises a number to check a signature or the chain. ENTRY is in the house canonical JSON (Python `json.dumps` sort_keys, compact, ensure_ascii), not RFC 8785.

Rules added so that JavaScript and Python read every file the same way:
- `ts` is exactly the 24-character millisecond form;
- numbers stay below 1e15;
- member names are ASCII.

The spec is `standards/trade-journal/README.md`, with 36 vectors. An independent Python verifier agrees on all of them, and on 1,000 one-byte corruptions, each of which fails at its own line.

Writing it found a house bug: `scripts/canonical-json.mjs` did not escape DEL (U+007F), which Python's `ensure_ascii` escapes. Fixed, with a differential test; no published artifact contained DEL.
- `kind` is one of `config`, `decision`, `check`, `order`, `ack`, `fill`, `cancel`, `reconcile`, `mark`, `correction` (plus `approval` in the live release).
- `prev` is the sha256 of the previous entry's RFC 8785 bytes.
- `sig` is an Ed25519 signature over the entry without `sig`, made with a key generated at `init` (`~/.canli/journal.key`, mode 0600).
- Corrections are appended, never rewritten.
- The format is published as `canli.trade-journal.v0`, with a schema and vectors under `/Users/arhancanli/cc-xs-20260928/standards/trade-journal/v0/`, like paper-evidence. Any other tool can then emit journals that Canli verifies.

How `export` maps the journal into `canli.paper-evidence.v0` (schema checked today):
- `capital.kind`/`execution`: PAPER/BROKER_PAPER_FILLS (Alpaca paper), SIMULATED/LOCAL_SIMULATED_FILLS (the local simulator), or MIXED/MIXED.
- `returns.basis` is `NET_OF_MODELLED_COSTS`, never REALISED on paper. That is also a semantic rule in `paper-evidence-core.js:139-144`.
- `sharpe_reportable` is false while `observation_count` is below the MinTRL computed with validation's own core. `sharpe_annualised` is then null.
- `selection.trials_counted`/`trial_count` come from validation's `research_session` status when a `session_id` is given. Otherwise they are false/null. There is no second local trial registry.
- `risk.drawdown_basis` is OBSERVED, from mark entries, with the mark source recorded.
- `provenance.source_bindings` hold the journal file sha256, the chain head, and any anchor ids. `signed` is true, with `signature_scheme` "Ed25519, key held by the user (self-attested)". `independently_verifiable` is true only when `publish_url` is given.
- `claim_maturity.does_not_establish` is filled in automatically:
  - "fills are recorded by the user's own software; paper fills are not market fills";
  - "integrity only from the first anchor on <date>" or "no anchor: integrity is the user's own signature";
  - "other journals by the same person may exist";
  - "n below the minimum track record for this Sharpe", when that is true.

**`place_order`** (broker toolset, local). 0.1.0 has paper venues only; there is no `mode` parameter and no live value anywhere.
```
inputs
  orders[1..200] (same shape as check_orders), venue: alpaca_paper | local_sim, strategy_id,
  decision_note?, decision_id? (retry an earlier decision), session_id?, market? (local_sim book or overrides)
flow
  kill check -> limits file read + digest -> check_orders (same function) -> journal decision + check
  -> arrival quote fetched from the broker (feed recorded) -> journal order (fsync) -> submit -> journal ack
outputs (columnar)
  symbol, side, qty, accepted, reasons, client_order_id, broker_order_id, status,
  arrival_bid, arrival_ask, arrival_mid, arrival_feed, est_total_bps, journal_seq; venue, limits_digest, boundary sentence
annotations: readOnlyHint false, destructiveHint false, idempotentHint false, openWorldHint true
token target: 220 o200k or fewer
```
- `client_order_id` = `cx-` + the first 24 hex of sha256(pubkey fingerprint, decision seq, order index). Retrying the same `decision_id` reuses the id; a new call gets a new one.
- `local_sim` walks a caller-supplied L2 book (the `PaperBroker` walk). A partial fill is flagged `book_exhausted`, and no liquidity is invented. With no book, it fills at the quote plus the modelled half-spread, labelled SIMULATED.

**`cancel_order`**: `{client_order_id} | {all: true, engage_kill?: bool}`. It never needs approval in paper. It journals a cancel entry. Annotations: destructiveHint true, idempotentHint true. Token target: 80.

**`broker_state`**: `{venue, include: [account|positions|orders|fills|reconcile], since?}`.
- Returns compact state, the kill status and `limits_digest`.
- Syncs new fills into the journal as `fill` entries.
- Reconciles broker against journal as AGREE/DIVERGENT/ORPHAN/MISSING, following `execution/reconcile.py`, and lists every non-AGREE row.
- Token target: 100.

The human CLI, not tools:
- `canli-execution init`: creates `~/.canli/`, the journal key, a limits file from explicit answers (no defaults), and the paper-key location.
- `canli-execution kill` / `canli-execution unkill`.
- `canli-execution limits`: edits limits and journals a `config` entry.

No MCP tool writes any of these files.

### 2.4 Changes to the three existing servers

- **Validation.** Two optional arguments to the existing `validate_paper_evidence`, no new tool.
  - **`journal_file`** (local only). Verifies the chain and signatures, checks the record's `source_bindings` against the file's sha256, and recomputes returns, turnover, drawdown and costs from the fills and marks. Each recomputed value must match the record's value to 1e-12.
    - Output gains `bindings {checked, journal_sha256_matches, chain_valid, first_bad_seq, recomputed_matches{...}}`.
    - Without a journal, it says "shape and field relationships only". This closes the gap where `semanticChecks` (`paper-evidence-core.js:122-158`) never looks at `source_bindings`, so a made-up record passes today.
  - **`gate`**: `{thresholds: {min_observations?, min_sharpe?, max_drawdown?, max_shortfall_excess_bps?}, name?}` plus an optional `shortfall` (the `measure_shortfall` output).
    - Returns `gate_result {verdict: MEETS_STATED_THRESHOLDS | DOES_NOT_MEET, criteria[{id, observed, required, status}], thresholds_sha256}` inside the signed output.
    - Only measured criteria are allowed; self-declared legal and operations items are not accepted.
    - Missing evidence for a stated threshold is FAIL, following `scripts/evaluate_capital_readiness.py`.
    - There are no built-in thresholds. The ALPHAC set may be referenced only by name, "ALPHAC gate v1 (proposed, not in force)".
  - Growth: 120 o200k tokens or fewer for both, inside validation 1.0's list bar.
- **Research.** `live_record` gains `section?: "record" | "execution"`.
  - The default output is unchanged. The schema moves from `z.object({}).strict()` (`mcp-research/src/server.mjs:249`) to one optional enum.
  - `execution` returns, per sleeve: the shortfall decomposition, fill rates by count and notional, the latency finding, each artifact's sha256 and age (stale after 8 days), an inactive-sleeve flag, and the paper-engine boundary.
  - Preconditions: `cost_model_realism.json` is corrected (decision 9), and the live-record length is reconciled (next-majors decision 24).
  - Growth: 60 cl100k tokens or fewer; output 700 tokens or fewer.
- **Fundamentals.** `event_window` is built inside F6 (filings and events), which the next-majors plan puts in the following major on top of F5's submissions ingest.
  - Hosted answers "unknown after <snapshot date>", never "clear".
  - Local mode fetches SEC submissions JSON live, with the user's declared User-Agent, at 10 requests a second or fewer.
  - Output is named "historical filing-lag range". It includes the lag range of 8-K item 2.02 filings and recent 8-Ks with their item codes, as of the date.
  - Until then, `check_orders` takes `event_risk` from the caller.

### 2.5 Token budget

| Server | Today (measured) | After (target) |
|---|---|---|
| canli-validation-mcp | 4,194 o200k, 15 tools (0.10.1) | 1.0 bar unchanged; trading additions 120 or fewer inside it |
| canli-fundamentals-mcp | 2,011 cl100k, 7 tools (0.5.0) | event_window counts toward F6's budget |
| canli-research-mcp | 659 recorded for 0.2.0 (re-measure) | 60 or fewer added |
| canli-execution-mcp, local, all toolsets | none | 1,400 o200k or fewer, 7 tools |
| canli-execution-mcp, hosted | none | 600 o200k or fewer, 2 tools |

For scale, validation averages about 280 o200k per tool (4,194 / 15). Measure all of these with the shared bench from next-majors foundation 0c, and fail CI above the target.

**Amendment 2026-09-28 (building check_orders).** Measured with the family bench (compact JSON, o200k):
- The zod-generated schema for `check_orders` was 1,183 local and 1,115 hosted. Most of it was bounds and closed-object markers that the server enforces anyway.
- The tool now publishes a lean JSON Schema (fields, types, enums, required keys), and the strict zod schema still validates every call. A test holds both to the same fields at every level. This gives **697 local and 654 hosted**.
- 350 is not reachable without hiding fields in description text, which trades call correctness for tokens. The targets become **check_orders 700 local and 660 hosted**, and **1,700 for the full local list** (about 243 per tool across 7 tools, below validation's 280). Test guards pin them in characters.
- Two inputs changed to cut tokens:
  - `market_state` is `{symbol: open|closed|halted|unknown}`. The per-symbol `source` was never used by the core.
  - `event_risk` is out of 0.1.0's `check_orders`. It only warned, and nothing can supply it until fundamentals F6; it returns with sequence C.
- Hosted `check_orders` takes no `account` (decision 3 at its safe default, since the owner was not asked it). The validator refuses it with a sentence that says to run locally.
- A 100-order, 50-symbol local check measured a median of 0.33 ms and a p99 of 0.81 ms in process (Node 24, 2026-09-28), against the 20 ms target.

### 2.6 Proposed and cut

- **`schedule_order` (TWAP/VWAP/POV/Almgren-Chriss executor):** cut. It duplicates cost-at-schedule and adds a tool to every turn. Its executor would submit children for hours after one approval, from a stdio process that dies when the client closes. A cost-against-risk frontier can join `check_orders` in 0.2.
- **A separate `estimate_cost`:** merged into `check_orders`. One code path means a check can never be more permissive than a submit.
- **`evidence_tier` and Kelly in sizing; "READY" in the gate:** cut. They read as endorsements.
- **TOTP, the plain `approve` CLI, and form-mode approval:** cut. The agent could complete them, and the MCP spec forbids form mode for this.
- **p10/p50/p90 cost bands:** renamed low/base/high over the impact coefficient. They were never quantiles.
- **Calibrating the cost band on AlphaMax paper fills:** dropped. The filled execution spread runs from p10 -162.5 bp to p90 +122.0 bp, which is gap and limit padding, not impact (`implementation_shortfall/result.json`).

---

## 3. Hard safety rules: enforcement in code and tests

### 3.1 Threat model, stated on the README's first screen

- **A: an agent acting through MCP tools**, including prompt injection in tool results and other servers' tools such as browser automation. The rails below are built to prevent harmful actions here, and tests hold them to it.
- **B: an agent with shell or file access as the same OS user** (Claude Code, Cursor). It can read broker keys, delete files, edit the installed package and call the broker directly. Local code cannot prevent this, and cannot reliably detect it either, because the detector runs in files the agent can edit. The only controls outside the machine are at the broker: a dedicated account with a small balance; no margin, shorting or options permissions; and fill-confirmation emails to the human. The README says this plainly. The live release adds an optional privilege-separated mode (see 4.4).
- **C: supply chain.** A malicious or tampered package release.
- **D: Canli's servers compromised.** Hosted builds cannot place orders, and the anchor ledger holds only hashes.

### 3.2 Rules (rule, then code, then test)

1. **Paper by default, and 0.1.0 contains no live code.**
   - Code: the venue enum is `alpaca_paper | local_sim`. There is no live host constant and no `mode` field.
   - Test: a packaging test finds no `api.alpaca.markets` string, and no module outside the paper adapter that holds a trading host. zod refuses any other venue.
2. **Order tools exist only in the local build.**
   - Code: `hosted.mjs` imports only the plan cores.
   - Test: an import-graph test on `api/mcp-execution.js` finds no module under `mcp-execution/src/broker/` or `src/journal/`. A real SDK client lists hosted tools first and asserts the exact set. A byte-equality test compares hosted with the released package (0a).
3. **No custody.**
   - Code: the adapter holds a table of allowed (method, path) pairs: orders, positions, account, account/configurations (GET only), clock, calendar, latest quote, activities of type FILL, and bars. Every other path throws. There is no withdraw, transfer, deposit or wallet function anywhere.
   - Test: enumerate the table. A request to any other path throws before any network call.
4. **Credentials never appear in tool I/O, and hosts are exact.**
   - Code: keys come from `~/.canli/alpaca-paper.env` (mode 0600) or the server process env, never from tool inputs. A redaction filter holding the loaded secret values wraps every result and error. A fetch wrapper allows exactly `paper-api.alpaca.markets` and `data.alpaca.markets` (plus `canlicapital.com` for an opt-in anchor). `APCA_API_BASE_URL` is ignored. There is no proxy option.
   - Test: a secret-substring scan over every test output, errors included. A request to any other host throws. Setting `APCA_API_BASE_URL` changes nothing. A network-deny harness sees only allowed hosts.
5. **Human approval for every live order** (live release only). It must be WebAuthn with `userVerification: "required"`, on `http://localhost:<random port>` with rpId `localhost` and a one-time path token, with Host and Origin checks against DNS rebinding.
   - The page is opened through URL-mode elicitation or a printed link.
   - It shows a quote fetched from the broker and the notional, never prices the agent supplied.
   - The challenge is sha256(approval digest ‖ nonce). The digest covers symbol, side, qty, type, limit, TIF, account id and client_order_id for every order in the batch.
   - Approvals are single-use and expire in 60 s. Values are rendered with `textContent`, never string replacement.
   - Test: replay, expiry, a digest mismatch, the wrong credential, UV=false and a batch altered after approval each refuse. Test on macOS Safari, Chrome, Windows Hello and one FIDO2 key before claiming support.
6. **The agent cannot raise limits.**
   - Code: the effective limit is min(limits file, call argument). No tool writes config. Each check reads the file and journals its digest. A digest different from the last journaled `config` entry, without a matching CLI entry, journals `config_changed_outside_cli`. In paper that is a warning; in live it disarms. In live, any unknown or unreadable safety input refuses: calendar, clock, market status, limits signature, drawdown state.
   - Test: a property test over 10,000 random cases where a looser argument changes 0 verdicts. `tools/list` contains no config-writing tool. One fail-closed test per input.
7. **Kill switch.**
   - Code: the existence of `~/.canli/KILL` stops all submissions. Anyone can create it, and it is checked before every order, including inside a batch. Live additionally needs an unexpired, passkey-signed arm token, so deleting or corrupting the token disarms.
   - Test: KILL created mid-batch leaves 0 further submits. A missing, corrupt or expired token refuses live.
8. **Blast radius sits at the broker** (live release).
   - Code: refuse live when broker-reported equity exceeds the `max_account_equity` declared at arming. Also refuse unless the account configuration reads `max_margin_multiplier "1"`, `no_shorting true`, `max_options_trading_level 0` and `trade_confirm_email "all"`. The first live release is long-only cash US equities.
   - Test: one mocked configuration per field, each refused.
9. **Reject, never resize.**
   - Code: `pretrade-core` returns every reason. Reduce-only orders are exempt from caps, never from the collar or the integrity check. A systemic gross breach halts. A closed market rejects market and DAY orders in paper and live; an unknown market rejects in live and warns in paper. The market day comes from the broker's `/v2/clock` and calendar, resolved in America/New_York with daylight saving.
   - Test: parity and mutation tests (section 4). A DST boundary test at 00:30 ET in July.
10. **Idempotency.**
    - Code: `client_order_id` is derived from the decision. On a duplicate-id 422, fetch the existing order and compare symbol, side, qty, type, limit and TIF. Any difference refuses as `duplicate_id_different_order`.
    - Test: resubmitting to Alpaca paper creates 1 order. The mocked mismatch refuses.
11. **Audit trail.**
    - Code: persist before submit, with fsync. Arrival bid, ask and mid, plus the feed, are captured at submit. `broker_state` reconciles on every call. An ORPHAN is journaled; in live it disarms.
    - Test: kill the process between persist and submit; after restart, the NEW row is recovered and nothing is sent twice. An ORPHAN fixture produces a journal entry.
12. **Not advice.**
    - Code: no input schema lets the tool choose a symbol, side, size, time or venue. Outputs come only from stated inputs.
    - Test: an output lint over every fixture finds 0 of "should", "recommend", "READY", "eligible", "Kelly" or "optimal". A README lint does the same.
13. **Jurisdiction.** No proxy, VPN or base-URL option. Venue access and KYC are the user's. The README states that US status (SEC adviser and broker; CFTC CTA for any future perps or futures, where Rule 4.14(a)(9) excludes advice "tailored to the ... positions ... of particular clients") and UAE status (VARA, whose licensed activities include advisory and broker-dealer services; plus DFSA, FSRA and SCA) need counsel, and that the README is not legal advice.
    - Test: the config schema has no proxy fields.
14. **No telemetry.**
    - Test: the network-deny harness over the whole suite.
15. **Supply chain.**
    - Code: publish only from CI with npm Trusted Publishing and provenance, never from a laptop. No install or postinstall scripts, two pinned dependencies, signed GitHub releases with SHA256SUMS.
    - Test: a packaging test asserts no lifecycle scripts, and the release workflow is the only publish path.
16. **Residual stated.**
    - Test: a README test pins the threat-B paragraph within its first 40 lines.
17. **Canli's own live testing** runs only through an account and entity held by the adult legal signer (capital gate L1). The owner is a minor and cannot hold the broker account.

---

## 4. The first release: canli-execution-mcp 0.1.0 (paper only)

Build it in a fresh worktree from `origin/main` of canlicapital. Do not `cd` into `~/alphaforge` or any canlicapital worktree (plugin junk). Record Python parity fixtures from alphaforge by absolute path and `PYTHONPATH`, pinned to a commit (8633f95 today), with the sha written into each fixture file.

Parity with AlphaForge proves the port is faithful, including AlphaForge's defects. Each item therefore also gets a check that does not share its logic.

### 4.1 Build order, with verification (efforts are estimates, solo days)

1. **Skeleton, toolsets, hosted split, packaging** (1.5 days).
   - Checks: the import-graph test; hosted tool set; toolset gating (the broker toolset is absent without an `init` config); inspector exits 0 in both protocol eras; pass-count assertions in every test runner.
2. **`exec-cost-core`** (3.5 days): fees, half-spread, sqrt impact, 1% and 5% regimes, borrow carry, book walk, and local ADV/vol derivation from bars.
   - Ground truth: 1,000 randomized fixtures from `TransactionCostModel`/`FeeSchedule`, 0 differences above 1e-12. Five hand-computed cases from the documented formula. Property tests: monotone in notional; impact scales with sqrt(Q/ADV); boundaries pinned at exactly 1% and 5%. Book-walk VWAP equals the `PaperBroker` walk on 100% of recorded books, and matches hand-computed ladders. ADV/vol derivation matches a pandas recompute on recorded bars to 1e-12.
3. **`pretrade-core` and `check_orders`** (3 days).
   - Ground truth: 5,000 random batches through `PreTradeChecker`, with the same verdicts and the same reason codes. Tests pin the deliberate deviations: fail-closed live, DST, no silent fee, and duplicate-parameter refusal.
   - Mutation testing: weaken each check in turn; each must fail at least one test (100% kill).
   - The recorded weekend batch is replayed exactly as submitted: 185 orders at 05:08 UTC on Sunday 2026-08-02, all accepted by the paper broker (`var/trading_equity.sqlite`, orders at ts 1785647292647; marketable limits padded 0.75% per `live_cycle.py:139-144, 264-265`). All 185 reject `market_closed`. (Corrected 2026-09-28: this line first said a 180-order batch on "Saturday 2026-08-06"; that date was a Thursday, and the database shows the Sunday batch.)
4. **`size_position`** (2.5 days).
   - Ground truth: parity with `portfolio/discretize.py` (lot grid, min-notional ×1.05, reduce-only never skipped), `portfolio/overlay.py`, and the `ladder_paths` twin vectors. 0 cap violations in 10,000 random cases. Tightening each cap in turn makes it the named binding constraint every time. A fail-closed drawdown test.
5. **`trade-journal-core`, the `canli.trade-journal.v0` standard and `journal verify/head`** (4 days).
   - Ground truth: an independent Python verifier using hashlib and `cryptography`, written from the schema without reading the JS, agrees on 100% of vectors.
   - Flipping one byte in each of 1,000 random journals fails verify at the correct seq every time. Dropped and reordered entries fail too.
   - Append with fsync: measure p99 and publish the figure. The target is 20 ms or less on the reference Mac.
6. **Alpaca paper adapter, local simulator, `place_order`, `cancel_order`, `broker_state` and reconciliation** (5 days).
   - Mock-transport tests for every refusal path.
   - An Alpaca paper integration suite runs in a protected CI environment on a dedicated paper account (decision 6): order, duplicate id, cancel, partial and fill sync, reconcile AGREE, and a planted ORPHAN (an order placed outside the tool) detected in one sync.
   - 100% of journaled orders carry arrival bid, ask, mid and feed.
7. **`measure_shortfall`** (3 days).
   - Ground truth: the accounting identity delay + execution + opportunity + fees = total per order, to 1e-12. Buy/sell mirror tests. 100% of planted splits excluded. The bootstrap CI checked against `arch` StationaryBootstrap within Monte Carlo error on 3 fixed-seed cases.
   - Reproduction: AlphaMax gives IS 39.749790986843124 bp, excess over at-open 9.017261409356546 bp and fill rate 0.8165571076417419 by count on 4,868 orders. AlphaVintage gives IS -9.359669139054965 bp on 60 orders. Both must match within 1e-9 (`/Users/arhancanli/alphaforge/artifacts/analysis/implementation_shortfall/result.json`).
   - This runs as a recorded pre-release job on the owner's machine unless the order-level data is published (decision 8).
8. **`journal export` to paper-evidence** (2.5 days).
   - Paper-evidence conformance is necessary but proves little, because the export satisfies the semantic rules by construction.
   - The real bar: an independent Python recompute of returns, turnover, drawdown and costs from the journal agrees with the exported record to 1e-12 on 1,000 random journals.
9. **Tool-level adversarial suite** (2.5 days). This is deterministic, with no LLM, for threat A.
   - Injected instructions in broker fields and error texts.
   - Attempts to exceed each cap, to split orders around the daily cap, to trade after KILL, to reach other hosts, and to pass keys in arguments.
   - A scan for secret substrings.
   - Bars: 0 breaches, 0 secrets.
10. **Docs and release mechanics** (2.5 days).
    - README first screen (what it does, the paper boundary, threat B), SECURITY.md (what is read, sent and written, checked against the code), CONTRIBUTING, `.mcpb`, `server.json`, registry entry, and the CI Trusted Publisher.
    - Agent benchmark tasks in `mcp/bench/agent` if the owner approves spend: "what will buying N shares cost", "why was this order rejected", "place a paper order within my limits", "export and validate my record".

Total: about 30 solo days (estimate), excluding the extensions to the other servers:
- validation `journal_file` and `gate`: about 6 days;
- research `section: execution`: about 2 days, after the artifact correction;
- the anchor service, if approved: about 4 days;
- fundamentals `event_window`: inside F6.

### 4.2 Release bar for 0.1.0 (all must hold)

- Every parity, identity and independent-recompute bar in 4.1 is met at its stated tolerance.
- 100% mutation kill on `pretrade-core` and on the journal verifier.
- 0 cap violations in 10,000 random order sequences, and 0 verdict changes from looser arguments.
- 0 submits after KILL, 0 duplicate orders on Alpaca paper, and 0 order-capable tools in hosted `tools/list`.
- 0 credential substrings in any output, and 0 requests to hosts outside the allowlist.
- Token targets from 2.5 are met, measured in CI with `tools/list` first; output schemas stay open.
- A local 100-order `check_orders` takes 20 ms or less (target, measured with orphan servers killed first).
- README numbers come from a bench, and `grep -F` finds no stale figure.
- Signed commits, squash merges, CHANGELOG under Unreleased until the release, and no AI credit anywhere.

### 4.3 Not in 0.1.0

Live orders; ccxt; the cost-risk frontier; journal anchoring (unless decision 7 is yes); a shortfall verdict; perps, futures, options and margin; guard mode.

### 4.4 Later releases (each needs its own bar)

- **0.2:**
  - ccxt sandbox/testnet as an optional peer dependency, on one venue first.
  - The Almgren-Chriss (2000) cost-against-risk frontier inside `check_orders` for `execution: scheduled`. It must reproduce the paper's worked example to 1e-6.
  - `journal` import of the user's own broker fills, labelled SELF_REPORTED.
  - A spike on guard mode: wrapping an official broker MCP (decision 12).
- **Live release** (only after decisions 4, 5 and 6, and counsel):
  - Rules 5, 7 and 8 above; exact hosts `api.alpaca.markets` and `paper-api.alpaca.markets` only; keys in the OS keychain; approval of an exact batch digest; cancelling a protective order needs approval.
  - An optional privilege-separated mode: the order server runs as a separate OS user or launchd daemon behind a localhost MCP endpoint, so the agent's user cannot read keys or edit the code. That turns threat B into threat A.
  - A scripted LLM red team for threat A (3 models, 50 or more attempts each): 0 live orders without a fresh valid approval.
  - For threat B with an unmodified package: 100% of out-of-band orders flagged ORPHAN within one sync, and live disarmed.

---

## 5. How it connects to the other servers (call sequences)

Each sequence gets a link test that proves the two sides fit.

**A. Paper trade to checked evidence**
1. `validation.research_session {action: "open", hypothesis_sha256}` (validation 1.0 item 5) returns `session_id`.
2. `execution.check_orders {orders, market, fees, account}` returns verdicts, cost and `limits_digest`.
3. `execution.size_position {…, caps}` (optional).
4. `execution.place_order {orders, venue: "alpaca_paper", strategy_id, session_id}`.
5. `execution.broker_state {include: ["fills", "reconcile"]}` on later days; marks are journaled.
6. `execution.measure_shortfall {journal_range}`.
7. `execution.journal {action: "export", strategy_id, session_id}` returns the record and the journal path.
8. `validation.validate_paper_evidence {record, journal_file}` (local) returns `bindings.checked: true`, recomputed matches, and a signed receipt.
9. `validation.verify_receipt`.

Link test: an exported record passes `bindings` with `recomputed_matches` all true. Changing one fill's price in the journal fails both `journal verify` (at the right seq) and the bindings check.

**B. Backtest cost assumption against measured cost**
1. `validation.audit_backtest {positions_file, prices_file, …}` (1.0 item 6) returns break-even bps and the capacity table, computed by `exec-cost-core`.
2. `execution.check_orders` on the first live-size order returns an impact figure.
3. `execution.measure_shortfall {journal_range, backtest_cost_bps: <the audit's assumed cost>}` returns the excess over the assumption.

Link test: the same order inputs give byte-identical impact numbers in the audit and in `check_orders`.

**C. Event risk before trading a US stock** (after fundamentals F6)
1. `fundamentals.event_window {ticker, as_of}` returns `in_window` and recent 8-K items, or `unknown after <snapshot>` when hosted.
2. `execution.check_orders {…, event_risk: {<symbol>: {in_window, source, as_of}}}` returns an `event_window` warning.

Link test: `event_window`'s output parses as `check_orders`' `event_risk` input, and an `unknown` never produces "clear".

**D. Canli's own execution reference**
1. `research.live_record {section: "execution"}` returns Canli's measured paper shortfall and fill rates with artifact hashes.

Link test: every number traces to an artifact sha256 served on the CDN. Documentation cites these figures as Canli's paper measurements. They are never used as defaults for users.

**E. Thresholds before any live arming** (live release)
1. `validation.validate_paper_evidence {record, journal_file, gate: {thresholds}, shortfall}` returns MEETS_STATED_THRESHOLDS or DOES_NOT_MEET, with `thresholds_sha256`, in a signed receipt.
2. If the signed limits file sets `require_gate_receipt`, arming checks offline that the receipt verifies against the published keys, and that its thresholds digest, strategy_id and journal chain head match the file.

Link test: the measured criteria that map (E1 observations, E2 Sharpe, E3 drawdown, X1 shortfall excess) reproduce `scripts/evaluate_capital_readiness.py` per criterion on ALPHAC's current inputs, recomputed at build time. The current verdict is NOT_READY_PAPER_ONLY with 7 of 11 failing (E1: 9 of 756). Arming refuses forged, DOES_NOT_MEET and wrong-strategy receipts 100% of the time.

---

## 6. Decisions only the owner can make

1. **Build canli-execution-mcp as a fourth server, with 0.1.0 paper only?**
   - Yes: about 30 solo days (estimate), then a separate release per 4.4.
   - No: ship only the non-order tools (`check_orders`, `size_position`, `measure_shortfall`, `journal` with fills pasted in). There is no broker toolset, and traders place orders elsewhere.
2. **Build it before validation 1.0?**
   - Yes: trading ships about 6 weeks sooner. Validation 1.0 (about 40 days) slips by the same amount, and the `research_session` link in sequence A waits for it.
   - No: validation 1.0 first, so sequence A works end to end at the execution release.
3. **May hosted tools receive a user's positions, equity or fills,** statelessly and unlogged, with that promise written in SECURITY.md and tested?
   - Yes: hosted `check_orders` with account checks, plus hosted `measure_shortfall`.
   - No: hosted is cost and order-level checks only; everything that takes a book is local. `size_position` stays local-only either way until counsel answers decision 5.
4. **Will real-money order placement ever ship?**
   - Yes: design and red-team work for the live release starts only after decisions 5 and 6.
   - No: the package stays paper, and the README says so permanently.
5. **Instruct counsel now on the US (SEC adviser and broker status of interactive tools; CFTC CTA status) and the UAE (VARA advisory and broker-dealer activities; DFSA, FSRA, SCA)?**
   - Yes: this is needed before any live release and before hosting sizing.
   - No: live and hosted sizing stay blocked.
6. **Which adult-controlled entity publishes the order-capable package and owns the Alpaca paper account used in CI** (and, later, any live test account)?
   - With no answer, the Alpaca paper integration suite cannot run in CI. It then runs only as a recorded manual job.
7. **Build a public anchor ledger** (new `/api/v1/anchors`, one Supabase table, signed statements that include the received time), sending only {pubkey, seq, head hash, previous anchor, signature}, daily and opt-in?
   - Yes: about 4 days. Journals gain third-party time evidence and fork detection. Canli sees users' IP addresses and anchoring times.
   - No: integrity rests on the user's own signature only, and the export says so.
8. **Publish Canli's own order-level paper data** (the AlphaMax and AlphaVintage orders)?
   - Yes: the 39.749790986843124 bp reproduction becomes a public CI test.
   - No: it stays a recorded pre-release job that others cannot rerun.
9. **Correct `public/glassbox/cost_model_realism.json` now?** It would say commission is not measurable because PaperBroker charges the modelled fee, and that crypto has had 0 fills since go-live.
   - Yes: this is required before research's execution section cites it.
   - No: the research change waits, and the circular claim stays public.
10. **Adopt the capital-readiness gate for ALPHAC itself before offering the `gate` argument,** approve the MEETS_STATED_THRESHOLDS naming, and add VARA to L2?
    - Yes: the product standard matches house practice.
    - No: `gate` ships with thresholds the user must supply and no ALPHAC reference.
11. **Allow one passkey approval to cover an exact batch** (for example, a 30-order rebalance), rather than one approval per order?
    - Yes: rebalances are usable, and the digest still covers every field of every order.
    - No: each live order needs its own touch.
12. **Reach more brokers by wrapping official broker MCP servers ("guard mode")** rather than writing adapters?
    - Yes: a spike in 0.2. Coverage is broad, but it depends on each server's tool schemas, and users must not also connect the raw server.
    - No: own adapters, one broker at a time.
13. **Set up the npm Trusted Publisher for `canli-execution-mcp`, with "require 2FA and disallow tokens", before the first publish?**
    - Yes: the only publish path is CI with provenance.
    - No: the package does not publish. There is no laptop fallback for an order-capable package.
14. **Approve API spend for the agent benchmark and, for the live release, a scripted red team** (3 models, 50 or more attempts each, cost estimated from the bench before approval)?
    - No: the benchmark and red-team bars cannot be measured, and the live release cannot meet its bar.

---

## Sources (read 2026-09-28)

**Local files:**
- `/Users/arhancanli/alphaforge/src/alphaforge/costs/{model.py,fees.py}`
- `/Users/arhancanli/alphaforge/src/alphaforge/risk/{pretrade.py,limits.py,killswitch.py}`
- `/Users/arhancanli/alphaforge/src/alphaforge/execution/{alpaca_broker.py,ccxt_broker.py,paper.py,order_manager.py,reconcile.py}`
- `/Users/arhancanli/alphaforge/src/alphaforge/portfolio/discretize.py`
- `/Users/arhancanli/alphaforge/scripts/{live_cycle.py,analyze_implementation_shortfall.py}`
- `/Users/arhancanli/alphaforge/config/capital_readiness_gate.json`
- `/Users/arhancanli/alphaforge/artifacts/engineering/capital_readiness.json`
- `/Users/arhancanli/alphaforge/artifacts/analysis/implementation_shortfall/result.json`
- `/Users/arhancanli/cc-xs-20260928/standards/paper-evidence/schema.json`
- `/Users/arhancanli/cc-xs-20260928/js/{paper-evidence-core.js,receipt-statement.js,evidence-chain-core.js}`
- `/Users/arhancanli/cc-xs-20260928/api/_lib/{handler.js,envelope.js,receipt-signature.js,limits.js}`
- `/Users/arhancanli/cc-xs-20260928/mcp/src/server.mjs`
- `/Users/arhancanli/cc-xs-20260928/mcp-research/src/server.mjs`
- `/Users/arhancanli/cc-xs-20260928/public/glassbox/cost_model_realism.json`
- `/Users/arhancanli/canlicapital-expansion-20260919/docs/goal/{REQUIREMENTS.md,STATUS.md,LOG.md,VISION.md,MCP_BEST_IN_CLASS_PLAN.md,MCP_NEXT_MAJORS_PLAN.md}`

**Web:**
- MCP elicitation spec 2025-11-25: https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation
- ccxt MCP wiki (edited 2026-08-22): https://github.com/ccxt/ccxt/wiki/MCP
- Alpaca paper trading: https://docs.alpaca.markets/docs/paper-trading
- Alpaca account configurations: https://docs.alpaca.markets/reference/getaccountconfig-1
- Binance API key permissions: https://developers.binance.com/docs/wallet/account/api-key-permission
- WebAuthn RP ID: https://web.dev/articles/webauthn-rp-id and https://lists.w3.org/Archives/Public/public-webauthn/2020Jan/0112.html
- 17 CFR 4.14: https://www.law.cornell.edu/cfr/text/17/4.14
- VARA licensed activities: https://www.vara.ae/en/licenses-and-register/licensed-activities/

**Competitor claims** (tastytrade, IBKR, Robinhood, Webull and others) are as reported in the brief from https://www.stockbrokers.com/guides/ai-agent-brokers and https://github.com/mphinance/awesome-broker-mcp. I did not re-check them today.
