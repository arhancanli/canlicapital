// =============================================================================
// CANLI CAPITAL / shell.js
// -----------------------------------------------------------------------------
// The shared cross-page chrome: the sticky top nav and the footer. This is the
// ONE nav and the ONE footer for the whole property. Every page (the landing and
// the three sub-pages) imports this module through main.js so the navigation is
// byte-identical and a change here propagates to all four pages by construction.
//
// What it owns:
//   - Rendering the top-nav links and the footer link grid from config/brand.js
//     (NAV, FOOTER_COLS), so the link model lives in one place.
//   - Resolving each internal link's target per page: on the landing the links
//     smooth-scroll to the matching teaser section (the in-page anchor); on a
//     sub-page they point to the canonical clean URL. This is what makes the four
//     pages read as one numbered document.
//   - The current-page state: the active nav link gets aria-current="page" and
//     the resting-lit `is-current` class (paper text + shown signal underline),
//     per docs/DESIGN_SYSTEM.md section 6.3.
//
// What it does NOT own: the nav scroll behavior (hide/show, hairline) and the
// magnetic wiring stays in main.js exactly as before. This
// module only builds and marks the markup; it never re-skins the cursor, the
// tokens, or the motion. Brand-name binding (data-brand / data-flagship) is left
// to main.js's bindBrand(), which runs after this so every injected name resolves.
// =============================================================================

import { NAV, FOOTER_COLS } from "../config/brand.js";

// The page identity. Read once from <html data-page="..."> (the landing omits it
// and is treated as "home"). Used to choose anchor-vs-URL targets and to mark the
// active nav link. Kept here so every consumer reads the same source of truth.
export function getPageId() {
  return document.documentElement.getAttribute("data-page") || "home";
}

const isHome = () => getPageId() === "home";

// Resolve an internal link to the right target for the current page. On the
// landing we keep the smooth-scroll-to-teaser behavior (the anchor); on a
// sub-page we link to the clean URL. A link with only an href (e.g. "/#waitlist")
// is used verbatim; a link with only an anchor stays an in-page anchor.
function resolveHref(link) {
  if (isHome() && link.anchor) return link.anchor;
  if (link.href) return link.href;
  return link.anchor || "#";
}

// ---------------------------------------------------------------------------
// TOP NAV
// ---------------------------------------------------------------------------
// We render the links and CTA into the existing <nav class="nav__links"> if the
// page provides one (the landing already ships full markup; sub-page stubs ship
// an empty .nav__links the shell fills). The wordmark + CTA are part of the
// model so all four pages are identical. If the host page already authored the
// links (the current landing), we still re-point and re-mark them so the active
// state and clean URLs are correct without duplicating nodes.
// ---------------------------------------------------------------------------
function buildNav() {
  const nav = document.getElementById("nav");
  if (!nav) return;
  if (nav.dataset.productShell === "v3") return;

  const inner = nav.querySelector(".nav__inner");
  if (!inner) return;

  // Brand (home). The wordmark always links to "/" from a sub-page and to the
  // hero anchor on the landing, so a click is "go home" everywhere.
  let brand = inner.querySelector(".nav__brand");
  if (!brand) {
    brand = document.createElement("a");
    brand.className = "nav__brand label";
    brand.setAttribute("data-brand", "");
    inner.prepend(brand);
  }
  brand.setAttribute("href", isHome() ? "#hero" : "/");
  brand.setAttribute("aria-label", "Canli Capital, home");

  // The links container.
  let links = inner.querySelector(".nav__links");
  if (!links) {
    links = document.createElement("nav");
    links.className = "nav__links";
    links.setAttribute("aria-label", "Primary");
    inner.appendChild(links);
  }
  links.setAttribute("aria-label", "Primary");

  const page = getPageId();
  const markup = [];

  NAV.forEach((item) => {
    // The TOP MENU always NAVIGATES to the dedicated sub-page (clean URL), from
    // every page including the landing. Pressing "Systems" opens /systems, it
    // does not scroll to a teaser on the landing. The landing teasers keep their
    // own in-section "explore" links; the top bar is true page navigation.
    const href = item.href || item.anchor || "#";
    const current = item.page === page;
    const cls = `nav__link label${current ? " is-current" : ""}`;
    const aria = current ? ' aria-current="page"' : "";
    markup.push(`<a href="${href}" class="${cls}"${aria}>${item.label}</a>`);
  });

  // The waitlist CTA: always the access control. On the landing it scrolls to the
  // form; on a sub-page it links to "/#waitlist". The signal accent earns its one
  // moment here (center-out underline, already styled).
  const ctaHref = "https://app.canlicapital.com/dashboard";
  markup.push(
    `<a href="${ctaHref}" class="nav__cta label" data-magnetic>Open live record <span aria-hidden="true">↗</span></a>`
  );

  links.innerHTML = markup.join("");
}

// ---------------------------------------------------------------------------
// FOOTER
// ---------------------------------------------------------------------------
// The footer is the shared partial and the cross-page nav. If the host page
// already provides the full footer markup (the landing), we only re-point its
// link grid to the resolved targets so the cross-page links are correct. If the
// page ships an empty <footer> shell (sub-page stubs), we build the whole thing.
// The status line, legal block, and watermark are identical on every page.
// ---------------------------------------------------------------------------
function buildFooter() {
  const footer = document.getElementById("footer");
  if (!footer) return;
  if (footer.dataset.productShell === "v3") return;

  // If the grid already exists (landing), just rebuild the columns from the model
  // so the cross-page links resolve correctly; otherwise build the full footer.
  const hasGrid = footer.querySelector(".footer__grid");

  const gridMarkup = FOOTER_COLS.map((col) => {
    const headFlag = col.flagship ? ' data-flagship=""' : "";
    const head = col.flagship
      ? `<h2 class="footer__col-head label" data-flagship>ALPHAC</h2>`
      : `<h2 class="footer__col-head label">${col.head}</h2>`;
    const links = col.links
      .map((l) => `<a href="${resolveHref(l)}" class="footer__link body">${l.label}</a>`)
      .join("");
    return `<nav class="footer__col" aria-label="${col.head}">${head}${links}</nav>`;
  }).join("");

  if (hasGrid) {
    footer.querySelector(".footer__grid").innerHTML = gridMarkup;
    return;
  }

  footer.classList.add("section--ink");
  footer.setAttribute("data-section", footer.getAttribute("data-section") || "99");
  footer.innerHTML = `
    <p class="footer__status mono-label">
      <span class="dot dot--pulse" aria-hidden="true"></span>
      <span data-brand>Canli Capital</span> / observed paper record / funded strategy record inactive
    </p>

    <div class="footer__grid">${gridMarkup}</div>

    <p class="footer__legal mono-label">
      <span data-brand>Canli Capital</span> provides quantitative trading software and
      research. Nothing on this page is investment advice, an offer, or a
      solicitation. <span data-brand>Canli Capital</span> is in simulation and live
      paper trading. No statement here describes live capital performance, and no
      return is claimed. Simulated and paper results do not indicate future
      outcomes.
    </p>

    <div class="footer__wordmark display-xl" aria-hidden="true" data-brand>Canli Capital</div>

    <p class="footer__tagline label" data-tagline>A quant fund proving itself in public before it asks you to trust it.</p>

    <p class="footer__colophon mono-label">
      &copy; 2026 <span data-brand>Canli Capital</span>. Built in Dubai. Type set in
      Space Grotesk and JetBrains Mono.
    </p>
  `;
}

// ---------------------------------------------------------------------------
// PUBLIC: build the shared chrome. Called by main.js BEFORE bindBrand() so the
// injected data-brand / data-flagship nodes are resolved by the brand binding,
// and BEFORE initScroll() so the nav/footer anchor links are wired by the shared
// smooth-scroll handler. Safe to call once per page.
// ---------------------------------------------------------------------------
export function buildShell() {
  buildNav();
  buildFooter();
}
