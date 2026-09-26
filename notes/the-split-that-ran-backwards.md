# The split that ran backwards

> From an August repair until 2026-09-14, my engine adjusted almost every stock split in the
> wrong direction, and every test passed. The data was right by its schema, the code was right by
> its tests, and the two disagreed about what one number meant.

**Published 2026-09-25. Every figure below is read from
[`split_direction_before_after.json`](/glassbox/split_direction_before_after.json), which runs
the same audit over the same stored splits twice: once through the price-adjustment code exactly
as it was before the fix, loaded from git and hashed, and once through the code as it is now.**

**Sources:** split_direction_before_after.json

## What a split does to a price series

On 2020-08-31 Apple split four-for-one. The closing price went from 499.23 to 129.04 overnight.
Nothing happened to the company. Each old share simply became four new ones.

A backtest that reads raw prices sees a crash on that day. So every research engine adjusts: the
prices before the split are divided by the split factor, which puts the whole history in today's
share terms, and the ex-date becomes an ordinary day. Apple's adjusted close the day before the
split should be 124.81, a normal step down to 129.04.

## What mine did instead

My data lakes store a split the way the data vendors publish it: new shares per old share. Apple's
split is stored as 4.

The adjustment code multiplied the pre-split prices by that number instead of dividing by it.
Apple's adjusted close the day before the split came out at 1,996.92. To anything reading the
adjusted series, Apple fell by more than nine tenths in one day.

It was not one bad row. The audit classifies a split as DOUBLED when the adjusted jump on the
ex-date is twice the raw jump, which is the signature of a factor applied upside down. Through the
old code, 4,272 of the 4,802 splits the audit can classify in the Polygon lake came out doubled.
In the Sharadar lake it was 4,000 of 4,440.

The momentum signal that picks the equity sleeve's stocks reads those adjusted prices. A stock
that had split inside its lookback window looked to the signal like it had collapsed.

## Why every test passed

There were two conventions, and each was consistent with itself.

- The data layer stored the vendor's factor, new shares per old. Its schema documents that.
- The adjustment code's tests encoded a two-for-one split as one half: old shares per new share.
  Against those fixtures, multiplying is exactly right.

Both sides had tests. Every test passed. No test put a real split from the lake through the real
adjustment code, so nothing ever compared the two conventions with each other.

It had also been worse before. Earlier, splits were not being applied at all, because of a
timing condition no stored split could satisfy. The August repair made them apply, in the wrong
direction, and the code's existing tests agreed with it. In September a research script noticed the inverted prices and worked around them locally, inside the script, without
touching the shared code. That workaround made one result correct and left the defect in place
for everything else.

## The fix

- The adjustment code now divides by the stored factor, and it refuses a factor that is zero or
  negative instead of producing a number.
- The code's own test fixtures now use the vendor convention.
- A new guard takes Apple's real 2020 split out of both production lakes, runs it through the real
  adjustment code, and checks that the day before comes out at a quarter of the raw price. That
  is the test that was missing: it checks the two sides against each other rather than each
  against itself.
- The research script's local workaround was removed, so there is one place where this is decided.

Through the current code, the same audit neutralizes 3,948 splits in the Polygon lake and 3,746
in the Sharadar lake.

## What is still not clean

Not every stored split follows the vendor convention. The audit finds 90 rows in the Polygon lake
and 93 in the Sharadar lake stored the other way up, most of them depositary-receipt ratio
changes. Under the fixed code those rows are now the wrong ones. I did not fix them by
re-inverting inside a consumer, which is how the September workaround hid the original defect.
Since 2026-09-23 a correction layer at the data reader applies corrections to them, each one
checked through the adjustment code, and the stored rows are left as the vendor sent them.

Nine days later I found that corporate actions had not been ingested at all for seven weeks,
because the weekly job that loads them had only ever been run by hand. Taken together, that was
enough to stop trusting the forward record built on those prices. I withdrew it in public on
2026-09-23 and restarted it on 2026-09-24 on data the engine can vouch for. The withdrawal and
what it covered are on the [progress page](/progress).

## What I took from it

A test proves that code does what its author believed. It does not prove that the author and the
data agree. The failures that survive a full test suite are the ones where two parts of a system
are each correct by their own definition. The only test that catches those is one that runs real
data from one side through the real code of the other.

The code is open, including the guard:
[canli-backtest](https://github.com/arhancanli/canli-backtest) for the backtester and
[canli-pit-lake](https://github.com/arhancanli/canli-pit-lake) for the data layer, both extracted
from [the engine](https://github.com/arhancanli/alphac).
