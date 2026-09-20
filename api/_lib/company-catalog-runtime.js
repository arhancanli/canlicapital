import { createCompanyCatalog } from './company-catalog.js';
import { createHttpCatalogReader } from './company-catalog-http.js';
let cachedConfig, catalog;
export function configuredCompanyCatalog() {
  const rootHash = process.env.COMPANY_CATALOG_ROOT_HASH;
  const baseUrl = process.env.COMPANY_CATALOG_BASE_URL;
  const config = JSON.stringify([rootHash, baseUrl]);
  if (config !== cachedConfig) {
    catalog = undefined;
    try { if (rootHash && baseUrl) catalog = createCompanyCatalog({ rootHash, readObject: createHttpCatalogReader({ baseUrl }) }); } catch { /* Unavailable, not an empty catalog. */ }
    cachedConfig = config;
  }
  return catalog;
}
