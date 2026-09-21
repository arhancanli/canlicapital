export const COMPANY_ROUTES = [
  { source: '/companies', destination: '/api/v1/company-reference?path=/companies' },
  { source: '/companies/:path*', destination: '/api/v1/company-reference?path=/companies/:path*' },
  { source: '/company-data/:path*', destination: '/api/v1/company-reference?path=/company-data/:path*' },
];

// The isolated preview adds explicit noindex/no-store headers on every company path.
// Since production activation, the base config already routes those paths to the
// company function; the preview then only adds headers. A base with some but not all
// company routes is a configuration error.
export function companyPreviewConfig(base) {
  const config = structuredClone(base);
  if (config.buildCommand !== 'npm run build' || config.outputDirectory !== 'dist') throw new Error('Unexpected base build contract');
  config.headers.push(...['/companies', '/companies/:path*', '/company-data/:path*'].map(source => ({ source,
    headers: [{ key: 'X-Robots-Tag', value: 'noindex' }, { key: 'Cache-Control', value: 'no-store' },
      { key: 'Allow', value: 'GET, HEAD' }] })));
  const present = COMPANY_ROUTES.filter(route => config.rewrites.some(r => r.source === route.source && r.destination === route.destination));
  if (present.length === COMPANY_ROUTES.length) return config;
  if (present.length) throw new Error('Base config routes only some company paths');
  config.rewrites.unshift(...structuredClone(COMPANY_ROUTES));
  return config;
}
