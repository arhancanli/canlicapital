// Public data kept on disk between sessions, so a second session answers from it at once: a filing never
// changes, and company facts change a few times a year. Compressed, capped in size (oldest out first),
// and only what any caller could fetch: nothing sent with a key or a request body. CANLI_DISK_CACHE=0
// turns it off, and CANLI_CACHE_DIR moves it. A source that is down is answered from an older copy,
// whose retrieved_at says how old it is.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, readFile, readdir, stat, unlink, writeFile, rename } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { gunzip, gzip } from "node:zlib";

const unzip = promisify(gunzip), zip = promisify(gzip);
const MINUTE = 60_000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;
const MAX_ENTRY_CHARS = 64 * 1024 * 1024;

// How long a copy stays fresh, by what it is. Unlisted hosts are not kept: prices, quotes and news must
// be current.
export function freshFor(url) {
  if (/^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\//.test(url)) return 30 * DAY;
  if (/^https:\/\/data\.sec\.gov\/api\/xbrl\/(companyfacts|companyconcept)\//.test(url)) return 6 * HOUR;
  if (/^https:\/\/data\.sec\.gov\/api\/xbrl\/frames\//.test(url)) return 6 * HOUR;
  if (/^https:\/\/data\.sec\.gov\/submissions\//.test(url)) return 15 * MINUTE;
  if (/^https:\/\/www\.sec\.gov\/files\/|^https:\/\/www\.sec\.gov\/cgi-bin\/browse-edgar\?action=getcompany&SIC=/.test(url)) return DAY;
  if (/^https:\/\/filings\.xbrl\.org\//.test(url)) return DAY;
  if (/^https:\/\/fred\.stlouisfed\.org\/|^https:\/\/home\.treasury\.gov\//.test(url)) return HOUR;
  // PortWatch answers slowly and changes weekly; page views change daily.
  if (/^https:\/\/services9\.arcgis\.com\//.test(url)) return 6 * HOUR;
  if (/^https:\/\/wikimedia\.org\/api\/rest_v1\/metrics\/pageviews\//.test(url)) return 6 * HOUR;
  // EIA's weekly history pages are slow (up to 5 seconds) and are read for the years before this one.
  if (/^https:\/\/www\.eia\.gov\/dnav\//.test(url)) return 6 * HOUR;
  // Zillow's and Realtor.com's housing files (up to 4.5 MB) change once a month.
  if (/^https:\/\/files\.zillowstatic\.com\/research\/|^https:\/\/econdata\.s3-us-west-2\.amazonaws\.com\/Reports\//.test(url)) return 12 * HOUR;
  // The IMF's COFER is quarterly.
  if (/^https:\/\/api\.imf\.org\/external\/sdmx\/3\.0\/data\/dataflow\/IMF\.STA\/COFER\//.test(url)) return 6 * HOUR;
  // Indeed's job postings files (up to 12 MB) are refreshed once a week.
  if (/^https:\/\/raw\.githubusercontent\.com\/hiring-lab\//.test(url)) return 6 * HOUR;
  // A trading day's Cboe statistics never change once published.
  if (/^https:\/\/cdn\.cboe\.com\/data\/us\/options\/market_statistics\/daily\/\d{4}-\d{2}-\d{2}_daily_options$/.test(url)) return 30 * DAY;
  // Workbooks read as a few tabs: GDPNow's (11 MB, updated after each release), State Street's daily holdings, the
  // New York Fed's consumer survey and FINRA's margin statistics (monthly).
  if (/^https:\/\/www\.atlantafed\.org\/-\/media\//.test(url)) return HOUR;
  if (/^https:\/\/www\.ssga\.com\/library-content\//.test(url)) return 6 * HOUR;
  if (/^https:\/\/www\.newyorkfed\.org\/medialibrary\/interactives\/sce\/|^https:\/\/www\.finra\.org\/sites\/default\/files\//.test(url)) return 12 * HOUR;
  // The Cleveland Fed's nowcast files (5 to 8 MB each) change once a day.
  if (/^https:\/\/www\.clevelandfed\.org\/-\/media\/files\/webcharts\/inflationnowcasting\//.test(url)) return HOUR;
  // The New York Fed's SOMA summary (all weeks since 2003) changes on Thursdays.
  if (/^https:\/\/markets\.newyorkfed\.org\/api\/soma\//.test(url)) return HOUR;
  return 0;
}

export function createDiskCache({ dir, maxBytes = 512 * 1024 * 1024, env = process.env } = {}) {
  const root = dir ?? env.CANLI_CACHE_DIR ?? join(homedir(), ".cache", "canli-markets");
  const file = (key) => join(root, `${createHash("sha256").update(key).digest("hex").slice(0, 40)}.json.gz`);
  let ready = null;
  const prepare = () => (ready ??= mkdir(root, { recursive: true }).catch(() => {}));
  // Oldest out first, at most once per write and only when the folder has grown past the cap.
  let trimming = false;
  async function trim() {
    if (trimming) return;
    trimming = true;
    try {
      const names = (await readdir(root)).filter((n) => n.endsWith(".json.gz"));
      const items = await Promise.all(names.map(async (n) => { const s = await stat(join(root, n)).catch(() => null); return s ? { n, size: s.size, at: s.mtimeMs } : null; }));
      const live = items.filter(Boolean).sort((a, b) => a.at - b.at);
      let total = live.reduce((t, x) => t + x.size, 0);
      for (const x of live) { if (total <= maxBytes) break; await unlink(join(root, x.n)).catch(() => {}); total -= x.size; }
    } catch { /* a cache that cannot be trimmed is only a cache */ } finally { trimming = false; }
  }
  return {
    root,
    async read(key) {
      try { return JSON.parse((await unzip(await readFile(file(key)))).toString("utf8")); } catch { return null; }
    },
    async write(key, entry) {
      if (typeof entry?.text !== "string" || entry.text.length > MAX_ENTRY_CHARS) return;
      try {
        await prepare();
        const to = file(key), tmp = `${to}.${process.pid}.${Date.now()}.tmp`;
        await writeFile(tmp, await zip(JSON.stringify(entry)), { mode: 0o600 });
        await rename(tmp, to);
        await trim();
      } catch { /* a read-only disk costs speed, nothing else */ }
    },
  };
}

// Vectors for filing_memory: one file of plain floats per report, in the models folder. A file of the
// wrong length (a change in how a report is split) is treated as missing.
const vectorFile = (env, name) => {
  if (!/^[A-Za-z0-9._-]+$/.test(name)) throw new Error(`Not a vector file name: ${name}`);
  return join(env.CANLI_CACHE_DIR ?? join(homedir(), ".cache", "canli-markets"), "models", "vectors", `${name}.f32`);
};
export function loadFloats(env, name, length) {
  try {
    const b = readFileSync(vectorFile(env, name));
    return b.length === length * 4 ? new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)) : null;
  } catch { return null; }
}
export function saveFloats(env, name, floats) {
  const file = vectorFile(env, name);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, Buffer.from(floats.buffer, floats.byteOffset, floats.byteLength));
}
