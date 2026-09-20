import { EDITORIAL_EXCLUSIONS } from './company-editorial-dispositions.mjs';
export const EDITORIAL_POLICY_V3 = 'extended-v3';
// Preserve v2 decisions unchanged; reviewed source scopes are versioned.
export const EDITORIAL_EXCLUSIONS_V3 = Object.freeze([...EDITORIAL_EXCLUSIONS, ...[
  {
    "cik": "0000818479",
    "tag": "Revenues",
    "source_sha256": "f6c1bd37486e91a38a99cf9ec5d3b97006986f8446a04bec87caec0cbf411fb5",
    "filing_url": "https://www.sec.gov/Archives/edgar/data/818479/000081847917000007/dentsplysirona201610-k.htm",
    "reason": "The inspected filing labels these selected values as intersegment net sales, not company-wide revenue. This generic revenue history is omitted; original source data remain available."
  },
  {
    "cik": "0001227654",
    "tag": "Revenues",
    "source_sha256": "e35c63d958ef9b086a4a3940b05df1180411e5e375b2a0bd4518328b58fcc764",
    "filing_url": "https://www.sec.gov/Archives/edgar/data/1227654/000114036114009227/form10k.htm",
    "reason": "The inspected filing labels these selected values as intersegment sales, not company-wide revenue. This generic revenue history is omitted; original source data remain available."
  },
  {
    "cik": "0000724445",
    "tag": "Revenues",
    "source_sha256": "280fe93908eb6d3bca8df7351a6ce86b0d12e15fb5a41d56bd44784f717cff04",
    "filing_url": "https://www.sec.gov/Archives/edgar/data/724445/000155837025008021/bzyr-20250228x10k.htm",
    "reason": "The inspected filing uses these revenue-tagged values in a statement about historical earnings and deferred tax assets. That does not establish company-wide revenue. This history is omitted; original source data remain available."
  },
  {
    "cik": "0001068689",
    "tag": "CashAndCashEquivalentsAtCarryingValue",
    "source_sha256": "410b5d6f7c09ea51f2d93e0126b94d32896605cae1ac3cab61be79ac2eeeb2ce",
    "filing_url": "https://www.sec.gov/Archives/edgar/data/1068689/000149315226016943/form10-k.htm",
    "reason": "The inspected filing uses these selected zeros for cash equivalents alone, while its balance sheet reports nonzero cash. This history is omitted as a combined cash-and-equivalents measure; original source data remain available."
  },
  {
    "cik": "0000315545",
    "tag": "Revenues",
    "source_sha256": "5c46f06a9f23badc21fb49ef63f53fb89ac39f7570babcbf8a64cddf67fb05d2",
    "filing_url": "https://www.sec.gov/Archives/edgar/data/315545/000119312516523701/d105545d10k.htm",
    "reason": "The inspected filing labels these facts as material revenue and describes an absence of substantial revenue. That does not establish zero total revenue. This generic revenue history is omitted; original source data remain available."
  }
].map(Object.freeze)]);
