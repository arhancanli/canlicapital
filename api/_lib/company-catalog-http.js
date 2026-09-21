import { CatalogError } from './company-catalog.js';

// One bounded retry for transient storage failures (network error, 429 or 5xx).
// Other statuses, including 404, return immediately. A fresh timeout per attempt
// keeps the worst case at two storage timeouts, inside the function's duration.
export async function fetchStorage(fetcher, url, init) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetcher(url, { ...init, signal: AbortSignal.timeout(10_000) });
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
