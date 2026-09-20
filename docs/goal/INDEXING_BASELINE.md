# Search indexing baseline and follow-up

The owner's Search Console coverage export dated2026-09-20 reports262indexed
and40notindexed pages, with latest chart data2026-09-14. Scope is All known pages,
not the submitted sitemap alone. Of40exclusions,32are noindex,3redirects,
3discovered-notindexed and2crawled-notindexed. The workbook contains no URL examples.

Raw workbook bytes and hash are retained through
`artifacts/seo/search-console-indexing-baseline-20260920.json`. This is the first
observed aggregate Google indexing baseline. It does not establish indexing of
local company pages or identify the exact indexed canonical set.

## Live technical checks

Read-only HTTP observation confirms263live sitemap URLs. The initial pass checked
all263with no HTML technical failures or blocking indexing directives. Its raw
source HEAD pass launched111requests together and26failed. An inherited audit bug
misclassified these unknown responses as missing noindex. That initial report is
preserved as `live-indexing-followup-20260920-initial-fetch-errors.json`; its
RAW_EVIDENCE_TARGETS_INDEXABLE finding is invalid and superseded.

The audit now separates unavailable/non-successful responses from actual successful
responses lacking noindex, recognizes the none directive and batches HEAD requests
at12concurrent. Three tests pass, including failure-versus-indexability regression;
they are included in the regular verify command.

The corrected full pass is `live-indexing-followup-20260920.json`:263attempted,
one homepage timeout, five failed raw HEAD requests, no successful raw response
missing noindex and no observed blocking sitemap-page directives. These network
failures remain explicit. Targeted GET rechecks are retained separately; do not
rewrite the original failures or equate a fetch failure with a noindex defect.

## Next diagnostic evidence

The five Google discovered/crawled exclusions need their per-URL report exports.
Owner authorized laptop access; Chrome scripting can read tab URLs and open an
export, but JavaScript from Apple Events is disabled, screenshot capture is
unavailable and macOS denied osascript assistive access. These settings were not
changed. Requested the two category exports as open Google Sheets through the
asynchronous question. No authenticated tokens/cookies were extracted.

Do not remove intentional noindex or canonical/redirect rules just to reduce the
excluded count. Successful HTTP and metadata checks do not explain Google's
indexing choices, prove content quality or guarantee later indexing.

Targeted recheck completed: all six URLs return200. Homepage is self-canonical,
index/follow with one H1; all five raw sources return X-Robots-Tag:noindex.
`live-indexing-targeted-recheck-20260920.json` records their hashes and observation
time. No persistent technical blocker confirmed by these checks; Google URL-level
exclusion reasons remain unresolved until the specific examples are available.
