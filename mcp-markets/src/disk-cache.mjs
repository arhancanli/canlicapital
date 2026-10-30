// Public data kept on disk between sessions, so a second session answers from it at once: a filing never
// changes, and company facts change a few times a year. Compressed, capped in size (oldest out first),
// and only what any caller could fetch: nothing sent with a key or a request body. CANLI_DISK_CACHE=0
// turns it off, and CANLI_CACHE_DIR moves it. A source that is down is answered from an older copy,
// whose retrieved_at says how old it is.
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, unlink, writeFile, rename } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
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
