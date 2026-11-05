// The rebuilt pages (css/clear.css): one document shell, the receipt and the proof strip. A page says what
// it does for the reader in its first screen, offers one button and prints its proof as a receipt; every
// figure comes from the published files named in canli:sources, which the numbers audit traces.
import { renderProductShellFooter, renderProductShellHeader, renderProductShellStylesheet } from "../product-shell.mjs";

export const ORIGIN = "https://canlicapital.com";
export const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
// "26 October 2026", with the ISO date beside it so the numbers audit can trace the day and month.
export const longDate = (iso) => `<time datetime="${esc(iso)}">${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}</time>`;
const jsonLd = (value) => JSON.stringify(value).replace(/</g, "\\u003c");

// The trail the first screen shows; a page that passes it to clearDocument also gets the matching BreadcrumbList.
export const crumbs = (trail) => `<nav class="cl-crumbs" aria-label="Breadcrumb"><ol>${trail.map(([name, href], i) => (i < trail.length - 1 ? `<li><a href="${esc(href)}">${esc(name)}</a></li>` : `<li aria-current="page">${esc(name)}</li>`)).join("")}</ol></nav>`;
const trailSchema = (trail) => ({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: trail.map(([name, href], i) => ({ "@type": "ListItem", position: i + 1, name, item: ORIGIN + href })) });

export function clearDocument({ route, title, description, body, sources, active = "", structured = [], modified = null, page = "clear", trail = null }) {
  const webPage = { "@context": "https://schema.org", "@type": "WebPage", "@id": ORIGIN + route, url: ORIGIN + route, name: title, description, ...(modified ? { dateModified: modified } : {}), publisher: { "@id": `${ORIGIN}/#organization` } };
  return `<!doctype html>
<html lang="en" data-page="${esc(page)}"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)} | Canli Capital</title>
<meta name="description" content="${esc(description)}" />
<meta name="author" content="Arhan Canli" />
<meta name="canli:sources" content="${esc(sources)}" />
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
<link rel="canonical" href="${ORIGIN}${route}" />
<meta property="og:type" content="website" /><meta property="og:site_name" content="Canli Capital" />
<meta property="og:title" content="${esc(title)}" /><meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${ORIGIN}${route}" /><meta property="og:image" content="${ORIGIN}/og.png" />
<meta name="twitter:card" content="summary_large_image" /><meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" /><meta name="twitter:image" content="${ORIGIN}/og.png" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="preload" as="font" href="/fonts/bricolage-grotesque/Variable.woff2" type="font/woff2" crossorigin />
<link rel="preload" as="font" href="/fonts/inter/InterVariable.woff2" type="font/woff2" crossorigin />
${renderProductShellStylesheet()}
<link rel="stylesheet" href="/css/clear.css" />
<script type="application/ld+json">${jsonLd([webPage, ...(trail ? [trailSchema(trail)] : []), ...structured])}</script>
</head><body class="clear">
<a class="skip-link" href="#content">Skip to content</a>
${renderProductShellHeader({ active })}
<main id="content" tabindex="-1">${body}</main>
${renderProductShellFooter()}
<script type="module" src="/js/main.js"></script>
</body></html>
`;
}

// The same question twice, printed as a till receipt: what each answer said against what was filed.
export function receipt({ head, question, rows, stamp, right, link, caption }) {
  return `<figure class="cl-receipt" aria-label="${esc(head)}">
<p class="cl-receipt__head"><span>${esc(head)}</span><span>Receipt</span></p>
<p class="cl-receipt__q">${question}</p>
<dl>${rows.map(([label, value, tone]) => `<div><dt>${esc(label)}</dt><dd${tone ? ` class="cl-was-${tone}"` : ""}>${value}</dd></div>`).join("")}</dl>
<p class="cl-stamp ${right ? "is-right" : "is-wrong"}">${esc(stamp)}</p>
${link ? `<a href="${esc(link.href)}" rel="noreferrer">${esc(link.label)}</a>` : ""}
<figcaption>${caption}</figcaption>
</figure>`;
}

export function proof(items, label) {
  return `<section class="cl-proof" aria-label="${esc(label)}"><ul>${items.map(([value, text]) => `<li><b>${value}</b><span>${text}</span></li>`).join("")}</ul></section>`;
}

export function faq(entries) {
  return `<div class="cl-faq">${entries.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${a}</p></details>`).join("")}</div>`;
}

// FAQPage structured data from the same entries, as plain text: tags removed, then any angle bracket left over.
export const faqSchema = (entries) => ({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: entries.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: String(a).replace(/<[^>]*>/g, "").replace(/[<>]/g, "") } })) });
