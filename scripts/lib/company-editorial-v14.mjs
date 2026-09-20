import { EDITORIAL_EXCLUSIONS_V13, EDITORIAL_OBSERVATION_EXCLUSIONS_V13 } from './company-editorial-v13.mjs';
export const EDITORIAL_POLICY_V14 = 'extended-v14';
export const EDITORIAL_EXCLUSIONS_V14 = EDITORIAL_EXCLUSIONS_V13;
export const EDITORIAL_OBSERVATION_EXCLUSIONS_V14 = Object.freeze([
  ...EDITORIAL_OBSERVATION_EXCLUSIONS_V13,
  ...['EarningsPerShareBasic', 'EarningsPerShareDiluted'].flatMap(tag =>
    [[2019, -0.87], [2020, -1], [2021, -1.11]].map(([year, val]) => Object.freeze({
      cik: '0001361113', tag,
      source_sha256: '5c7576b0fa53ccb95eac41b4bb2859484614b21a670c8a3b610da2be91cacc8a',
      observation: Object.freeze({ start: `${year}-01-01`, end: `${year}-12-31`, val, unit: 'AFN/shares', accn: '0001628280-22-002017' }),
      reason: 'This EPS observation is withheld because the filing tags it as AFN per share while stating that its financial statements use U.S. dollars. The conflicting currency unit has not been relabeled or converted. Original source data and other selected periods and units are retained.',
      filing_url: 'https://www.sec.gov/Archives/edgar/data/1361113/000162828022002017/vrns-20211231.htm',
    }))),
]);
