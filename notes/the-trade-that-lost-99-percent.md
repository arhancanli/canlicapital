# The trade that lost 99 percent, and the guard I did not add

> A carry signal bought a token at 16.15 and closed it at 0.1553. The strategy was not
> broken. The interesting decision came afterwards, and it was to change nothing.

**Published 2026-08-27. Evidence: `crypto_lab_carry_crash_incident.json`, content hash
`sha256:0083a155a8`, source-bound to the paper execution database and the point-in-time
funding table by SHA-256.**

## What happened

On 2026-07-05 at 16:00 UTC the crypto carry sleeve opened a long in `BINANCE:PERP:LABUSDT`:
114 units at 16.15, about 1,841 quote units of notional. On 2026-07-30 at 00:00 UTC the
scheduled rebalance closed it at 0.1553 and opened a short.

Twenty-four days. A price return of **-99.0384 percent**. After entry and close fees, a
realised loss of **1,824.37** quote units on 1,841.15 in.

The token did not drift down. It collapsed, and a venue delisted it.

## The signal was not wrong. It was answering a different question.

Funding carry on a perpetual future is not a directional bet. When funding is negative,
shorts pay longs, so holding a long collects a stream of payments. The signal asks: *who is
being paid to hold this?* It does not ask: *will this thing still exist next month?*

While the position was held there were 221 funding settlements. 68 were negative, with a mean
rate of -0.0017 and a minimum of -0.02. The first non-negative settlement arrived on
2026-07-08, three days in. Funding later changed sign, which is precisely why the scheduled
rebalance closed the long and flipped short: the carry had gone the other way.

So the sleeve harvested the carry it was designed to harvest, and the principal underneath it
went to approximately zero. Both statements are true at once. A strategy can execute its
mandate perfectly and still lose almost everything, and if your reporting cannot express that
sentence, your reporting is lying to you.

## First question: was this us, or was this the market?

Before writing anything about the market, the honest move is to suspect your own code. A 99
percent loss looks identical to a contract-identity defect: a stale symbol mapping, a
mis-scaled contract multiplier, a token that redenominated while the position record kept the
old units. Any of those would produce exactly this shape.

So the incident record binds two artifacts by hash and reads them rather than trusting memory:

- `var/trading_crypto_perp.sqlite`, `sha256:d5827f3e02...`, the actual paper execution
  database with the three orders in it;
- `data/lake/funding/instrument_id=BINANCE:PERP:LABUSDT/year=2026/data.parquet`,
  `sha256:233336b834...`, the point-in-time funding series.

And it cites independent, dated market evidence that has nothing to do with this system: third
party historical prices for the token across the July collapse, and a venue's public delisting
announcement.

The verdict recorded is `GENUINE_MARKET_CRASH_NOT_CONTRACT_IDENTITY_DEFECT`. The price really
did that. Our books are right.

That verdict is worth more than the loss cost, because the alternative finding would have
invalidated every crypto number the system has ever published.

## Second question: what do I change?

This is the part I want to argue for, because the intuitive answer is wrong.

The intuitive answer is a price-jump guard. Add a rule: exit any position that falls more than
X percent in a day, or refuse to enter instruments whose realised volatility exceeds some
threshold. It feels like risk management. It would have saved 1,824 units. It is easy to
implement and it would look responsible on a page like this.

The decision recorded is `PRESERVE_LOSS_NO_PRICE_JUMP_GUARD_NO_WEIGHT_CHANGE`.

Here is why. I have exactly **one** observation of this failure. A threshold chosen after
seeing that observation is not a risk control; it is a parameter fitted to a single point,
with the answer already visible. I could not tell you whether X should be 40 percent or 80,
and neither could the data, because there is one event and any X between them fits it equally
well. The honest name for choosing a number under those conditions is overfitting, and it does
not stop being overfitting because the motivation was prudence rather than performance.

Worse, the guard would have a second effect nobody measures: it would change the behaviour of
the sleeve across every instrument, in every regime, forever, on the strength of one July.
That trade has to be paid for out of the same trial budget as any other parameter, and its
benefit has to be demonstrated prospectively, not asserted.

There is a real design question underneath the incident, which is whether a carry signal
should size by funding alone or should also carry a survivorship or liquidity term. That is a
research question with a pre-registration and a holdout, not a patch. It stays open.

So the record keeps the loss, at full size, in the published equity curve, and adds nothing.

## Third question: what could I not answer?

The incident record contains a section I would rather not have had to write.

Position snapshots at the time retained quantity and average entry price, but **not** the exact
cycle mark or the instrument-level unrealised PnL. So the question "what did this position
look like on 2026-07-18?" cannot be answered from the record. It can only be estimated from
aggregate equity, and an estimate presented as a measurement is a fabrication.

The record says so, in the artifact, under `observability_correction`. The fix is prospective:
future paper cycles persist the exact order-book mark, the mark source, market value and
unrealised PnL through an additive nullable schema migration. It does not retroactively invent
the missing history, because there is nothing to invent it from.

An incident report that only documents what you can explain is marketing. The gap is the part
a reader cannot get anywhere else.

## What this episode does not explain

One boundary, stated because it would be easy to imply otherwise: the LABUSDT long closed on
2026-07-30. The flagship forward record starts on 2026-08-07. The incident is classified
`PRE_FLAGSHIP_WINDOW_DOES_NOT_EXPLAIN_CURRENT_FORWARD_LOSS`.

If the published forward record is negative, this trade is not the reason, and reaching for it
as an explanation would be convenient and false.

## The general rule

The three questions, in order, and none of them is "how do I stop this happening again":

1. **Is the loss real, or is it my accounting?** Bind the artifacts by hash and read them.
   Suspect yourself before you suspect the market.
2. **Do I have enough observations to justify a change?** One event supports a research
   question. It does not support a threshold.
3. **What can I not reconstruct?** Publish that gap in the same document, or the report is an
   advertisement.

The loss is on the curve. It is supposed to be.

*Source: [`/glassbox/crypto_lab_carry_crash_incident.json`](/glassbox/crypto_lab_carry_crash_incident.json).
Every figure in this note is in that artifact; none is typed here from memory.*
