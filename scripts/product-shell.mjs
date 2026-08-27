const PRIMARY_LINKS = Object.freeze([
  { key: "live", label: "Live", href: "https://app.canlicapital.com/dashboard", external: true },
  { key: "research", label: "Research", href: "/research" },
  { key: "trials", label: "Trials", href: "/trials" },
  { key: "systems", label: "Systems", href: "/systems" },
  { key: "methodology", label: "Methodology", href: "/methodology" },
  { key: "verify", label: "Verify", href: "/verify" },
]);

//: The open-source surface. Deliberately NOT a seventh PRIMARY_LINKS entry: the
//: navigation's job is to name the few things a visitor chooses between, and "read the
//: code" is an action taken from anywhere, like Verify. It renders as its own control
//: next to the CTA so it is prominent without adding a category to learn.
const SOURCE_LINK = Object.freeze({
  key: "engineering",
  label: "Source",
  href: "/engineering",
  title: "Open-source engineering: the engine, the data layer and the backtester",
});

const SOURCE_REPOS = Object.freeze([
  { label: "Engineering hub", href: "/engineering" },
  { label: "Engineering notes", href: "/notes" },
  { label: "alphac (engine)", href: "https://github.com/arhancanli/alphac", external: true },
  { label: "canli-pit-lake", href: "https://github.com/arhancanli/canli-pit-lake", external: true },
  { label: "canli-backtest", href: "https://github.com/arhancanli/canli-backtest", external: true },
]);

const SECONDARY_LINKS = Object.freeze([
  { key: "progress", label: "Corrections", href: "/progress" },
  { key: "performance", label: "Status", href: "/performance" },
  { key: "founder", label: "Founder", href: "/founder" },
  { key: "open", label: "Open data", href: "/open" },
  { key: "measurements", label: "Measurements", href: "/measurements" },
]);

const GITHUB_MARK =
  '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" focusable="false">' +
  '<path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 ' +
  '0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 ' +
  '1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 ' +
  '0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 ' +
  '2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 ' +
  '1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>';

function renderSourceLink(active) {
  const current = SOURCE_LINK.key === active ? ' aria-current="page" data-current="true"' : "";
  return `<a class="cc-shell__source" href="${SOURCE_LINK.href}" title="${SOURCE_LINK.title}"${current}>${GITHUB_MARK}<span>${SOURCE_LINK.label}</span></a>`;
}

function activeAttributes(link, active) {
  return link.key === active ? ' aria-current="page" data-current="true"' : "";
}

function renderLinks(links, active, className) {
  return links
    .map((link) => {
      const external = link.external ? ' rel="noreferrer"' : "";
      return `<a class="${className}" href="${link.href}"${external}${activeAttributes(link, active)}>${link.label}</a>`;
    })
    .join("\n");
}

export function renderProductShellStylesheet() {
  return '<link rel="stylesheet" href="/css/product-shell.css" />';
}

export function renderProductShellHeader({ active = "", dynamicStatus = false } = {}) {
  const statusId = dynamicStatus ? ' id="header-broker-status"' : "";
  const statusClass = dynamicStatus ? "cc-shell__status header-status" : "cc-shell__status";
  const statusText = dynamicStatus ? "Broker record loading…" : "Public paper record";
  return `<header class="cc-shell" id="nav" data-product-shell="v3">
  <a class="cc-shell__brand" href="/" aria-label="Canli Capital, home">
    <span class="cc-shell__mark" aria-hidden="true"><i></i></span>
    <span>Canli Capital</span>
  </a>
  <a class="${statusClass}" href="/measurements/alpaca-broker-reconciliation" aria-label="Current record status">
    <span class="status-dot" aria-hidden="true"></span>
    <span${statusId}>${statusText}</span>
  </a>
  <nav class="cc-shell__primary" aria-label="Primary navigation">
${renderLinks(PRIMARY_LINKS, active, "cc-shell__link")}
  </nav>
  <details class="cc-shell__index">
    <summary><span class="cc-shell__index-wide">More</span><span class="cc-shell__index-compact">Menu</span></summary>
    <div class="cc-shell__panel">
      <div>
        <span class="cc-shell__panel-label">Core</span>
        <nav aria-label="Core routes">${renderLinks(PRIMARY_LINKS, active, "cc-shell__panel-link")}</nav>
      </div>
      <div>
        <span class="cc-shell__panel-label">Institution</span>
        <nav aria-label="Institution routes">${renderLinks(SECONDARY_LINKS, active, "cc-shell__panel-link")}</nav>
      </div>
      <div>
        <span class="cc-shell__panel-label">Open source</span>
        <nav aria-label="Source code">${SOURCE_REPOS.map((r) => `<a class="cc-shell__panel-link" href="${r.href}"${r.external ? ' rel="noreferrer"' : ""}>${r.label}</a>`).join("\n")}</nav>
      </div>
      <p>Observed, simulated, model-estimated and planned claims remain visibly separate.</p>
    </div>
  </details>
  ${renderSourceLink(active)}
  <a class="cc-shell__cta" href="https://app.canlicapital.com/dashboard">Enter live record <span aria-hidden="true">↗</span></a>
</header>`;
}

export function renderProductShellFooter() {
  return `<footer class="cc-footer" id="footer" data-product-shell="v3">
  <div class="cc-footer__lead">
    <a class="cc-footer__brand" href="/">Canli Capital</a>
    <p>Build the claim. Publish the evidence. Keep the failures.</p>
  </div>
  <div class="cc-footer__routes">
    <nav aria-label="Portfolio and research">
      <span>Research system</span>
      <a href="https://app.canlicapital.com/dashboard">Live record</a>
      <a href="/systems">ALPHAC systems</a>
      <a href="/research">Research papers</a>
      <a href="/trials">Trial union</a>
    </nav>
    <nav aria-label="Evidence and verification">
      <span>Evidence</span>
      <a href="/methodology">Methodology</a>
      <a href="/verify">Verify record</a>
      <a href="/measurements">Measurements</a>
      <a href="/open">Open data</a>
    </nav>
    <nav aria-label="Institution and authorship">
      <span>Institution</span>
      <a href="/progress">Corrections</a>
      <a href="/performance">Status</a>
      <a href="/founder">Arhan Canli</a>
    </nav>
    <nav aria-label="Open source">
      <span>Source code</span>
      <a href="/engineering">Engineering</a>
      <a href="/notes">Engineering notes</a>
      <a href="https://github.com/arhancanli/alphac" rel="noreferrer">alphac engine</a>
      <a href="https://github.com/arhancanli/canli-pit-lake" rel="noreferrer">canli-pit-lake</a>
      <a href="https://github.com/arhancanli/canli-backtest" rel="noreferrer">canli-backtest</a>
    </nav>
  </div>
  <div class="cc-footer__boundary">
    <p>Research and paper execution only. No managed capital, copy trading, investment advice or promised return.</p>
    <p>Founded and built by Arhan Canli in Dubai.</p>
    <span>Copyright Arhan Canli</span>
  </div>
</footer>`;
}

export const PRODUCT_SHELL_PRIMARY_LINKS = PRIMARY_LINKS;
export const PRODUCT_SHELL_SOURCE_LINK = SOURCE_LINK;
export const PRODUCT_SHELL_SOURCE_REPOS = SOURCE_REPOS;
export const PRODUCT_SHELL_SECONDARY_LINKS = SECONDARY_LINKS;
