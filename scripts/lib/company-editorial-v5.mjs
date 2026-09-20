import { EDITORIAL_EXCLUSIONS_V4 } from './company-editorial-v4.mjs';
export const EDITORIAL_POLICY_V5 = 'extended-v5';
// Preserve previous policies and require renewed review for changed source bytes.
export const EDITORIAL_EXCLUSIONS_V5 = Object.freeze([...EDITORIAL_EXCLUSIONS_V4, ...[
  {
    "cik": "0001121795",
    "tag": "CashAndCashEquivalentsAtCarryingValue",
    "source_sha256": "d0880d260b2cbd749eb3ddd3ec3e13e9b8c031ee499cd66405d7ad6a4a75b503",
    "filing_url": "https://www.sec.gov/Archives/edgar/data/1121795/000155335022000798/ghst_10k.htm",
    "reason": "The inspected filing labels these zeros as cash equivalents alone, while its balance sheet reports nonzero cash. This combined cash-and-equivalents history is omitted; original source data remain available."
  },
  {
    "cik": "0001258602",
    "tag": "Revenues",
    "source_sha256": "b7808c49c80b34ceb4c93b8748e92c5873685487ebcbfca30fc34595b226ea6b",
    "filing_url": "https://www.sec.gov/Archives/edgar/data/1258602/000125860218000021/nni-123117x10k.htm",
    "reason": "The inspected filing labels these selected values as intersegment servicing revenue after eliminations, not company-wide revenue. This generic revenue history is omitted; original source data remain available."
  },
  {
    "cik": "0001320461",
    "tag": "Revenues",
    "source_sha256": "718c8a9b9efed44de17680904cfb988108d9eceea729986d8339add372af4ffa",
    "filing_url": "https://www.sec.gov/Archives/edgar/data/1320461/000132046124000034/cps-20231231.htm",
    "reason": "The inspected filing labels these selected zeros as intersegment sales after eliminations, while consolidated external sales are nonzero. This generic revenue history is omitted; original source data remain available."
  }
].map(Object.freeze)]);
