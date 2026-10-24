# "Silver price" returned US CPI

> A tool that turns plain words into a data series picked any series sharing half the words of the
> request. One generic word was enough, so "silver price" came back as consumer prices, with real
> numbers and no error.

**Published 2026-10-11. The before-and-after results are read from
[`series-lookup-2026-10-11.json`](/glassbox/series-lookup-2026-10-11.json), produced by running
both versions of the lookup on the same requests.**

## The bug

Agents rarely pass the exact identifier a data source wants. They pass words: "10 year treasury
yield", "core inflation", "silver price". So most tools that wrap a data source carry a small
resolver from words to an identifier.

In canli-markets-mcp 0.1.0, `economic_series` took a FRED series ID or plain words. The plain-word
path scored each of its 47 common series by the share of the request's words found in the series
description, and took the best one if at least half matched:

```js
const words = s.toLowerCase().match(/[a-z0-9&]+/g) ?? [];
const scored = COMMON_SERIES
  .map(([id, text]) => [id, words.filter((w) => text.split(" ").includes(w)).length / words.length])
  .sort((a, b) => b[1] - a[1]);
if (!scored.length || scored[0][1] < 0.5) throw new NotFound(/* ... */);
return { id: scored[0][0] };
```

A request of two words needs only one shared word to reach half. The consumer price index is
described as "cpi consumer price index inflation all items", so "price" alone was enough:

| Request | 0.1.0 returned | Now |
|---|---|---|
| silver price | CPIAUCSL (US consumer prices) | refused, pointing to `price_history` |
| copper price | CPIAUCSL | refused |
| bitcoin price | CPIAUCSL | refused |
| japan inflation | CPIAUCSL | refused, pointing to `world_economy` |
| uk unemployment rate | UNRATE (US unemployment) | refused |
| wage growth | A191RL1Q225SBEA (real GDP growth) | CES0500000003 (average hourly earnings) |
| house prices | refused | CSUSHPINSA (Case-Shiller home prices) |
| inflation | CPIAUCSL | CPIAUCSL |
| 10 year treasury yield | DGS10 | DGS10 |

Every wrong answer came back as a real series with real numbers. The result did carry the series
title, so the mistake was there for anyone who read it. Nothing made an agent read it.

The words that decide each question ("silver", "japan", "uk") are the ones that matched nothing.
The words that did match ("price", "inflation", "rate") say what kind of number is wanted, not
which one.

## The rule that replaced it

One function now serves three resolvers: FRED series, World Bank indicators and OECD outlook
measures. Each word of a request falls into one of three groups:

- **Filler** is ignored: "what is", "show me", "since", "this year", and four-digit years.
- **Kind words** say what sort of number: rate, growth, index, level, daily, monthly. They count
  toward the best match but are never required.
- **Specific words** are everything else, and every one of them must appear in the entry.

```js
export function matchWords(entries, textOf, request, vocab) {
  const asked = split(request).filter((w) => !vocab.filler.has(w) && !/^(1[89]|20)\d\d$/.test(w) && !/^[a-z]$/.test(w));
  const specific = asked.filter((w) => !vocab.kind.has(w));
  if (!specific.length) return null;
  let best = null, most = 0;
  for (const entry of entries) {
    const has = new Set(split(textOf(entry)));
    if (!specific.every((w) => has.has(w))) continue;
    const shared = asked.filter((w) => has.has(w)).length;
    if (shared > most) { best = entry; most = shared; }
  }
  return best;
}
```

When nothing qualifies, the tool says so and says where to look: another country's economy is in
`world_economy` or `economic_outlook`, and the price of a commodity, currency, crypto or stock is in
`price_history`. An agent that gets that refusal can call the right tool next. An agent that got
consumer prices had nothing telling it to.

## Test the refusals first

The old tests checked that good requests found their series, and they all passed. None asked
whether a request for something the tool does not have gets refused. The test file now opens with
9 requests that must be refused, then 42 plain requests that must each resolve to one exact series.
The list of common series grew to 73 at the same time.

A resolver from words to identifiers is a search engine that returns one result. It needs a way
to return none, and the tests that prove it can are the ones to write first. The code is in
`mcp-markets/src/words.mjs` in the
[canlicapital repository](https://github.com/arhancanli/canlicapital), and the tool is part of
[canli-mcp](/mcp-servers).
