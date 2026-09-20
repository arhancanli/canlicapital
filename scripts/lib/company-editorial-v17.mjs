import { EDITORIAL_EXCLUSIONS_V16, EDITORIAL_OBSERVATION_EXCLUSIONS_V16 } from './company-editorial-v16.mjs';
export const EDITORIAL_POLICY_V17 = 'extended-v17';
export const EDITORIAL_EXCLUSIONS_V17 = EDITORIAL_EXCLUSIONS_V16;
export const EDITORIAL_OBSERVATION_EXCLUSIONS_V17 = Object.freeze([
  ...EDITORIAL_OBSERVATION_EXCLUSIONS_V16,
  ...[[2024, 39951510], [2025, 40362780]].map(([year, val]) => Object.freeze({
    cik: '0000065596', tag: 'WeightedAverageNumberOfDilutedSharesOutstanding',
    source_sha256: 'daeca46d576d2ff5c72e9a029274ce4aed4a696365902d8ba9560911d4b7ee50',
    observation: Object.freeze({ start: `${year}-01-01`, end: `${year}-12-31`, val, unit: 'shares', accn: '0001213900-26-036500' }),
    reason: 'This diluted weighted-average share observation is withheld because the main statement combines basic and diluted denominators, while Note 19 reports a higher diluted total after adding unvested-share dilution for the same year. Equal rounded earnings per share do not establish equal denominators. The conflicting source presentations remain retained; no replacement value or tag correction has been applied.',
    filing_url: 'https://www.sec.gov/Archives/edgar/data/65596/000121390026036500/ea0281594-10k_siebert.htm',
  })),
]);
