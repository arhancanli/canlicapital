import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { titleLabel } from './company-label.mjs';

// The company records searchers already find: the companies whose pages drew the most Google
// Search impressions, from a Search Console capture committed in config/. No main page linked any
// company, so the pages Google already shows sat four clicks deep behind /companies and a
// directory page; linking them from the home, research and developer pages puts them one click
// from the pages Google crawls most. A company is linked only while the activated admission lets
// its overview be indexed, so a withheld or removed company drops out without editing the capture.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DEMAND_COMPANIES_PATH = 'config/search-demand-companies.json';
export const DEMAND_COMPANIES_LIMIT = 12;

export function selectDemandCompanies(capture, admission, limit = DEMAND_COMPANIES_LIMIT) {
  if (capture?.schema !== 'canli.search-demand-companies.v1' || !/^\d{4}-\d{2}-\d{2}$/.test(capture.captured) || !Array.isArray(capture.companies)) throw new Error('Invalid search demand capture');
  const seen = new Set();
  for (const company of capture.companies) {
    if (!/^\d{10}$/.test(company?.cik) || typeof company.name !== 'string' || !company.name.trim() || !Number.isSafeInteger(company.impressions) || company.impressions < 1) throw new Error(`Invalid search demand entry ${company?.cik}`);
    if (seen.has(company.cik)) throw new Error(`Duplicate search demand entry ${company.cik}`);
    seen.add(company.cik);
  }
  const ranked = [...capture.companies].sort((a, b) => b.impressions - a.impressions || a.cik.localeCompare(b.cik));
  return {
    captured: capture.captured,
    companies: ranked.filter(company => admission?.companies?.[company.cik]?.overview === true).slice(0, limit)
      .map(company => ({ cik: company.cik, label: titleLabel(company), href: `/companies/${company.cik}` })),
  };
}

let cached;
export function demandCompanies(root = ROOT) {
  if (cached?.root === root) return cached.value;
  const activation = JSON.parse(readFileSync(resolve(root, 'config/company-production-activation.json'), 'utf8'));
  const admission = activation?.enabled === true ? JSON.parse(readFileSync(resolve(root, activation.admission.path), 'utf8')) : null;
  const value = selectDemandCompanies(JSON.parse(readFileSync(resolve(root, DEMAND_COMPANIES_PATH), 'utf8')), admission);
  cached = { root, value };
  return value;
}
