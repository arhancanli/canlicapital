// One rule for every meta description on the site: 150 to 160 characters where the page has enough
// to say, never padded with filler. Bing Webmaster Tools flagged many pages as "too short" (it
// recommends 150 to 160); search results cut around 160. A short lead is extended with the page's
// own next sentences, never with generic text; a long lead is cut at a sentence end, and only when
// no sentence end fits, at a word, with an ellipsis.
export const DESCRIPTION_MIN = 150;
export const DESCRIPTION_MAX = 160;

const clean = (text) => String(text ?? "").replace(/\s+/g, " ").trim();

// Sentence ends: ".", "!" or "?" followed by whitespace or the end. A period followed by a digit or a
// letter is a decimal point or an abbreviation inside a token ("0.59", "e.g"), not an end.
export function sentences(text) {
  const out = [];
  const s = clean(text);
  let start = 0;
  for (let i = 0; i < s.length; i += 1) {
    if (!".!?".includes(s[i])) continue;
    const next = s[i + 1];
    if (next !== undefined && !/\s/.test(next)) continue;
    out.push(s.slice(start, i + 1).trim());
    start = i + 1;
  }
  const rest = s.slice(start).trim();
  if (rest) out.push(rest);
  return out.filter(Boolean);
}

// The longest prefix of text that ends a sentence within max characters, or "".
function sentencePrefix(text, max) {
  let end = -1;
  for (let i = 0; i < Math.min(text.length, max); i += 1) {
    if (!".!?".includes(text[i])) continue;
    const next = text[i + 1];
    if (next !== undefined && !/\s/.test(next)) continue;
    end = i + 1;
  }
  return end > 0 ? text.slice(0, end).trim() : "";
}

function clipAtWord(text, max) {
  const clipped = text.slice(0, max - 1);
  const words = clipped.slice(0, clipped.lastIndexOf(" ")).trimEnd();
  return /[.!?]$/.test(words) ? words : `${words.replace(/[,;:]$/, "")}…`;
}

// lead: the page's own summary sentence(s). more: further text from the same page, used in order
// when the lead is shorter than DESCRIPTION_MIN.
export function fitDescription(lead, more = []) {
  const text = clean(lead);
  // Whole sentences of the lead first.
  let out = text.length > DESCRIPTION_MAX ? sentencePrefix(text, DESCRIPTION_MAX) : text;
  // Then whole sentences of the page's further text, while they fit.
  for (const sentence of sentences([].concat(more).join(" "))) {
    if (out.length >= DESCRIPTION_MIN) break;
    const candidate = out ? `${out} ${sentence}` : sentence;
    if (candidate.length <= DESCRIPTION_MAX) out = candidate;
  }
  // Still short of the window: as much of the lead (or, failing that, of lead plus further text) as fits,
  // cut at a word.
  if (out.length < DESCRIPTION_MIN) {
    const source = text.length > out.length ? text : clean(`${text} ${[].concat(more).join(" ")}`);
    if (source.length > out.length) out = source.length <= DESCRIPTION_MAX ? source : clipAtWord(source, DESCRIPTION_MAX);
  }
  return out;
}
