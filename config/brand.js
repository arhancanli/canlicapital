// =============================================================================
// CANLI CAPITAL / brand configuration
// -----------------------------------------------------------------------------
// Single source of truth for the two names. The owner may rename either; every
// visible instance in the page is rendered from these constants by main.js.
// Search the codebase for `data-brand` and `data-flagship` to see the bindings.
// =============================================================================

export const BRAND = "Canli Capital"; // the platform / company
export const FLAGSHIP = "ALPHAC"; // the flagship four-sleeve combined book
// The footer line states a fact, it does not sloganize. This is the firm's true
// one-line description (the same line that lives in the JSON-LD `slogan` field on
// every page), reused here so the footer never carries a marketing slogan. Bound
// to every [data-tagline] node by main.js; never hardcode it in markup.
export const TAGLINE = "A quant fund proving itself in public before it asks you to trust it.";

// Where the access form posts. Configure for production. When left null the
// form simulates a successful submission locally (no network call).
export const WAITLIST_ENDPOINT = null;

// -----------------------------------------------------------------------------
// Approved, verified stats. The ONLY numeric claims permitted on the page.
// Each was confirmed against the engine. Do not add a stat without verifying it.
// `strike` renders a hairline strike-through emphasis on the value (used for 0).
// -----------------------------------------------------------------------------
export const STATS = [
  { value: 24, suffix: "M+", decimals: 0, label: "Daily bars, equity lake (1997 to 2026)" },
  { value: 8436, suffix: "", decimals: 0, label: "US stocks, survivorship-free", group: true },
  { value: 50, suffix: "", decimals: 0, label: "Factors registered" },
  { value: 2820, suffix: "+", decimals: 0, label: "Automated tests, green", group: true },
];

// Facts woven into prose elsewhere (step data lines, footer status, legal copy).
// These are the SAME facts as STATS, formatted for sentences, and are the single
// source of truth: main.js writes them into every element marked `data-fact`.
// Keep these in agreement with STATS above.
//
// Note on `bars` vs `cryptoBars`: after the data investment `bars` means the
// EQUITY lake's daily bars (24M+, 1997 to 2026), the property's depth headline;
// `cryptoBars` carries the separate crypto figure (3.5M+ hourly bars) so no page
// can imply the crypto bar count equals the equity one. The two `since` keys stay
// split: `cryptoSince` (2020) for the crypto data line, `equitySince`/`equityYears`
// for the lake. `tests` is one number everywhere (the honesty review requires it),
// bound via data-fact on every page, never hardcoded.
export const FACTS = {
  bars: "24M+",                 // equity lake daily bars (1997 to 2026)
  equityStocks: "8,436",        // survivorship-free US stocks
  equityYears: "25",            // 1997 to 2026
  equitySince: "1997",
  fundamentals: "392K+",        // point-in-time fundamental rows
  cryptoBars: "3.5M+",          // crypto hourly bars (separate, do not conflate)
  instruments: "94",            // crypto perps, live and delisted
  cryptoSince: "2020",          // crypto data start (6 years), distinct from equity 1997
  factors: "50",                // registered across cross-asset
  tests: "2,820+",
  phases: "12",
  costAuthority: "1",
};

// -----------------------------------------------------------------------------
// SHARED NAVIGATION + FOOTER MODEL
// -----------------------------------------------------------------------------
// The cross-page nav and footer are rendered from this single model by
// js/shell.js, so every page ships byte-identical chrome and a change here
// propagates everywhere. Each nav link declares BOTH its clean sub-page URL
// (`href`) and the matching landing teaser anchor (`anchor`); the shell picks
// the right target per page (anchors smooth-scroll on the landing, clean URLs
// link out from a sub-page). `page` keys the active (`is-current`) state.
export const NAV = [
  { page: "systems", label: "Systems", href: "/systems", anchor: "#systems" },
  { page: "research", label: "The research", href: "/research", anchor: "#research" },
  { page: "performance", label: "Performance", href: "/performance", anchor: "#performance" },
  { page: "progress", label: "Progress", href: "/progress", anchor: "#progress" },
  { page: "measurements", label: "Measurements", href: "/measurements", anchor: "#measurements" },
  { page: "open", label: "Proven in the open", href: "/open", anchor: "#open" },
  { page: "verify", label: "Verify us", href: "/verify", anchor: "#verify" },
];

// Footer link grid. Each column is a labelled nav region. Internal links carry an
// `anchor` (the landing teaser id) and an `href` (the clean sub-page URL); the
// shell resolves them the same way the top nav does.
export const FOOTER_COLS = [
  {
    head: "Platform",
    links: [
      { label: "Systems", href: "/systems", anchor: "#systems" },
      { label: "The research", href: "/research", anchor: "#research" },
      { label: "Performance", href: "/performance", anchor: "#performance" },
      { label: "Progress", href: "/progress", anchor: "#progress" },
      { label: "Every measurement", href: "/measurements", anchor: "#measurements" },
      { label: "Proven in the open", href: "/open", anchor: "#open" },
      { label: "How to verify us", href: "/verify", anchor: "#verify" },
      { label: "Join the waitlist", href: "/#waitlist", anchor: "#waitlist" },
    ],
  },
  {
    head: "Flagship",
    flagship: true,
    links: [
      { label: "How it works", href: "/systems", anchor: "#systems" },
      { label: "The research", href: "/research", anchor: "#research" },
      { label: "The methodology", href: "/performance", anchor: "#performance" },
      { label: "The build log", href: "/progress", anchor: "#progress" },
    ],
  },
  {
    head: "Firm",
    links: [
      { label: "Thesis", href: "/#thesis", anchor: "#thesis" },
      { label: "Building in the open", href: "/progress", anchor: "#progress" },
      { label: "The kill log", href: "/open#killlog", anchor: "#open" },
      { label: "Contact", href: "/#waitlist", anchor: "#waitlist" },
    ],
  },
];
