// =============================================================================
// CANLI CAPITAL / scripts/build-adoption-stats.mjs
// -----------------------------------------------------------------------------
// Writes public/stats/adoption.json: how much the open tools are used, from the public counters
// that count them. npm downloads per MCP package (last 7 days, last 30 days, since first publish),
// GitHub stars and forks per repository, and the hosted validation API's own totals.
//
// Each source keeps its own fetched_at. A source that cannot be reached keeps its last committed
// values and says so (stale: true), so a network failure never blanks the page or invents a zero.
// npm counts every download, including CI, mirrors and bots; the page says so next to the numbers.
//   node scripts/build-adoption-stats.mjs
// =============================================================================
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const OUT = "public/stats/adoption.json";
export const PACKAGES = Object.freeze(["canli-validation-mcp", "canli-fundamentals-mcp", "canli-research-mcp", "canli-markets-mcp", "canli-quant-mcp", "canli-backtest-mcp", "canli-paper-trading-mcp"]);
export const REPOSITORIES = Object.freeze(["arhancanli/canlicapital", "arhancanli/alphac", "arhancanli/canli-validation-mcp",
  "arhancanli/canli-fundamentals-mcp", "arhancanli/canli-research-mcp", "arhancanli/canli-pit-lake", "arhancanli/canli-backtest"]);
const STATUS_URL = "https://canlicapital.com/api/v1/validate/status";
const TIMEOUT_MS = 15000;

async function getJson(url, fetchImpl) {
  const response = await fetchImpl(url, { headers: { "user-agent": "canlicapital-adoption-stats", accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

const day = (date) => date.toISOString().slice(0, 10);

// Downloads since first publish: npm's range endpoint serves at most 18 months per request, which
// covers every package here (the oldest was first published in 2026).
export async function npmPackage(name, now, fetchImpl) {
  const meta = await getJson(`https://registry.npmjs.org/${name}`, fetchImpl);
  const created = meta.time.created.slice(0, 10);
  const latest = meta["dist-tags"].latest;
  const row = { name, latest_version: latest, latest_published: meta.time[latest].slice(0, 10), first_published: created,
    npm_url: `https://www.npmjs.com/package/${name}` };
  let counts;
  try {
    counts = await Promise.all([
      getJson(`https://api.npmjs.org/downloads/point/last-week/${name}`, fetchImpl),
      getJson(`https://api.npmjs.org/downloads/point/last-month/${name}`, fetchImpl),
      getJson(`https://api.npmjs.org/downloads/range/${created}:${day(now)}/${name}`, fetchImpl),
    ]);
  } catch (error) {
    // npm's download counter starts a few days after a package's first publish and answers 404 until then. A package
    // that new is listed with its version and no counts (never zeros); an older one that fails is a real failure.
    if ((now - new Date(`${created}T00:00:00Z`)) / 86400000 > 7) throw error;
    return { ...row, downloads_last_week: null, downloads_last_month: null, downloads_total: null };
  }
  const [week, month, range] = counts;
  const total = range.downloads.reduce((sum, item) => sum + item.downloads, 0);
  return { ...row, downloads_last_week: week.downloads, downloads_last_month: month.downloads, downloads_total: total };
}

export async function githubRepository(fullName, fetchImpl) {
  const repo = await getJson(`https://api.github.com/repos/${fullName}`, fetchImpl);
  return { name: fullName, stars: repo.stargazers_count, forks: repo.forks_count, open_issues: repo.open_issues_count,
    pushed_at: repo.pushed_at.slice(0, 10), url: repo.html_url };
}

export async function hostedApi(fetchImpl) {
  const status = await getJson(STATUS_URL, fetchImpl);
  const usage = status.data?.usage;
  if (!usage || !Number.isSafeInteger(usage.validations_total)) throw new Error("status endpoint has no usage totals");
  return { validations_total: usage.validations_total, source: STATUS_URL };
}

// previous: the committed file, or null. Each source falls back to its previous section on failure.
export async function collect({ now = new Date(), fetchImpl = fetch, previous = null } = {}) {
  const at = now.toISOString().slice(0, 16) + "Z";
  const section = async (key, work) => {
    try { return { fetched_at: at, stale: false, rows: await work() }; }
    catch (error) {
      if (previous?.[key]?.rows) return { ...previous[key], stale: true, error: String(error.message).slice(0, 200) };
      return { fetched_at: null, stale: true, rows: null, error: String(error.message).slice(0, 200) };
    }
  };
  return {
    schema: "canli.adoption-stats.v1",
    generated_at: at,
    note: "npm counts every download, including CI runs, mirrors and bots; it is an upper bound on people. Stars and forks are GitHub's own counters. Validations are calls to the hosted API, which also counts the site's own smoke tests.",
    windows_days: { last_week: 7, last_month: 30 },
    npm: await section("npm", () => Promise.all(PACKAGES.map((name) => npmPackage(name, now, fetchImpl)))),
    github: await section("github", () => Promise.all(REPOSITORIES.map((name) => githubRepository(name, fetchImpl)))),
    hosted_api: await section("hosted_api", () => hostedApi(fetchImpl)),
  };
}

// The page's headline sums every package's last-30-day count; the sum is published beside its parts.
export function withTotals(stats) {
  const rows = stats.npm.rows ?? [];
  return { ...stats, npm: { ...stats.npm, downloads_last_month_all_packages: rows.reduce((sum, row) => sum + (row.downloads_last_month ?? 0), 0) } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const path = resolve(ROOT, OUT);
  // One read, no exists-then-read window: a missing file means no previous values.
  let previous = null;
  try { previous = JSON.parse(readFileSync(path, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
  const stats = withTotals(await collect({ previous }));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(stats, null, 2) + "\n");
  const stale = ["npm", "github", "hosted_api"].filter((key) => stats[key].stale);
  console.log(`  ${OUT} written${stale.length ? ` (kept last values for: ${stale.join(", ")})` : ""}`);
}
