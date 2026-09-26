// The short company name used in titles and link text: the SEC entity name without a trailing
// legal suffix and the comma before it. "LAKELAND INDUSTRIES, INC." -> "LAKELAND INDUSTRIES",
// "CRANE NXT, CO." -> "CRANE NXT", "Apple Inc." -> "Apple". The previous rule removed only
// CORPORATION, CORP and "Inc." and left a stray comma ("WEYCO GROUP,:") on about 38% of titles.
// A suffix right after "&" is part of the name ("JPMORGAN CHASE & CO"), so it stays.
const SUFFIX = /(?<!&[\s, ]*)[\s, ]+(?:INCORPORATED|INC\.?|CORPORATION|CORP\.?|CO\.?|LTD\.?|LIMITED|L\.?L\.?C\.?|L\.?P\.?|PLC\.?)\s*$/i;

export function companyLabel(name) {
  const original = String(name).replace(/[\s ]+$/, '');
  const short = original.replace(SUFFIX, '').replace(/[\s, ]+$/, '');
  return short.length >= 2 ? short : original.replace(/[\s, ]+$/, '');
}
