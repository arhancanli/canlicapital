import { EDITORIAL_EXCLUSIONS_V5 } from './company-editorial-v5.mjs';
export const EDITORIAL_POLICY_V6 = 'extended-v6';
// Preserve earlier snapshots; do not infer company totals from asset-level claims.
export const EDITORIAL_EXCLUSIONS_V6 = Object.freeze([...EDITORIAL_EXCLUSIONS_V5, Object.freeze({
  "cik": "0001173420",
  "tag": "Revenues",
  "source_sha256": "c6092072b21975cc099fba2207ffbab40fdcebcd5870eae67492e8b8dd860db0",
  "reason": "The inspected filing links this revenue-tagged zero to a statement about no realized revenue from its principal asset, Donlin Gold. It does not establish a company-wide revenue total. This generic revenue history is omitted; original source data remain available.",
  "filing_url": "https://www.sec.gov/Archives/edgar/data/1173420/000117184326000374/ng20251130_10k.htm"
})]);
