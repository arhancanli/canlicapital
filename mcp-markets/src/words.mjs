// Plain words to the entry they name: a FRED series, a World Bank indicator, an OECD measure.
// Every specific word of the request must be among the entry's words, so "silver price" is not
// CPI, "wage growth" is not GDP growth and "japan inflation" is not US inflation. Words that say
// only what kind of number ("rate", "growth", "daily") are not required but count toward the best
// match; filler ("this year", "since 2020", "show me") is ignored. Of the entries that qualify,
// the one sharing the most words with the request wins; ties go to the list's order. Plurals match.
export const one = (w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
const split = (s) => (String(s).toLowerCase().match(/[a-z0-9&]+/g) ?? []).map(one);
const KIND = "rate level index growth change trend value number figure data series history historical chart graph daily weekly monthly quarterly annual yearly";
const FILLER = "what is are was how much many show me get give find tell about the a an of for in on at to by from with and or vs versus "
  + "over since past last this that year month week day ago per percent pct yoy current latest recent today now";

// A caller adds its own kind words and filler (the FRED series are all US, so "us" is filler there).
export const vocabulary = ({ kind = "", filler = "" } = {}) => ({ kind: new Set(split(`${KIND} ${kind}`)), filler: new Set(split(`${FILLER} ${filler}`)) });

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
