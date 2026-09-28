// =============================================================================
// scripts/lib/social-meta.mjs
// -----------------------------------------------------------------------------
// The social-card tags every page carries, in one place. Twenty-four generators and the
// hand-written pages each write their own <head>, and on 2026-09-28 a check of 298 live pages the
// way the Open Graph and X card debuggers read them found 293 without the image's size or alt
// text, 46 without an X card and 30 without a site name. Rather than a twenty-fifth copy of the
// rule, scripts/stamp-social-meta.mjs runs this over the built pages, and scripts/audit-onpage.mjs
// fails the build if any page still lacks a tag.
//
// Only tags a page is missing are added; a tag a generator wrote is never changed, so a page that
// sets its own image, alt text or card type keeps them. A file listed in a published SHA256SUMS (the
// archival papers inside each publication bundle) is never touched: its bytes are what readers verify.
// =============================================================================

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

export const ORIGIN = "https://canlicapital.com";
export const SITE_NAME = "Canli Capital";

// The site-wide card, /og.png (1200 x 630). Its alt text says what the image shows.
export const DEFAULT_OG_IMAGE = Object.freeze({
  url: `${ORIGIN}/og.png`,
  width: 1200,
  height: 630,
  type: "image/png",
  alt: "Canli Capital: Proven in the open. Systematic investment research with a market-neutral core. Simulation and live paper trading, no real capital, no claimed return.",
});

const attr = (tag, name) => tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i"))?.[1];
const escapeAttr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The page's meta tags as {key: [values]}, keys lower-cased (property= or name=). */
export function readMeta(html) {
  const head = html.slice(0, html.search(/<\/head>/i) + 1 || html.length);
  const out = {};
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const key = (attr(m[0], "property") ?? attr(m[0], "name"))?.toLowerCase();
    const value = attr(m[0], "content");
    if (key && value !== undefined) (out[key] ??= []).push(value);
  }
  return out;
}

/**
 * The tags a page is missing, as HTML to insert before </head>. `imageSize(url)` returns
 * {width, height, type} for an image on this origin, or null when unknown (then no size is
 * declared, since a wrong size is worse than none).
 */
export function missingSocialTags(html, imageSize) {
  const meta = readMeta(html);
  const has = (k) => Boolean(meta[k]?.length);
  const tags = [];
  const add = (kind, key, value) => tags.push(`<meta ${kind}="${key}" content="${escapeAttr(value)}" />`);
  const image = meta["og:image"]?.[0];
  if (!has("og:site_name")) add("property", "og:site_name", SITE_NAME);
  if (!has("og:locale")) add("property", "og:locale", "en_US");
  if (image) {
    const isDefault = image === DEFAULT_OG_IMAGE.url;
    const size = isDefault ? DEFAULT_OG_IMAGE : imageSize?.(image) ?? null;
    if (size && !has("og:image:width") && !has("og:image:height")) {
      add("property", "og:image:width", String(size.width));
      add("property", "og:image:height", String(size.height));
    }
    if (size?.type && !has("og:image:type")) add("property", "og:image:type", size.type);
    if (isDefault && !has("og:image:alt")) add("property", "og:image:alt", DEFAULT_OG_IMAGE.alt);
    if (!has("twitter:card")) add("name", "twitter:card", "summary_large_image");
    const alt = meta["og:image:alt"]?.[0] ?? (isDefault ? DEFAULT_OG_IMAGE.alt : null);
    if (alt && !has("twitter:image:alt")) add("name", "twitter:image:alt", alt);
  }
  return tags;
}

/** The page with its missing social tags inserted before </head>; unchanged when none are missing. */
export function completeSocialMeta(html, imageSize) {
  const tags = missingSocialTags(html, imageSize);
  if (!tags.length) return html;
  const at = html.search(/<\/head>/i);
  if (at < 0) return html;
  return `${html.slice(0, at)}${tags.join("\n")}\n${html.slice(at)}`;
}

/** Width and height of a PNG or baseline/progressive JPEG from its bytes, or null. */
export function imageDimensions(bytes) {
  if (bytes.length > 24 && bytes.readUInt32BE(0) === 0x89504e47) return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), type: "image/png" };
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) return null;
      const marker = bytes[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: bytes.readUInt16BE(i + 7), height: bytes.readUInt16BE(i + 5), type: "image/jpeg" };
      i += 2 + bytes.readUInt16BE(i + 2);
    }
  }
  return null;
}

/** Every file a SHA256SUMS under `root` lists: bytes readers check against a published checksum. */
export function checksummedFiles(root) {
  const out = new Set();
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry === "SHA256SUMS") {
        for (const line of readFileSync(full, "utf8").split("\n")) {
          const m = line.match(/^[0-9a-f]{64} [ *](.+)$/);
          if (m) out.add(join(dirname(full), m[1]));
        }
      }
    }
  };
  walk(root);
  return out;
}
