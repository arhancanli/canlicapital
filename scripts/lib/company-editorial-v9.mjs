import { EDITORIAL_EXCLUSIONS_V8 } from './company-editorial-v8.mjs';
export const EDITORIAL_POLICY_V9 = 'extended-v9';
// Withhold an unresolved income/revenue interpretation without changing source values.
export const EDITORIAL_EXCLUSIONS_V9 = Object.freeze([...EDITORIAL_EXCLUSIONS_V8, Object.freeze({
  "cik": "0001145604",
  "tag": "Revenues",
  "source_sha256": "72455d4e19d0f82286a99d0fa349659ab1ab793431c0cac82c5fb18286c89242",
  "reason": "The inspected filing tags a statement about no income as revenue. That wording does not clearly establish total revenue. This history is withheld pending an unambiguous source; original source data remain available.",
  "filing_url": "https://www.sec.gov/Archives/edgar/data/1145604/000182646625000030/form-10k.htm"
})]);
