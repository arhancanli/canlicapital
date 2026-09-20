import { existsSync, lstatSync, realpathSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function prepareCompanyPreviewOutput(root, environment = process.env) {
  if (environment.VERCEL_ENV !== 'preview') throw new Error('Company route output preparation is preview-only');
  root = realpathSync(root);
  const dist = resolve(root, 'dist');
  if (lstatSync(dist).isSymbolicLink() || realpathSync(dist) !== dist ||
      !existsSync(resolve(dist, 'index.html')) || !existsSync(resolve(dist, 'company-page-assets.json'))) {
    throw new Error('Expected completed local dist build');
  }
  // Vercel gives filesystem output precedence over rewrites. Remove generated
  // pilot copies in this preview only so they cannot shadow the pinned release.
  // https://vercel.com/docs/project-configuration/vercel-json#rewrites
  const paths = ['companies', 'companies.html', 'company-data'].map(name => resolve(dist, name));
  for (const path of paths) {
    if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new Error('Unexpected symlink in preview output');
  }
  for (const path of paths) rmSync(path, { force: true, recursive: true });
  return paths;
}

export function prepareEnabledCompanyPreviewOutput(root, environment = process.env) {
  if (environment.COMPANY_CLEAN_ROUTE_PREVIEW !== '1') return [];
  return prepareCompanyPreviewOutput(root, environment);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (prepareEnabledCompanyPreviewOutput(process.cwd()).length) {
    console.log('Prepared generated company output for preview-only dynamic routing');
  }
}
