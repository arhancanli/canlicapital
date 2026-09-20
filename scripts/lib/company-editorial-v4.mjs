import { EDITORIAL_EXCLUSIONS_V3 } from './company-editorial-v3.mjs';
export const EDITORIAL_POLICY_V4 = 'extended-v4';
// Earlier source-bound policies remain reproducible without this new exclusion.
export const EDITORIAL_EXCLUSIONS_V4 = Object.freeze([...EDITORIAL_EXCLUSIONS_V3, Object.freeze({
  "cik": "0001172178",
  "tag": "PaymentsToAcquirePropertyPlantAndEquipment",
  "source_sha256": "4915970839453514b4b5e641234178fd6f2c03d99ec5b6bdb74b786956db6290",
  "filing_url": "https://www.sec.gov/Archives/edgar/data/1172178/000149315221010343/form10-k.htm",
  "reason": "The inspected filing uses USD500 as the equipment capitalization threshold in an accounting-policy note, not annual equipment purchases. This spending history is omitted; original source data remain available."
})]);
