import { historySummary, compactAmount } from './company-history-summary.mjs';
import { DESCRIPTION_MAX, fitDescription } from './descriptions.mjs';

// The words a company overview is searched by, and what its snippet says first.
//
// Search Console (2026-10-06, 28 days): company overviews were seen 102K times and clicked 0.2% of
// the time at an average position of 5.4. People search "<company> revenue", "<company> sec
// filings", "<company> share based compensation"; the overview title said "<COMPANY> (TICKER):
// filing data" and its snippet described the page instead of answering. The title now names the
// headline measures the company actually reports, and the snippet leads with their latest values.
//
// A measure is named only when the company's record holds it, and every figure in the snippet is
// the latest value of that record, with its period, computed by historySummary.
const HEADLINES = Object.freeze([
  { tags: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax'], word: 'Revenue' },
  { tags: ['NetIncomeLoss'], word: 'Net Income' },
  { tags: ['Assets'], word: 'Total Assets' },
  { tags: ['NetCashProvidedByUsedInOperatingActivities'], word: 'Operating Cash Flow' },
]);
const TITLE_MEASURES = 2;

const DAY = 86_400_000;
const STALE_DAYS = 730;

// Up to `limit` headline measures the record holds, each with its summary, in HEADLINES order.
// Where a company reports a measure under more than one tag (Apple's "Revenues" ends in 2018, when
// it moved to the ASC 606 contract-revenue tag), the tag with the latest period wins. A measure
// whose latest period ends more than two years before capture is skipped: a snippet must not
// present a 2010 value as the company's revenue. includeStale keeps those, for a company with no
// current headline at all, whose snippet then says "last reported" with the period.
export function overviewHeadlines(concepts, fetchedAt, limit = TITLE_MEASURES, { includeStale = false } = {}) {
  const capture = Date.parse(fetchedAt);
  const out = [];
  for (const { tags, word } of HEADLINES) {
    const best = tags
      .map(tag => concepts.find(item => item.tag === tag))
      .filter(Boolean)
      .map(concept => ({ concept, summary: historySummary(concept), word }))
      .filter(item => item.summary)
      .sort((a, b) => b.summary.latest.end.localeCompare(a.summary.latest.end))[0];
    if (best && (includeStale || capture - Date.parse(`${best.summary.latest.end}T00:00:00Z`) <= STALE_DAYS * DAY)) out.push(best);
    if (out.length === limit) break;
  }
  return out;
}

// The current headlines, or, when the company has none (it stopped filing years before capture),
// its last reported ones, flagged so the snippet dates them.
function headlinesFor(concepts, fetchedAt) {
  const current = overviewHeadlines(concepts, fetchedAt);
  if (current.length) return { headlines: current, historical: false };
  return { headlines: overviewHeadlines(concepts, fetchedAt, TITLE_MEASURES, { includeStale: true }), historical: true };
}

export function overviewTitle(label, concepts, fetchedAt) {
  const words = headlinesFor(concepts, fetchedAt).headlines.map(item => item.word);
  return words.length ? `${label}: ${words.join(', ')} & SEC Financials` : `${label}: SEC financial data`;
}

const period = (kind, end) => (kind === 'duration' ? `for the year ending ${end}` : `at ${end}`);

// Only the latest value and its period: both trace to the record the page declares as its source
// (the site's numbers audit refuses a computed change on the overview, which states no prior value).
// A second measure for the same period omits the repeated date.
function headlineSentence({ concept, summary, word }, subject, samePeriod = false, historical = false) {
  const { latest, unit } = summary;
  const when = samePeriod ? '' : ` ${period(concept.kind, latest.end)}`;
  if (historical && subject) return `${subject}last reported ${word.toLowerCase()} of ${compactAmount(latest.val, unit)}${when}.`;
  const name = subject ? `${subject}${word.toLowerCase()}` : word.charAt(0) + word.slice(1).toLowerCase();
  return `${name}: ${compactAmount(latest.val, unit)}${when}.`;
}

// label: the short company name. measures: how many histories the overview lists.
// Whole sentences only, added while they fit DESCRIPTION_MAX: a clipped snippet reads worse than a
// slightly short one.
export function overviewDescription(label, concepts, measures, fetchedAt) {
  const { headlines: [first, second], historical } = headlinesFor(concepts, fetchedAt);
  const facts = `${measures} measures from SEC filings, each linked to its filing.`;
  if (!first) return fitDescription(`Explore ${label} financial histories from SEC filings, with original units, reporting periods, filing dates and downloadable source data.`, [facts]);
  const same = second && second.summary.latest.end === first.summary.latest.end && second.concept.kind === first.concept.kind;
  const sentences = [headlineSentence(first, `${label} `, false, historical), second ? headlineSentence(second, '', same) : null, facts, 'Free JSON.'].filter(Boolean);
  let out = sentences[0];
  for (const sentence of sentences.slice(1)) if (`${out} ${sentence}`.length <= DESCRIPTION_MAX) out = `${out} ${sentence}`;
  return out;
}
