import { EDITORIAL_EXCLUSIONS_V7 } from './company-editorial-v7.mjs';
export const EDITORIAL_POLICY_V8 = 'extended-v8';
// Major-customer, materiality and product-sales claims do not prove total revenue.
export const EDITORIAL_EXCLUSIONS_V8 = Object.freeze([...EDITORIAL_EXCLUSIONS_V7, ...[
  {
    "cik": "0001551182",
    "tag": "Revenues",
    "source_sha256": "109482303c686ea9a3927143981559f7285115a0d15e7baa226d3c705c664e02",
    "reason": "The inspected filing labels these zeros as revenue from major customers and states that no customer exceeded 10% of sales. They do not describe total company revenue; consolidated net sales are nonzero. This generic revenue history is omitted; original source data remain available.",
    "filing_url": "https://www.sec.gov/Archives/edgar/data/1551182/000155118217000014/etn12312016form10-k.htm"
  },
  {
    "cik": "0001477845",
    "tag": "RevenueFromContractWithCustomerExcludingAssessedTax",
    "source_sha256": "5f46431864276f3b86ddd5f520f0f0d740cabb76d1da6c6eaa47ff48ee863f51",
    "reason": "The inspected filing tags a statement that the company has not generated substantial revenues. That qualification does not establish a zero total. This revenue history is omitted; original source data remain available.",
    "filing_url": "https://www.sec.gov/Archives/edgar/data/1477845/000110465926027751/anvs-20251231x10k.htm"
  },
  {
    "cik": "0001598646",
    "tag": "RevenueFromContractWithCustomerExcludingAssessedTax",
    "source_sha256": "7b57da641574943cc8f7ca81f9c94ea1ff7a872915407c01165fb2137ec7efc4",
    "reason": "The inspected filing tags a statement about no revenue from product sales. That narrower scope does not establish total revenue from contracts with customers. This revenue history is omitted; original source data remain available.",
    "filing_url": "https://www.sec.gov/Archives/edgar/data/1598646/000095017025026055/nerv-20241231.htm"
  }
].map(Object.freeze)]);
