import { catalogHash } from './company-catalog.js';
import { DOWNLOAD_LIMITS, validateDownloadDescriptor } from './company-download-index.js';
export function createHttpDownloadReader({ baseUrl, fetcher = fetch }) {
  const base = new URL(baseUrl);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('Download storage requires fixed HTTPS origin/path');
  base.pathname = base.pathname.replace(/\/?$/, '/');
  return async item => {
    validateDownloadDescriptor(item);
    const response = await fetcher(new URL(item.storage_path, base), { redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Download storage unavailable');
    const length = response.headers.get('content-length');
    if (length !== null && Number(length) !== item.bytes) { await response.body?.cancel(); throw new Error('Download byte count mismatch'); }
    let size = 0; const chunks = [];
    for await (const chunk of response.body) {
      size += chunk.length; if (size > item.bytes || size > DOWNLOAD_LIMITS.objectBytes) throw new Error('Download exceeds byte limit');
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    if (bytes.length !== item.bytes || catalogHash(bytes) !== item.sha256) throw new Error('Download content does not match binding');
    return bytes;
  };
}
export function createCompanyDownloadHandler({ index, readDownload }) {
  return async (req, res) => {
    res.setHeader('X-Robots-Tag', 'noindex'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Cache-Control', 'no-store');
    const fail = (status, message) => { res.statusCode = status; res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.end(req.method === 'HEAD' ? undefined : message); };
    if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS'); res.statusCode = 204; return res.end(); }
    if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD, OPTIONS'); return fail(405, 'Method not allowed'); }
    try {
      if (!index || !readDownload) return fail(503, 'Company source temporarily unavailable');
      const descriptor = await index.find(req.query?.path);
      if (!descriptor) return fail(404, 'Company source not found');
      const bytes = Buffer.from(await readDownload(descriptor));
      if (bytes.length !== descriptor.bytes || catalogHash(bytes) !== descriptor.sha256) throw new Error('Corrupt download');
      res.setHeader('Content-Type', descriptor.path.endsWith('.gz') ? 'application/gzip' : 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${descriptor.path.split('/').at(-1)}"`);
      res.setHeader('Content-Length', bytes.length); res.setHeader('ETag', `"${descriptor.sha256}"`);
      res.statusCode = 200; res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch { return fail(503, 'Company source temporarily unavailable'); }
  };
}
