# canli-paper-trading-mcp

Lets an AI agent trade your **Alpaca paper account** without being able to skip the checks. Every
order is previewed against your own limits, the market clock and a kill switch; only orders that
pass get a five-minute confirmation token, and only a token can send them. Paper only: the package
contains no live trading host, and live keys are refused.

Local stdio. Your keys stay in your environment; nothing goes anywhere except Alpaca's paper API.

## Tools

| tool | what it does |
|---|---|
| `paper_account` | Equity, cash, buying power, positions, open orders, market clock, kill switch, and the order log's verified head. |
| `preview_paper_orders` | Runs the pre-trade checks on your orders with live paper data; returns a token only if every order passes. |
| `rebalance_to_weights` | Turns target weights (e.g. from a backtest) into whole-share orders, sells first, checks them, returns a token. |
| `send_paper_orders` | Sends previewed orders with their token, or cancels open orders by id. The only tool that changes anything. |

## The checks

The pre-trade checks are canlicapital's shared core (`js/pretrade-core.js`, mirrored byte for byte
and tested in the repository). Per order: kill switch, allowed symbols and order types, market open
or closed, price collar, order and daily notional caps, position, gross and net caps against your
whole book, reduce-only integrity, and an estimated cost (half spread; commission and impact when
you supply fees and volume). A rejection lists every reason; nothing is resized.

Your limits live in `CANLI_HOME/limits.json` (default `~/.canli`), for example:

```json
{ "max_order_notional": 10000, "max_position_frac": 0.2, "max_gross": 1.0, "allowed_types": ["limit"] }
```

A call can tighten these for one preview, never loosen them. While a file named `KILL` exists in
that directory, every preview fails and every send is refused.

## Tokens

- Bound to the exact orders previewed: change a quantity and the token no longer verifies.
- Single use and valid for five minutes, so a send never acts on stale checks.
- Signed with a key that lives only in the running server; a restarted server rejects old tokens.
- Each sent order carries a `client_order_id` derived from its token. Alpaca refuses a repeated id,
  so a retried send cannot fill twice.

## Order log

Every send and cancel is appended to `CANLI_HOME/paper-orders.jsonl`, each line holding the hash of
the one before. `paper_account` reports whether the chain still verifies; an edited line breaks it.

## Quick start

1. Create an Alpaca account and open the paper trading dashboard; generate paper API keys (the key
   id starts with `PK`).
2. Add the server with your keys in its environment:

```bash
claude mcp add canli-paper -e ALPACA_PAPER_KEY_ID=PK... -e ALPACA_PAPER_SECRET_KEY=... -- npx -y canli-paper-trading-mcp
```

Then ask: *"Rebalance my paper account to 60% SPY and 40% TLT, show me the checks, and send it if
everything passes."*

Pairs with [canli-quant-mcp](https://www.npmjs.com/package/canli-quant-mcp): backtest a strategy
there, then move the paper account to its target weights here.

## What this does not do

It does not trade real money, and there is no setting that makes it. It does not decide what to
trade. Paper fills are Alpaca's simulation and are kinder than real markets (no queue position, no
market impact); a strategy that works on paper has not yet shown it works live.

MIT licence.
