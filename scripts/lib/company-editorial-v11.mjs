import { EDITORIAL_EXCLUSIONS_V10 } from './company-editorial-v10.mjs';
export const EDITORIAL_POLICY_V11 = 'extended-v11';
export const EDITORIAL_EXCLUSIONS_V11 = EDITORIAL_EXCLUSIONS_V10;
export const EDITORIAL_OBSERVATION_EXCLUSIONS_V11 = Object.freeze([Object.freeze({
  cik: '0001127475',
  tag: 'RevenueFromContractWithCustomerExcludingAssessedTax',
  source_sha256: '1d83049f899cbff9a062f8d19500599a1f079e18e925526b11f1306ca7a36021',
  observation: Object.freeze({ start: '2019-09-01', end: '2020-08-31', val: 268957, unit: 'USD', accn: '0001185185-21-001609' }),
  reason: 'The contract-revenue observation for the year ended August 31, 2020 is withheld because its XBRL period conflicts with the geographic disclosure, which describes 2019. The original response remains available. Statement revenue is a separate reported series; its value has not been substituted here.',
  filing_url: 'https://www.sec.gov/Archives/edgar/data/1127475/000118518521001609/dbmm20210831_10k.htm',
})]);
