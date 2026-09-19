import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHttpCatalogReader } from './company-catalog-http.js';
import { createHttpDownloadReader } from './company-download.js';
import { createCompanyReleaseLoader, createCompanyReferenceHandler } from './company-release.js';

export function createConfiguredCompanyReference({ environment = () => process.env, fetcher = fetch, readAssets = () => readFileSync(resolve(process.cwd(), 'dist/company-page-assets.json')) } = {}) {
  let configured, load;
  async function loadRelease() {
    const env = environment();
    const releaseHash = env.COMPANY_RELEASE_HASH, catalogBase = env.COMPANY_CATALOG_BASE_URL, deliveryBase = env.COMPANY_DELIVERY_BASE_URL;
    if (!releaseHash || !catalogBase || !deliveryBase) throw new Error('Company release storage is not configured');
    const key = JSON.stringify([releaseHash, catalogBase, deliveryBase]);
    if (key !== configured) {
      const bytes = Buffer.from(readAssets());
      if (bytes.length > 64 * 1024) throw new Error('Company asset manifest exceeds byte bound');
      const assets = JSON.parse(bytes);
      const catalogReader = createHttpCatalogReader({ baseUrl: catalogBase, fetcher });
      const deliveryReader = createHttpCatalogReader({ baseUrl: deliveryBase, fetcher });
      const next = createCompanyReleaseLoader({ releaseHash, assets, readReleaseObject: deliveryReader, readCatalogObject: catalogReader, readDownloadIndexObject: deliveryReader, readDownload: createHttpDownloadReader({ baseUrl: deliveryBase, fetcher }) });
      configured = key; load = next;
    }
    return load();
  }
  return createCompanyReferenceHandler({ loadRelease });
}
