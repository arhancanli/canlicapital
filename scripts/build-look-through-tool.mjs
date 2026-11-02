// Build /tools/look-through: a portfolio opened through its funds. The page holds no figures of its own.
// Every number on it comes from portfolio_xray on the public server, read from each fund's own SEC report
// when someone asks, so there is nothing here to go stale.
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { jsonLd as breadcrumbLd } from "./lib/breadcrumbs.mjs";
import { renderProductShellFooter, renderProductShellHeader, renderProductShellStylesheet } from "./product-shell.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://canlicapital.com";
const ROUTE = "/tools/look-through";
const TITLE = "See what you really own: portfolio look-through";
const DESCRIPTION = "List your funds and shares. We open each fund's latest SEC report and add up every company inside, so you can see what you really own. Free, with no account.";

const EXAMPLES = [
  ["An S&P 500 fund and a tech fund", "VOO 70,QQQ 30"],
  ["A simple three-fund mix", "VTI 60,VXUS 30,BND 10"],
  ["A fund and a stock you like", "VOO 80,NVDA 20"],
];

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: TITLE,
  description: DESCRIPTION,
  url: `${ORIGIN}${ROUTE}`,
  applicationCategory: "FinanceApplication",
  operatingSystem: "Any",
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  publisher: { "@id": `${ORIGIN}/#organization` },
};

const html = `<!doctype html>
<html lang="en" data-page="look-through">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${TITLE} | Canli Capital</title>
<meta name="description" content="${DESCRIPTION}" />
<link rel="canonical" href="${ORIGIN}${ROUTE}" />
<meta name="author" content="Arhan Canli" />
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Canli Capital" />
<meta property="og:title" content="${TITLE}" />
<meta property="og:description" content="${DESCRIPTION}" />
<meta property="og:url" content="${ORIGIN}${ROUTE}" />
<meta property="og:image" content="${ORIGIN}/og.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${TITLE}" />
<meta name="twitter:description" content="${DESCRIPTION}" />
<meta name="twitter:image" content="${ORIGIN}/og.png" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
${renderProductShellStylesheet()}
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
${breadcrumbLd([["Canli Capital", "/"], ["See what you really own", ROUTE]])}
</head>
<body class="check-home look-through">
${renderProductShellHeader({ active: "" })}
<main id="main" tabindex="-1">
  <section class="lt-hero" aria-labelledby="lt-title">
    <h1 id="lt-title">What do you really own?</h1>
    <p>List your funds and shares. We open each fund's latest report to the SEC and add up every company inside. Free, with no account.</p>
    <form class="lt-form" id="look-form" novalidate>
      <label for="look-text">Your holdings, one on each line, with a percentage or an amount</label>
      <textarea id="look-text" name="holdings" rows="4" maxlength="2000" placeholder="VOO 60&#10;QQQ 30&#10;NVDA 10" spellcheck="false" autocapitalize="characters"></textarea>
      <button type="submit">Look inside</button>
      <p class="lt-status" id="look-status" role="status" aria-live="polite"></p>
    </form>
    <div class="lt-try"><span>Try one:</span>${EXAMPLES.map(([label, value]) => `<button type="button" data-try="${value}">${label.replaceAll("&", "&amp;")}</button>`).join("")}</div>
  </section>
  <section class="lt-result" id="look-result" aria-live="polite" hidden></section>
  <section class="lt-about" aria-labelledby="lt-about-title">
    <h2 id="lt-about-title">Why look inside</h2>
    <p>Funds overlap. Own an S&amp;P 500 fund, a technology fund and a few shares you like, and you may hold the same few companies three times over without seeing it. This adds them up, so you can see where your money really sits.</p>
    <p>It reads what each fund reported, which is a little old by the time it is public. Your holdings stay in your browser and are sent only to look up the funds. It shows what you hold, not what you should buy or sell. <a href="/learn/whats-inside-an-index-fund">Read the short lesson on what is inside an index fund</a>.</p>
  </section>
</main>
${renderProductShellFooter()}
<script type="module" src="/js/look-through.js"></script>
</body>
</html>
`;

writeFileSync(resolve(ROOT, "tools/look-through.html"), html);
console.log(`  ${ROUTE} built`);
