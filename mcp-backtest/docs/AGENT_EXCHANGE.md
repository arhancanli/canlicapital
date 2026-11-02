# The agent exchange protocol

Version 1. How different AI agents trade against each other in a closed paper market, whatever model or host each one runs on. Everything is made-up assets and made-up money. Nothing here can reach a real security, token or currency, and running a real market like this would need registration as an exchange or a broker-dealer.

## What it is for

Seeing what agents do together: who supplies liquidity, who runs when it goes, and how forced selling feeds on itself. It shows how a set of rules can behave. It does not predict any real market.

## The rules

**Time moves in steps.** Nobody wins by being on a faster machine. Every agent acts on the same view of the market, and a step closes only when each joined agent has acted, an empty list counting as passing. Within a step, the order agents act in comes from the seed.

**Each agent sees only its own account.** A view holds the book, recent trades without names, and the agent's own cash, positions and orders. It holds no other agent's positions and no asset's true value.

**An agent acts only as itself.** Joining gives a token, and every later call needs it.

**The book goes by price, then time.** A trade happens at the resting order's price. An order never trades with its own agent: the resting one is cancelled.

**Margin.** Positions may reach `leverage` times equity when opened. An account whose equity falls below `maintenance_margin` of its gross positions is sold down at market, half at a time, into whatever is left in the book. Each sale moves the price, which can put the next account under. That chain is the cascade, and the report counts its rounds.

**Anyone can check a run.** Every trade extends a hash chain, so the same seed, personas, shocks and orders give the same `tape_hash` on any machine.

## The messages

Each is a tool. All take `exchange_file`, the shared state file, and any number of servers on any number of hosts may use one file: writers take turns.

| Tool | Who | What |
|---|---|---|
| `exchange_new` | Whoever sets it up | Seed, assets, personas, leverage, margin, and shocks at set steps |
| `exchange_join` | Each agent | Name and what it is. Returns its token |
| `exchange_view` | Each agent | The market as this agent may see it |
| `exchange_orders` | Each agent | `limit`, `market` and `cancel` orders for the coming step |
| `exchange_step` | Whoever runs the clock | Closes the step once every joined agent has acted |
| `exchange_report` | Anyone | Each asset's worst fall and recovery, spreads and depth, who gained and lost, forced selling, and the tape hash |
| `exchange_run` | Anyone | A whole run of scripted personas in one call, for comparing set-ups |

## Personas

Scripted traders fill out the market, each seeing what any agent sees. They are simple on purpose, and their numbers are in `src/exchange.mjs` because they are the assumptions: `market_maker` (quotes both sides and steps back when prices move fast), `value` (trades toward a noisy view of true worth), `momentum` (follows recent moves), `noise` (small random orders), `deleverager` (keeps its risk level, so it sells as volatility rises), `stop_loss` (sells after a fall), `levered_long` (borrows to the limit and holds until the margin rule sells it out).

Different parameters give different cascades. A result here is a question to ask of a real system, not an answer about it.

## Running different models together

`recipes/exchange_agents.mjs` runs each agent through its own server against any OpenAI-compatible endpoint, so one can be Claude and another GPT or a local model.
