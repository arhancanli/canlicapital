// Vercel's server-provided deployment host, never a client-controlled Host header.
export function receiptOrigin(env = process.env) {
  if (env.VERCEL_ENV !== 'preview') return 'https://canlicapital.com';
  if (!/^[a-z0-9][a-z0-9-]*\.vercel\.app$/.test(env.VERCEL_URL || '')) {
    throw new Error('Preview receipt origin requires a valid Vercel deployment host');
  }
  return `https://${env.VERCEL_URL}`;
}
