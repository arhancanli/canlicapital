export function companyPreviewConfig(base) {
  const config = structuredClone(base);
  if (config.buildCommand !== 'npm run build' || config.outputDirectory !== 'dist') throw new Error('Unexpected base build contract');
  config.headers.push(...['/companies', '/companies/:path*', '/company-data/:path*'].map(source => ({ source,
    headers: [{ key: 'X-Robots-Tag', value: 'noindex' }, { key: 'Cache-Control', value: 'no-store' },
      { key: 'Allow', value: 'GET, HEAD' }] })));
  config.rewrites.unshift(
    { source: '/companies', destination: '/api/v1/company-reference?path=/companies' },
    { source: '/companies/:path*', destination: '/api/v1/company-reference?path=/companies/:path*' },
    { source: '/company-data/:path*', destination: '/api/v1/company-reference?path=/company-data/:path*' });
  return config;
}
