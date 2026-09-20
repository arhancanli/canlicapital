import { EDITORIAL_EXCLUSIONS_V12, EDITORIAL_OBSERVATION_EXCLUSIONS_V12 } from './company-editorial-v12.mjs';
export const EDITORIAL_POLICY_V13 = 'extended-v13';
export const EDITORIAL_EXCLUSIONS_V13 = EDITORIAL_EXCLUSIONS_V12;
export const EDITORIAL_OBSERVATION_EXCLUSIONS_V13 = Object.freeze([
  ...EDITORIAL_OBSERVATION_EXCLUSIONS_V12,
  ...['Liabilities', 'LiabilitiesCurrent'].map(tag => Object.freeze({
    cik: '0001062506', tag,
    source_sha256: 'b6982eca52afbce436eed50540a757170b57c33a9b39cd6eb182ff42d4f267d8',
    observation: Object.freeze({ end: '2023-12-31', val: 5253160, unit: 'USD', accn: '0001548123-25-000017' }),
    reason: 'The December 31, 2023 liability total is withheld because the selected filing displays components totaling $5,271,160 alongside a reported total of $5,253,160. The related-party note amount differs from the earlier filing. This inconsistency remains unresolved; original source data is retained and no calculated replacement has been substituted.',
    filing_url: 'https://www.sec.gov/Archives/edgar/data/1062506/000154812325000017/alda10k123124.htm',
  })),
]);
