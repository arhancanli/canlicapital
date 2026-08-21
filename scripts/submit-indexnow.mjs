// =============================================================================
// CANLI CAPITAL / scripts/submit-indexnow.mjs
// -----------------------------------------------------------------------------
// Tell IndexNow (Bing, Yandex, Seznam, Naver) about every canonical URL.
//
// WHY. The site went from 6 indexable URLs to 86 in a day. Waiting for a crawler
// to rediscover the sitemap is the slowest possible path for content that is
// already written and already published. IndexNow is the push channel.
//
// It reads the LIVE sitemap, never a local file, so it can only ever submit URLs
// that are actually being served; and it verifies the key is reachable at its
// published location FIRST, because a submission with an unverifiable key is
// rejected silently and looks exactly like a successful one.
// =============================================================================

import { readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://canlicapital.com";
const UA = "CanliCapital-IndexNow/1.0";

function discoverKey() {
  // The key is whatever 32-hex .txt file sits in public/. Discovered rather than hard-coded, so
  // rotating it is a file rename and cannot leave this script pointing at a key that is gone.
  const keys = readdirSync(resolve(ROOT, "public")).filter((n) => /^[0-9a-f]{32}\.txt$/.test(n));
  if (keys.length !== 1) {
    throw new Error(
      `expected exactly one IndexNow key file in public/, found ${keys.length}: ${keys.join(", ")}`,
    );
  }
  return keys[0].replace(/\.txt$/, "");
}

async function main() {
  const key = discoverKey();
  const keyUrl = `${ORIGIN}/${key}.txt`;

  const keyResponse = await fetch(keyUrl, { cache: "no-store", headers: { "user-agent": UA } });
  if (!keyResponse.ok) {
    throw new Error(`IndexNow key is not live at ${keyUrl} (${keyResponse.status}) — deploy first`);
  }
  const body = (await keyResponse.text()).trim();
  if (body !== key) {
    throw new Error(`key file at ${keyUrl} contains ${JSON.stringify(body.slice(0, 40))}, not the key`);
  }

  const sitemapResponse = await fetch(`${ORIGIN}/sitemap.xml`, {
    cache: "no-store",
    headers: { "user-agent": UA },
  });
  if (!sitemapResponse.ok) {
    throw new Error(`could not read the live sitemap (${sitemapResponse.status})`);
  }
  const urls = [...(await sitemapResponse.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  if (urls.length === 0) {
    throw new Error("the live sitemap lists no URLs; refusing to submit an empty set");
  }
  const offOrigin = urls.filter((u) => !u.startsWith(ORIGIN));
  if (offOrigin.length) {
    throw new Error(`sitemap contains off-origin URLs, which IndexNow rejects: ${offOrigin[0]}`);
  }

  const response = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8", "user-agent": UA },
    body: JSON.stringify({
      host: new URL(ORIGIN).host,
      key,
      keyLocation: keyUrl,
      urlList: urls,
    }),
  });

  if (response.status !== 200 && response.status !== 202) {
    throw new Error(`IndexNow rejected the submission (${response.status}): ${await response.text()}`);
  }
  console.log(`IndexNow accepted ${urls.length} canonical URLs (HTTP ${response.status}).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
