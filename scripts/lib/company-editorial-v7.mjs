import { EDITORIAL_EXCLUSIONS_V6 } from './company-editorial-v6.mjs';
export const EDITORIAL_POLICY_V7 = 'extended-v7';
// Preserve prior snapshots; reviewed real-estate sales are not a company total.
export const EDITORIAL_EXCLUSIONS_V7 = Object.freeze([...EDITORIAL_EXCLUSIONS_V6, Object.freeze({
  "cik": "0001593549",
  "tag": "Revenues",
  "source_sha256": "5fc0541d3c667e8542c70da83b7f948b0510c21c26e4337ace0bb00d828406b9",
  "reason": "The inspected filing tags revenue from real-estate sales, rather than establishing a company-wide revenue total. This generic revenue history is omitted; original source data remain available.",
  "filing_url": "https://www.sec.gov/Archives/edgar/data/1593549/000149315226020899/form10-k.htm"
})]);
