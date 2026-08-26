const PRIMARY_LINKS = Object.freeze([
  { key: "live", label: "Live", href: "https://app.canlicapital.com/dashboard", external: true },
  { key: "research", label: "Research", href: "/research" },
  { key: "trials", label: "Trials", href: "/trials" },
  { key: "systems", label: "Systems", href: "/systems" },
  { key: "methodology", label: "Methodology", href: "/methodology" },
  { key: "verify", label: "Verify", href: "/verify" },
]);

const SECONDARY_LINKS = Object.freeze([
  { key: "progress", label: "Corrections", href: "/progress" },
  { key: "performance", label: "Status", href: "/performance" },
  { key: "founder", label: "Founder", href: "/founder" },
  { key: "open", label: "Open data", href: "/open" },
  { key: "measurements", label: "Measurements", href: "/measurements" },
]);

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
      <p>Observed, simulated, model-estimated and planned claims remain visibly separate.</p>
    </div>
  </details>
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
      <a href="https://github.com/arhancanli" rel="noreferrer">GitHub</a>
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
export const PRODUCT_SHELL_SECONDARY_LINKS = SECONDARY_LINKS;
