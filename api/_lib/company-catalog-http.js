import { CatalogError } from './company-catalog.js';

// One bounded retry for transient storage failures (network error, timeout, 429 or
// 5xx). Other statuses, including 404, return immediately. Hosted checks from the
// function region saw occasional reads stall with no response while the same objects
// answered in about a second elsewhere, so the first attempt gives up after 3 s and
// the retry keeps the full 10 s: at most 13 s per object instead of a stall to 10 s.
export const STORAGE_ATTEMPT_TIMEOUTS_MS = [3_000, 10_000];
export async function fetchStorage(fetcher, url, init) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetcher(url, { ...init, signal: AbortSignal.timeout(STORAGE_ATTEMPT_TIMEOUTS_MS[attempt - 1]) });
      if (attempt === 1 && (response.status === 429 || response.status >= 500)) { await response.body?.cancel(); continue; }
      return response;
    } catch (error) {
      if (attempt > 1) throw error;
    }
  }
}

export function createHttpCatalogReader({ baseUrl, fetcher = fetch }) {
  const base = new URL(baseUrl);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new CatalogError('Catalog storage requires a fixed HTTPS origin/path');
  base.pathname = base.pathname.replace(/\/?$/, '/');
  return async (hash, limit) => {
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new CatalogError('Invalid storage object hash');
    const response = await fetchStorage(fetcher, new URL(`objects/${hash}.json`, base), { redirect: 'error', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new CatalogError('Catalog storage unavailable');
    const declared = response.headers.get('content-length');
    if (declared && Number(declared) > limit) { await response.body?.cancel(); throw new CatalogError('Storage object exceeds byte limit'); }
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > limit) throw new CatalogError('Storage object exceeds byte limit');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  };
}
