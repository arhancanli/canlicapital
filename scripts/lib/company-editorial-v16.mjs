import { EDITORIAL_EXCLUSIONS_V15, EDITORIAL_OBSERVATION_EXCLUSIONS_V15 } from './company-editorial-v15.mjs';
export const EDITORIAL_POLICY_V16 = 'extended-v16';
export const EDITORIAL_EXCLUSIONS_V16 = EDITORIAL_EXCLUSIONS_V15;
export const EDITORIAL_OBSERVATION_EXCLUSIONS_V16 = Object.freeze([
  ...EDITORIAL_OBSERVATION_EXCLUSIONS_V15,
  ...['WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding'].flatMap(tag =>
    [2022, 2023, 2024, 2025].map(year => Object.freeze({
      cik: '0000059255', tag,
      source_sha256: '5a666016453d51aeb23f9f9129b08137b14135abcbd501441d79b5c477dd1f95',
      observation: Object.freeze({ start: `${year}-01-01`, end: `${year}-12-31`, val: 28.5, unit: 'shares', accn: year === 2022 ? '0001558370-25-002409' : '0001104659-26-025847' }),
      reason: 'This weighted-average share observation is withheld because the original filing tags 28.5 with unit shares and scale zero while the statement presents the figure in millions. The source-scale conflict has not been repaired by multiplying the value. After these exclusions, the remaining constant history does not meet the added-history publication criteria. Original source data and unrelated concepts are retained.',
      filing_url: year === 2022 ? 'https://www.sec.gov/Archives/edgar/data/59255/000155837025002409/vhl-20241231x10k.htm' : 'https://www.sec.gov/Archives/edgar/data/59255/000110465926025847/vhl-20251231x10k.htm',
    }))),
]);
