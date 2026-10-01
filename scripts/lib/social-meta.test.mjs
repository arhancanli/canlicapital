// The social-card completion run over every built page, and the structured-data item rules the
// on-page audit enforces.
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { jsonLdProblems } from "./jsonld-rules.mjs";
import { checksummedFiles, completeSocialMeta, DEFAULT_OG_IMAGE, imageDimensions, missingSocialTags, readMeta } from "./social-meta.mjs";

const page = (head) => `<!doctype html><html lang="en"><head>${head}</head><body></body></html>`;
const OG = `<meta property="og:title" content="T" /><meta property="og:image" content="${DEFAULT_OG_IMAGE.url}" />`;

test("a page on the site card gets its size, type, alt text, card type, site name and locale", () => {
  const meta = readMeta(completeSocialMeta(page(OG)));
  assert.deepEqual([meta["og:image:width"], meta["og:image:height"], meta["og:image:type"]], [["1200"], ["630"], ["image/png"]]);
  assert.equal(meta["og:image:alt"][0], DEFAULT_OG_IMAGE.alt);
  assert.equal(meta["twitter:image:alt"][0], DEFAULT_OG_IMAGE.alt);
  assert.equal(meta["twitter:card"][0], "summary_large_image");
  assert.equal(meta["og:site_name"][0], "Canli Capital");
  assert.equal(meta["og:locale"][0], "en_US");
});

test("tags a page already sets are kept, and completing twice changes nothing", () => {
  const own = page(`${OG}<meta name="twitter:card" content="summary" /><meta property="og:image:alt" content="My chart" /><meta property="og:site_name" content="X" />`);
  const once = completeSocialMeta(own);
  const meta = readMeta(once);
  assert.deepEqual([meta["twitter:card"], meta["og:image:alt"], meta["og:site_name"]], [["summary"], ["My chart"], ["X"]]);
  assert.equal(meta["twitter:image:alt"][0], "My chart", "X's alt text follows the page's own");
  assert.equal(completeSocialMeta(once), once);
});

test("another image is sized from its file, and not sized at all when the size is unknown", () => {
  const other = page(`<meta property="og:image" content="https://canlicapital.com/cards/x.png" />`);
  const sized = readMeta(completeSocialMeta(other, () => ({ width: 1600, height: 840, type: "image/png" })));
  assert.deepEqual([sized["og:image:width"], sized["og:image:height"]], [["1600"], ["840"]]);
  const unsized = missingSocialTags(other, () => null);
  assert.ok(!unsized.some((t) => t.includes("og:image:width")), "a wrong size is worse than none");
  assert.ok(!unsized.some((t) => t.includes("og:image:alt")), "alt text is never invented for an image it does not know");
});

test("a page without a head, and values with quotes, are handled", () => {
  assert.equal(completeSocialMeta("<p>no head</p>"), "<p>no head</p>");
  const tags = missingSocialTags(page(`<meta property="og:image" content="${DEFAULT_OG_IMAGE.url}" /><meta property="og:image:alt" content='say "hi"' />`));
  assert.ok(tags.every((t) => !/content="[^"]*"[^ />]/.test(t)));
});

test("image sizes are read from PNG and JPEG headers", () => {
  const png = Buffer.alloc(33);
  png.writeUInt32BE(0x89504e47, 0); png.writeUInt32BE(1200, 16); png.writeUInt32BE(630, 20);
  assert.deepEqual(imageDimensions(png), { width: 1200, height: 630, type: "image/png" });
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x76, 0x04, 0xb0, 0, 0, 0]);
  assert.deepEqual(imageDimensions(jpeg), { width: 1200, height: 630, type: "image/jpeg" });
  assert.equal(imageDimensions(Buffer.from("GIF89a")), null);
});

test("files under a published SHA256SUMS are found, so their bytes are left alone", () => {
  const root = mkdtempSync(join(tmpdir(), "sums-"));
  mkdirSync(join(root, "pub/v1"), { recursive: true });
  writeFileSync(join(root, "pub/v1/SHA256SUMS"), `${"a".repeat(64)}  paper.html\n${"b".repeat(64)} *data/x.json\nnot a line\n`);
  assert.deepEqual([...checksummedFiles(root)].sort(), [join(root, "pub/v1/data/x.json"), join(root, "pub/v1/paper.html")]);
});

const ld = (...blocks) => `<head>${blocks.map((b) => `<script type="application/ld+json">${JSON.stringify(b)}</script>`).join("")}</head>`;
const ARTICLE = { "@context": "https://schema.org", "@type": "ScholarlyArticle", headline: "A paper", image: "https://canlicapital.com/og.png", datePublished: "2026", dateModified: "2026-09-28", author: { "@type": "Person", name: "Arhan Canli", url: "https://canlicapital.com/founder" } };

test("an article passes with a headline, image, both dates and an author with a url; each gap is named", () => {
  assert.deepEqual(jsonLdProblems(ld(ARTICLE)), []);
  for (const key of ["image", "datePublished", "dateModified", "author"]) {
    const { [key]: _, ...rest } = ARTICLE;
    assert.deepEqual(jsonLdProblems(ld(rest)), [`JSON-LD block 1 ScholarlyArticle has no ${key}`], key);
  }
  assert.match(jsonLdProblems(ld({ ...ARTICLE, headline: "x".repeat(111) }))[0], /111 characters/);
  assert.match(jsonLdProblems(ld({ ...ARTICLE, author: { "@id": "https://canlicapital.com/#arhan-canli" } }))[0], /author without a url/);
  assert.deepEqual(jsonLdProblems(ld({ "@type": "CollectionPage", name: "Hub", hasPart: [{ "@type": "ScholarlyArticle", headline: "ref", url: "https://canlicapital.com/research/x" }] })), [], "a short reference inside a list is not an article item");
  assert.deepEqual(jsonLdProblems(ld({ "@graph": [{ ...ARTICLE, image: undefined }] })).length, 1, "an @graph member is an item");
});

test("an app needs a category and an offer; a breadcrumb is numbered and linked; the site's organization has a logo", () => {
  const app = { "@type": "WebApplication", name: "Tool", applicationCategory: "FinanceApplication", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } };
  assert.deepEqual(jsonLdProblems(ld(app)), []);
  assert.match(jsonLdProblems(ld({ ...app, offers: undefined }))[0], /no offers/);
  for (const offers of [{}, { price: -1 }, { price: "unpriced" }, { price: "" }]) {
    assert.match(jsonLdProblems(ld({ ...app, offers, aggregateRating: { ratingValue: 5 } }))[0], /nonnegative price/);
  }
  assert.match(jsonLdProblems(ld({ ...app, applicationCategory: undefined }))[0], /no applicationCategory/);
  const crumbs = (items) => ({ "@type": "BreadcrumbList", itemListElement: items });
  assert.deepEqual(jsonLdProblems(ld(crumbs([{ position: 1, name: "Home", item: "https://canlicapital.com" }, { position: 2, name: "Here" }]))), []);
  assert.match(jsonLdProblems(ld(crumbs([{ position: 2, name: "Home", item: "x" }])))[0], /positions/);
  assert.match(jsonLdProblems(ld(crumbs([{ position: 1, name: "Home" }, { position: 2, name: "Here" }])))[0], /without a link/);
  assert.match(jsonLdProblems(ld({ "@type": "Article", ...ARTICLE, publisher: { "@type": "Organization", name: "Canli Capital", url: "https://canlicapital.com" } }))[0], /without a logo/);
});
