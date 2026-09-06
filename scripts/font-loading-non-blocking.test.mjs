// /developers, /tools and /notes each shipped a render-blocking
// <link rel="stylesheet"> to fonts.googleapis.com while index.html already used
// the non-blocking preload + media=print/onload + noscript pattern (index.html
// lines 26-28). scripts/build-standards-and-developers.mjs, build-tools-hub.mjs
// and build-notes.mjs now emit the same pattern. This checks the actual
// rendered HTML those three generators wrote, not just their source, so a
// generator edited without being re-run fails loudly here instead of shipping
// a render-blocking link.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,400..700&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap";

const RENDERED_PAGES = {
  "/developers": "../developers.html",
  "/tools": "../tools.html",
  "/notes": "../notes.html",
};

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

for (const [route, path] of Object.entries(RENDERED_PAGES)) {
  test(`${route}'s googleapis stylesheet link is not render-blocking`, () => {
    const html = read(path);
    assert.ok(html.includes(FONT_HREF), `${route}: expected font stylesheet not found`);

    const noscriptFallback = `<noscript><link rel="stylesheet" href="${FONT_HREF}" /></noscript>`;
    assert.ok(html.includes(noscriptFallback), `${route}: missing the noscript fallback`);

    // The bare, unguarded link is only ever allowed inside that noscript
    // fallback (which browsers with JS on never apply); strip it out and the
    // render-blocking form must be gone from what remains.
    const withoutNoscript = html.replace(noscriptFallback, "");
    assert.ok(
      !withoutNoscript.includes(`<link rel="stylesheet" href="${FONT_HREF}" />`),
      `${route}: still has a render-blocking font link outside noscript`,
    );

    // The non-blocking pair: preload as=style, then the media=print/onload swap.
    assert.ok(
      html.includes(`<link rel="preload" as="style" href="${FONT_HREF}" />`),
      `${route}: missing the preload as=style link`,
    );
    assert.ok(
      html.includes(`<link rel="stylesheet" media="print" onload="this.media='all'" href="${FONT_HREF}" />`),
      `${route}: missing the media=print onload swap`,
    );
  });
}
