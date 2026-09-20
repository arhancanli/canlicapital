import { EDITORIAL_EXCLUSIONS_V14, EDITORIAL_OBSERVATION_EXCLUSIONS_V14 } from './company-editorial-v14.mjs';
export const EDITORIAL_POLICY_V15 = 'extended-v15';
export const EDITORIAL_EXCLUSIONS_V15 = EDITORIAL_EXCLUSIONS_V14;
export const EDITORIAL_OBSERVATION_EXCLUSIONS_V15 = Object.freeze([
  ...EDITORIAL_OBSERVATION_EXCLUSIONS_V14,
  Object.freeze({
    cik: '0001280452', tag: 'Revenues',
    source_sha256: 'd113f0b9ecf74dfae04a49933d00e71a4eafe0e40dfc94318f978ceace1d4e92',
    observation: Object.freeze({ start: '2012-01-01', end: '2012-12-31', val: 213813000, unit: 'AFN', accn: '0001437749-14-003761' }),
    reason: 'This 2012 revenue observation is withheld because the original XBRL labels it as AFN while the primary statement presents dollars and discloses U.S.-dollar sales. The conflicting currency unit has not been relabeled or converted. Original source data and other selected periods and units are retained.',
    filing_url: 'https://www.sec.gov/Archives/edgar/data/1280452/000143774914003761/mpwr20131231_10k.htm',
  }),
  Object.freeze({
    cik: '0001659494', tag: 'CashAndCashEquivalentsAtCarryingValue',
    source_sha256: '300e06a2494a7386b302429ecbcaee1af90c378c99fdaaef846b0fecb90003e3',
    observation: Object.freeze({ end: '2025-12-31', val: 54062000, unit: 'SAR', accn: '0001104659-26-047273' }),
    reason: 'This SAR observation is withheld from the consolidated cash and cash equivalents history because the filing describes only SAR-denominated cash, cash equivalents and time deposits, approximately 36.9% of the total. The disclosed currency is supported, but the amount has a different scope. Original source data and other selected periods and units are retained without conversion.',
    filing_url: 'https://www.sec.gov/Archives/edgar/data/1659494/000110465926047273/coe-20251231x20f.htm',
  }),
]);
