import { CatalogError } from './company-catalog.js';

export function createHttpCatalogReader({ baseUrl, fetcher = fetch }) {
  const base = new URL(baseUrl);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new CatalogError('Catalog storage requires a fixed HTTPS origin/path');
  base.pathname = base.pathname.replace(/\/?$/, '/');
  return async (hash, limit) => {
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new CatalogError('Invalid storage object hash');
    const response = await fetcher(new URL(`objects/${hash}.json`, base), { redirect: 'error', signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/json' } });
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
