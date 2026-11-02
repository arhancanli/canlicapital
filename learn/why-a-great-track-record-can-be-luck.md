# Why a great track record can be luck

> Try enough strategies and one will look brilliant by chance. Here is the arithmetic, and the questions to ask before you trust a result someone shows you.

**Lesson:** 5

**Published 2026-11-02. The sums are [saved here](/glassbox/learn-examples-2026-11-02.json).**

## The coin-flip room

Put 1,024 people in a room and have each flip a coin 10 times. On average, one of them gets 10 heads in a row.

That person did nothing special. But if you met only them, and they told you their method, it would sound convincing.

Markets work the same way, with far more people flipping.

## The same thing with strategies

Suppose a test is fooled 5% of the time. It sees an edge in a strategy that has none, once in every twenty tries.

- Try 20 strategies with no edge, and the chance that at least one looks real is about 64%.
- Try 100, and it is about 99.4%.

So "it passed a test" means little until you know how many things were tried. This is not a rare trap. In [our own study of 300,000 simulated tests](/notes/would-it-beat-a-placebo), on markets with nothing to predict, a standard test on the best rule from a grid said "edge" between 10.9% and 78.9% of the time, when it should have said so 5% of the time.

## The winners are the ones you see

Funds with poor records get closed or merged into others, and then they drop out of the league tables. People who sell trading courses show their best year, not their worst. Nobody posts the strategy that lost money.

So the records you can find are already the lucky ones.

## Five questions to ask

1. **How many versions were tried?** One good result out of hundreds is what luck predicts.
2. **Was it tested on data it had not seen?** A rule built and tested on the same years will always look good.
3. **Is that after all costs?** Trading costs, fund fees and tax can remove a thin edge completely.
4. **How long is the record, and did it include bad markets?** A few years of rising prices flatter nearly everything.
5. **Was real money invested at the time?** A backtest is worked out afterwards, and that is a much weaker claim.

## Test one yourself

The [deflated Sharpe calculator](/tools/deflated-sharpe) is free. Give it a strategy's Sharpe ratio, a measure of return against risk, how many versions were tried and a few details of its returns. It shows the chance that the result beats the best that luck alone would give.

It can only speak to luck. It cannot tell you what will happen next.
