import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://canlicapital.com";
const DEFAULT_OUTPUT = resolve(ROOT, "artifacts/seo/live_technical_audit.json");

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const decodeEntities = (value) =>
  value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");

const first = (html, pattern) => {
  const value = html.match(pattern)?.[1];
  return value === undefined ? null : decodeEntities(value.trim());
};

function schemaTypes(value, output = []) {
  if (Array.isArray(value)) {
    for (const item of value) schemaTypes(item, output);
    return output;
  }
  if (!value || typeof value !== "object") return output;
  if (value["@type"]) {
    const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
    output.push(...types.map(String));
  }
  if (value["@graph"]) schemaTypes(value["@graph"], output);
  return output;
}

export function inspectHtml(html, requestedUrl) {
  const title = first(html, /<title>([\s\S]*?)<\/title>/i);
  const description = first(
    html,
    /<meta\s+name="description"\s+content="([^"]*)"/i,
  );
  const canonical = first(html, /<link\s+rel="canonical"\s+href="([^"]*)"/i);
  const robots = first(html, /<meta\s+name="robots"\s+content="([^"]*)"/i);
  const h1 = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((match) =>
    match[1].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(),
  );
  const schemas = [];
  let invalidJsonLd = 0;
  for (const match of html.matchAll(
    /<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi,
  )) {
    try {
      schemaTypes(JSON.parse(match[1]), schemas);
    } catch {
      invalidJsonLd += 1;
    }
  }
  const rawMarkdownLinks = [
    ...html.matchAll(/(?:^|\s)href="(\/research\/[^"]+\.md(?:#[^"]*)?)"/g),
  ].map((match) => match[1]);
  const text = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return {
    requested_url: requestedUrl,
    body_sha256: sha256(html),
    bytes: Buffer.byteLength(html),
    words: text ? text.split(/\s+/).length : 0,
    title,
    description,
    canonical,
    robots,
    h1,
    schema_types: [...new Set(schemas)].sort(),
    invalid_json_ld_blocks: invalidJsonLd,
    raw_markdown_internal_links: rawMarkdownLinks,
  };
}

const groupDuplicates = (pages, field) => {
  const seen = new Map();
  for (const page of pages) {
    const value = page[field];
    if (!value) continue;
    seen.set(value, [...(seen.get(value) ?? []), page.requested_url]);
  }
  return [...seen.entries()]
    .filter(([, urls]) => urls.length > 1)
    .map(([value, urls]) => ({ value, urls }))
    .sort((left, right) => left.value.localeCompare(right.value));
};

function walkHtml(dir) {
  if (!existsSync(dir)) return [];
  const files = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== "assets") files.push(...walkHtml(path));
    } else if (name.endsWith(".html")) {
      files.push(path);
    }
  }
  return files;
}

function localCandidateSummary() {
  const sitemapPath = resolve(ROOT, "public/sitemap.xml");
  const dist = resolve(ROOT, "dist");
  if (!existsSync(sitemapPath) || !existsSync(dist)) return null;
  const sitemap = readFileSync(sitemapPath, "utf8");
  const files = walkHtml(dist);
  const noindex = files.filter((path) =>
    /<meta\s+name="robots"\s+content="[^"]*\bnoindex\b/i.test(readFileSync(path, "utf8")),
  );
  const rawMarkdownNavigationLinks = [];
  for (const path of files) {
    const route = `/${relative(dist, path).replace(/\.html$/, "").replace(/^index$/, "")}`;
    if (!route.startsWith("/research/") && !route.startsWith("/trials/")) continue;
    const html = readFileSync(path, "utf8");
    for (const match of html.matchAll(/(?:^|\s)href="(\/research\/[^"]+\.md)"/g)) {
      if (match[1].slice(0, -3) !== route) {
        rawMarkdownNavigationLinks.push({ source_route: route, href: match[1] });
      }
    }
  }
  const vercel = JSON.parse(readFileSync(resolve(ROOT, "vercel.json"), "utf8"));
  const rawEvidenceNoindex = vercel.headers?.some(
    (rule) =>
      rule.source.includes("md") &&
      rule.source.includes("json") &&
      rule.headers?.some(
        (header) => header.key.toLowerCase() === "x-robots-tag" && /\bnoindex\b/i.test(header.value),
      ),
  );
  return {
    deployment_claimed: false,
    public_html_pages: files.length,
    sitemap_urls: [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].length,
    linked_noindex_pages: noindex.length,
    raw_markdown_navigation_link_count: rawMarkdownNavigationLinks.length,
    raw_evidence_x_robots_noindex_configured: Boolean(rawEvidenceNoindex),
    sitemap_sha256: sha256(sitemap),
  };
}

export async function runAudit({ fetchImpl = fetch, observedAt = new Date() } = {}) {
  const [robotsResponse, sitemapResponse] = await Promise.all([
    fetchImpl(`${ORIGIN}/robots.txt`),
    fetchImpl(`${ORIGIN}/sitemap.xml`),
  ]);
  const [robotsText, sitemapText] = await Promise.all([
    robotsResponse.text(),
    sitemapResponse.text(),
  ]);
  const urls = [...sitemapText.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  const pages = [];
  let cursor = 0;
  async function worker() {
    while (cursor < urls.length) {
      const requestedUrl = urls[cursor++];
      try {
        const response = await fetchImpl(requestedUrl, { redirect: "follow" });
        const html = await response.text();
        pages.push({
          ...inspectHtml(html, requestedUrl),
          status: response.status,
          final_url: response.url || requestedUrl,
          content_type: response.headers?.get?.("content-type") ?? null,
        });
      } catch (error) {
        pages.push({ requested_url: requestedUrl, fetch_error: String(error) });
      }
    }
  }
  await Promise.all(Array.from({ length: 12 }, () => worker()));
  pages.sort((left, right) => left.requested_url.localeCompare(right.requested_url));

  const packetIndexPath = resolve(ROOT, "public/glassbox/trial-packets/index.json");
  const packetIndex = existsSync(packetIndexPath)
    ? JSON.parse(readFileSync(packetIndexPath, "utf8"))
    : { packets: [] };
  const incompleteTrialUrls = new Set(
    packetIndex.packets
      .filter((packet) => packet.complete !== true)
      .map((packet) => `${ORIGIN}/trials/${packet.hypothesis_key}`),
  );
  const incompleteTrialsInLiveSitemap = urls.filter((url) => incompleteTrialUrls.has(url));

  const technicalFailures = pages
    .filter(
      (page) =>
        page.fetch_error ||
        page.status !== 200 ||
        page.final_url !== page.requested_url ||
        !page.title ||
        !page.description ||
        page.canonical !== page.requested_url ||
        page.h1?.length !== 1 ||
        page.invalid_json_ld_blocks !== 0,
    )
    .map((page) => ({
      url: page.requested_url,
      status: page.status ?? null,
      final_url: page.final_url ?? null,
      fetch_error: page.fetch_error ?? null,
      title_present: Boolean(page.title),
      description_present: Boolean(page.description),
      canonical: page.canonical ?? null,
      h1_count: page.h1?.length ?? null,
      invalid_json_ld_blocks: page.invalid_json_ld_blocks ?? null,
    }));
  const rawMarkdownLinks = pages.flatMap((page) =>
    (page.raw_markdown_internal_links ?? []).map((href) => ({
      source_url: page.requested_url,
      href,
    })),
  );
  const rawMarkdownNavigationLinks = rawMarkdownLinks.filter(
    (link) => `${ORIGIN}${link.href.slice(0, -3)}` !== link.source_url,
  );
  const rawMarkdownTargets = [...new Set(rawMarkdownLinks.map((link) => `${ORIGIN}${link.href}`))];
  const rawMarkdownTargetHeaders = await Promise.all(
    rawMarkdownTargets.map(async (url) => {
      try {
        const response = await fetchImpl(url, { method: "HEAD", redirect: "follow" });
        return {
          url,
          status: response.status,
          x_robots_tag: response.headers?.get?.("x-robots-tag") ?? null,
        };
      } catch (error) {
        return { url, status: null, x_robots_tag: null, fetch_error: String(error) };
      }
    }),
  );
  const rawMarkdownTargetsWithoutNoindex = rawMarkdownTargetHeaders.filter(
    (target) => !/\bnoindex\b/i.test(target.x_robots_tag ?? ""),
  );
  const offOriginUrls = urls.filter((url) => !url.startsWith(`${ORIGIN}/`) && url !== `${ORIGIN}/`);
  const duplicateSitemapUrls = [...new Set(urls.filter((url, index) => urls.indexOf(url) !== index))];
  const strategicIssues = [];
  if (incompleteTrialsInLiveSitemap.length) {
    strategicIssues.push({
      code: "INCOMPLETE_TRIAL_DETAIL_PAGES_INDEXABLE",
      count: incompleteTrialsInLiveSitemap.length,
      finding:
        "Incomplete evidence records are publicly useful but should not compete with family papers and topic hubs as standalone search documents.",
    });
  }
  if (rawMarkdownNavigationLinks.length) {
    strategicIssues.push({
      code: "RAW_MARKDOWN_NAVIGATION_LINKS",
      count: rawMarkdownNavigationLinks.length,
      finding:
        "Normal paper navigation points to metadata-free markdown copies instead of consolidating authority on canonical HTML papers.",
    });
  }
  if (rawMarkdownTargetsWithoutNoindex.length) {
    strategicIssues.push({
      code: "RAW_EVIDENCE_TARGETS_INDEXABLE",
      count: rawMarkdownTargetsWithoutNoindex.length,
      finding:
        "Raw source downloads are useful evidence, but their responses do not currently carry an X-Robots-Tag noindex directive.",
    });
  }

  return {
    schema: "canli.canlicapital-live-seo-audit.v1",
    author: "Arhan Canli",
    observed_at_utc: observedAt.toISOString(),
    status:
      technicalFailures.length || !robotsResponse.ok || !sitemapResponse.ok || offOriginUrls.length
        ? "FAIL_TECHNICAL"
        : strategicIssues.length
          ? "PASS_TECHNICAL_STRATEGIC_REPAIRS_PENDING"
          : "PASS",
    claim_boundary:
      "This is a read-only direct-HTTP observation of the live domain plus an explicitly labeled local-build comparison. It does not prove search-engine indexing, rankings, traffic, deployment of local changes, content quality, or future search performance.",
    collection: {
      method: "direct HTTP fetch of robots.txt, sitemap.xml, and every sitemap URL",
      firecrawl_used: false,
      firecrawl_limitation:
        "Firecrawl was not configured for this run; no Firecrawl collection or result is claimed.",
      search_visibility_measured: false,
    },
    live: {
      robots: {
        status: robotsResponse.status,
        body_sha256: sha256(robotsText),
        allows_root: /User-agent:\s*\*[\s\S]*Allow:\s*\//i.test(robotsText),
        declares_sitemap: robotsText.includes(`Sitemap: ${ORIGIN}/sitemap.xml`),
      },
      sitemap: {
        status: sitemapResponse.status,
        body_sha256: sha256(sitemapText),
        canonical_url_list_sha256: sha256(`${urls.join("\n")}\n`),
        url_count: urls.length,
        duplicate_urls: duplicateSitemapUrls,
        off_origin_urls: offOriginUrls,
      },
      crawl: {
        pages_checked: pages.length,
        technical_failure_count: technicalFailures.length,
        technical_failures: technicalFailures,
        duplicate_titles: groupDuplicates(pages, "title"),
        duplicate_descriptions: groupDuplicates(pages, "description"),
        raw_markdown_internal_link_count: rawMarkdownLinks.length,
        raw_markdown_internal_links: rawMarkdownLinks,
        raw_markdown_navigation_link_count: rawMarkdownNavigationLinks.length,
        raw_markdown_navigation_links: rawMarkdownNavigationLinks,
        raw_markdown_unique_target_count: rawMarkdownTargets.length,
        raw_markdown_targets_without_noindex_count: rawMarkdownTargetsWithoutNoindex.length,
        raw_markdown_target_headers: rawMarkdownTargetHeaders,
      },
      trial_indexing: {
        local_packet_count_used_for_classification: packetIndex.packets.length,
        locally_classified_incomplete_packets: incompleteTrialUrls.size,
        incomplete_trial_detail_urls_in_live_sitemap: incompleteTrialsInLiveSitemap.length,
      },
      strategic_issues: strategicIssues,
    },
    local_candidate: localCandidateSummary(),
  };
}

async function main() {
  const outputIndex = process.argv.indexOf("--output");
  const output = outputIndex >= 0 ? resolve(process.argv[outputIndex + 1]) : DEFAULT_OUTPUT;
  const audit = await runAudit();
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(audit, null, 2)}\n`);
  console.log(
    `${audit.status}: ${audit.live.crawl.pages_checked} live pages checked, ` +
      `${audit.live.crawl.technical_failure_count} technical failures, ` +
      `${audit.live.trial_indexing.incomplete_trial_detail_urls_in_live_sitemap} incomplete trial pages in the live sitemap`,
  );
  console.log(`${relative(ROOT, output)} (${sha256(readFileSync(output))})`);
  if (audit.status === "FAIL_TECHNICAL") process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
