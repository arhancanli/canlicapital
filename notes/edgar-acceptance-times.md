# The same SEC filing has two acceptance times

> EDGAR's submissions API labels each filing's acceptance time as UTC. I checked 450 of them
> against the filing index pages: in 13 of 25 companies' files every time was late by one US
> Eastern offset, and the same filing read differently depending on which file it came from.

**Published 2026-10-11. Every figure below is read from
[`edgar-acceptance-times-2026-10-11.json`](/glassbox/edgar-acceptance-times-2026-10-11.json),
which holds all 450 measured filings, the per-file results and the checks quoted here.**

## Why the time of day matters

Each filing in `data.sec.gov/submissions/CIK##########.json` carries an `acceptanceDateTime` such
as `2026-07-14T14:30:38.000Z`. The trailing `Z` says UTC. Whether a results release came out
before the open or after the close, which trading day an insider purchase belongs to, and an
event study's day 0 all depend on that time.

## What I measured

On 2026-10-11 I took 25 companies' submissions files: the 12 newest filings in each, plus 6
accepted in December, January or February to cover standard time. That is 450 filings across 34
form types, 98 filing agents and the years 2024 to 2026.

For each one I compared `acceptanceDateTime` with the "Accepted" time printed on the filing's index
page (`{accession}-index.htm`). That page is in US Eastern time and matches the filing's own SGML
header, so converting it with the New York rules gives the true moment.

## What I found

**Each file was either right for every filing in it, or late by exactly one Eastern offset for
every filing in it:** 4 hours for filings accepted in daylight time, 5 hours in standard time. No
other difference appeared, whatever the form, the filing agent or the time of day. Of the 450
filings, 216 were right and 234 were late.

- **Right:** MSFT, GOOGL, XOM, PFE, KO, TSLA, NFLX, INTC, GE, F, O and SPY.
- **Late by one offset:** AAPL, NVDA, AMZN, META, JPM, BAC, WMT, BRK, TSM, GME, PLTR, MRNA and
  Vanguard.

So JPMorgan's results 8-K of 2026-07-14, accepted at 06:30:38 Eastern (10:30:38 UTC), reads
`2026-07-14T14:30:38.000Z` in its file: after the open instead of before it.

**The same filing reads differently in two files.** A Form 4 sits in both the company's file and
the insider's own. Apple's director Form 4s of 2026-02-26 are a clean example:

| Accession | Apple's file | Director's file | Index page (Eastern) |
|---|---|---|---|
| 0001059235-26-000004 | 2026-02-27T04:34:19Z | 2026-02-26T23:34:19Z | 2026-02-26 18:34:19 |
| 0001216519-26-000004 | 2026-02-27T04:33:49Z | 2026-02-26T23:33:49Z | 2026-02-26 18:33:49 |

The directors' files are right. Apple's file is 5 hours late, because February is standard time.

**The split follows each file's newest filing.** Every file whose newest filing was accepted on or
before 2026-10-02 18:13:44 Eastern was right. Every file whose newest filing was accepted on or
after 2026-10-05 19:17:25 Eastern was late, including its filings from February. My reading is
that files rebuilt since early October are written with the extra offset. The API sends no
Last-Modified header, so I cannot see rebuild times, and that remains a hypothesis rather than a
finding.

I was not the first to notice. An edgartools issue
([dgunning/edgartools#1501](https://github.com/dgunning/edgartools/issues/1501)) reported Apple
four hours late and, a day earlier, some files that gave Eastern time labelled as UTC. I added
these measurements there.

## How to correct it

Read the time from the index page or the SGML header whenever it matters. That costs one request
per filing.

Because a file is uniform, one request per file is enough. Measure the file's error on one filing,
then correct every other time in it:

```python
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

ET = ZoneInfo("America/New_York")

def file_shift(api_iso, accepted_et):
    """A submissions file's error in Eastern offsets (-1, 0 or 1), from one filing's index-page time."""
    api = datetime.fromisoformat(api_iso.replace("Z", "+00:00"))
    true = datetime.strptime(accepted_et, "%Y-%m-%d %H:%M:%S").replace(tzinfo=ET)
    k = (api - true) / -true.utcoffset()  # the offset is 4 h (EDT) or 5 h (EST)
    if k not in (-1, 0, 1):
        raise ValueError(f"unexpected shift {k}")
    return int(k)

def corrected(api_iso, k):
    """The true acceptance time of any filing in a file whose shift is k."""
    api = datetime.fromisoformat(api_iso.replace("Z", "+00:00"))
    if k == 0:
        return api
    for h in (4, 5):
        t = api - k * timedelta(hours=h)
        if -t.astimezone(ET).utcoffset() == timedelta(hours=h):
            return t
```

Calibrate on two filings from different seasons, and read every filing from its own index page if
the two disagree. Recalibrate whenever the file is downloaded again, because a rebuild can change
it.

## Where it bit us

In [canli-mcp](/mcp-servers), the new `earnings_calendar` tool already read times from the index
pages. The released `event_study` did not: it used `acceptanceDateTime` to decide whether a filing
came before or after the 16:00 close.

With the files as they are today the damage is small, because only afternoon filings move to the
next day. Since 2025 that is 1 of 31 JPMorgan 8-Ks, none of 21 NVIDIA 8-Ks and none of 55 NVIDIA
insider sales. A file that gives Eastern time labelled as UTC would be worse: every results release
after the close would land on its own day. `event_study` now calibrates each file this way, with
two extra requests, and says in its result which it did. Both changes ship in the next release.
