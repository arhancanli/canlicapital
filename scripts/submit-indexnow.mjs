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

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://canlicapital.com";
const UA = "CanliCapital-IndexNow/1.0";
const DRY_RUN = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");
const MIN_INTERVAL_HOURS = Number(process.env.INDEXNOW_MIN_INTERVAL_HOURS || "24");
const RECEIPT = resolve(
  ROOT,
  "artifacts",
  "seo",
  DRY_RUN ? "indexnow_validation.json" : "indexnow_submission.json",
);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function submissionPolicy({
  previous,
  urlListHash,
  nowMs = Date.now(),
  minIntervalMs = MIN_INTERVAL_HOURS * 60 * 60 * 1000,
  force = false,
}) {
  if (force) return { submit: true, reason: "FORCED" };
  if (!previous || previous.accepted !== true || previous.mode !== "SUBMISSION") {
    return { submit: true, reason: "NO_ACCEPTED_RECEIPT" };
  }
  if (previous.canonical_url_list_sha256 !== urlListHash) {
    return { submit: true, reason: "CANONICAL_URL_SET_CHANGED" };
  }
  const previousMs = Date.parse(previous.recorded_at);
  if (!Number.isFinite(previousMs) || previousMs > nowMs) {
    return { submit: true, reason: "RECEIPT_TIME_INVALID" };
  }
  const ageMs = nowMs - previousMs;
  if (ageMs >= minIntervalMs) {
    return { submit: true, reason: "COOLDOWN_ELAPSED", ageMs };
  }
  return {
    submit: false,
    reason: "UNCHANGED_URL_SET_COOLDOWN",
    ageMs,
    retryAfterMs: minIntervalMs - ageMs,
  };
}

function readAcceptedReceipt() {
  const submissionReceipt = resolve(ROOT, "artifacts", "seo", "indexnow_submission.json");
  if (!existsSync(submissionReceipt)) return null;
  try {
    return JSON.parse(readFileSync(submissionReceipt, "utf8"));
  } catch {
    return null;
  }
}

function writeReceipt(receipt) {
  const bound = {
    ...receipt,
    content_hash: `sha256:${sha256(JSON.stringify(receipt))}`,
  };
  mkdirSync(dirname(RECEIPT), { recursive: true });
  writeFileSync(RECEIPT, `${JSON.stringify(bound, null, 2)}\n`);
}

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
    throw new Error(`IndexNow key is not live at ${keyUrl} (${keyResponse.status}). Deploy first.`);
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
  const sitemapText = await sitemapResponse.text();
  const urls = [...sitemapText.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  if (urls.length === 0) {
    throw new Error("the live sitemap lists no URLs; refusing to submit an empty set");
  }
  const offOrigin = urls.filter((u) => !u.startsWith(ORIGIN));
  if (offOrigin.length) {
    throw new Error(`sitemap contains off-origin URLs, which IndexNow rejects: ${offOrigin[0]}`);
  }

  const receipt = {
    schema: "canli.indexnow-submission.v1",
    recorded_at: new Date().toISOString(),
    mode: DRY_RUN ? "VALIDATION_ONLY" : "SUBMISSION",
    origin: ORIGIN,
    key_location: keyUrl,
    live_sitemap: `${ORIGIN}/sitemap.xml`,
    live_sitemap_sha256: sha256(sitemapText),
    canonical_url_count: urls.length,
    canonical_url_list_sha256: sha256(`${urls.join("\n")}\n`),
    endpoint: "https://api.indexnow.org/indexnow",
    http_status: null,
    accepted: false,
    claim_boundary:
      "This receipt proves live-key and live-sitemap validation and, in submission mode, the IndexNow HTTP acceptance status. It does not prove crawling, indexing, ranking or search traffic.",
  };

  if (DRY_RUN) {
    writeReceipt(receipt);
    console.log(
      `IndexNow validation passed for ${urls.length} canonical URLs; no submission sent.`,
    );
    return;
  }

  if (!Number.isFinite(MIN_INTERVAL_HOURS) || MIN_INTERVAL_HOURS < 1) {
    throw new Error("INDEXNOW_MIN_INTERVAL_HOURS must be a finite number of at least 1");
  }
  const policy = submissionPolicy({
    previous: readAcceptedReceipt(),
    urlListHash: receipt.canonical_url_list_sha256,
    force: FORCE,
  });
  if (!policy.submit) {
    const ageHours = (policy.ageMs / 3_600_000).toFixed(1);
    const retryHours = (policy.retryAfterMs / 3_600_000).toFixed(1);
    console.log(
      `IndexNow skipped: unchanged ${urls.length}-URL set was accepted ${ageHours}h ago; ` +
        `cooldown has ${retryHours}h remaining.`,
    );
    return;
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
  receipt.http_status = response.status;
  receipt.accepted = true;
  writeReceipt(receipt);
  console.log(`IndexNow accepted ${urls.length} canonical URLs (HTTP ${response.status}).`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
