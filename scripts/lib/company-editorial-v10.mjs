import { EDITORIAL_EXCLUSIONS_V9 } from './company-editorial-v9.mjs';
export const EDITORIAL_POLICY_V10 = 'extended-v10';
// Preserve earlier policies and original values; this decision binds reviewed bytes.
export const EDITORIAL_EXCLUSIONS_V10 = Object.freeze([...EDITORIAL_EXCLUSIONS_V9, Object.freeze({
  cik: '0001873213',
  tag: 'SellingGeneralAndAdministrativeExpense',
  source_sha256: '5a80b98f6647292689a44fc77d6710d0cf6e139024389a056329f01c52b81c34',
  reason: 'The selected general and administrative expense history comes from segment tables that include depreciation reported separately in the consolidated income statement. This history is withheld to avoid presenting that combined amount as the distinct statement line. Operating expense totals and original source data remain available.',
  filing_url: 'https://www.sec.gov/Archives/edgar/data/1873213/000149315225017715/form10-k.htm',
})]);
