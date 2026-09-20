import { EDITORIAL_EXCLUSIONS_V18, EDITORIAL_OBSERVATION_EXCLUSIONS_V18 } from './company-editorial-v18.mjs';
export const EDITORIAL_POLICY_V19 = 'extended-v19';
export const EDITORIAL_EXCLUSIONS_V19 = EDITORIAL_EXCLUSIONS_V18;
export const EDITORIAL_OBSERVATION_EXCLUSIONS_V19 = Object.freeze([
  ...EDITORIAL_OBSERVATION_EXCLUSIONS_V18,
  ...[
  {
    "cik": "0001484612",
    "tag": "WeightedAverageNumberOfDilutedSharesOutstanding",
    "source_sha256": "02af597b3235cdde453b8e191f935ab9286843fac1669b188d8e36c1d501f70c",
    "observation": {
      "start": "2023-01-01",
      "end": "2023-12-31",
      "val": 3305,
      "unit": "shares",
      "accn": "0001193125-26-051278"
    },
    "reason": "This weighted-average share observation is withheld because the original statement labels share counts in thousands, while its inline tag omits the scale attribute and encodes the displayed count in unit shares. The conflicting source presentation is retained; no multiplication, replacement value or split adjustment has been applied.",
    "filing_url": "https://www.sec.gov/Archives/edgar/data/1484612/000119312526051278/om-20251231.htm",
    "scope_state": "WITHDRAWN_BY_V19_OBSERVATION_HOLD"
  },
  {
    "cik": "0001484612",
    "tag": "WeightedAverageNumberOfDilutedSharesOutstanding",
    "source_sha256": "02af597b3235cdde453b8e191f935ab9286843fac1669b188d8e36c1d501f70c",
    "observation": {
      "start": "2024-01-01",
      "end": "2024-12-31",
      "val": 3463,
      "unit": "shares",
      "accn": "0001193125-26-051278"
    },
    "reason": "This weighted-average share observation is withheld because the original statement labels share counts in thousands, while its inline tag omits the scale attribute and encodes the displayed count in unit shares. The conflicting source presentation is retained; no multiplication, replacement value or split adjustment has been applied.",
    "filing_url": "https://www.sec.gov/Archives/edgar/data/1484612/000119312526051278/om-20251231.htm",
    "scope_state": "WITHDRAWN_BY_V19_OBSERVATION_HOLD"
  },
  {
    "cik": "0001484612",
    "tag": "WeightedAverageNumberOfDilutedSharesOutstanding",
    "source_sha256": "02af597b3235cdde453b8e191f935ab9286843fac1669b188d8e36c1d501f70c",
    "observation": {
      "start": "2025-01-01",
      "end": "2025-12-31",
      "val": 15211,
      "unit": "shares",
      "accn": "0001193125-26-051278"
    },
    "reason": "This weighted-average share observation is withheld because the original statement labels share counts in thousands, while its inline tag omits the scale attribute and encodes the displayed count in unit shares. The conflicting source presentation is retained; no multiplication, replacement value or split adjustment has been applied.",
    "filing_url": "https://www.sec.gov/Archives/edgar/data/1484612/000119312526051278/om-20251231.htm",
    "scope_state": "WITHDRAWN_BY_V19_OBSERVATION_HOLD"
  },
  {
    "cik": "0001484612",
    "tag": "WeightedAverageNumberOfSharesOutstandingBasic",
    "source_sha256": "02af597b3235cdde453b8e191f935ab9286843fac1669b188d8e36c1d501f70c",
    "observation": {
      "start": "2023-01-01",
      "end": "2023-12-31",
      "val": 3305,
      "unit": "shares",
      "accn": "0001193125-26-051278"
    },
    "reason": "This weighted-average share observation is withheld because the original statement labels share counts in thousands, while its inline tag omits the scale attribute and encodes the displayed count in unit shares. The conflicting source presentation is retained; no multiplication, replacement value or split adjustment has been applied.",
    "filing_url": "https://www.sec.gov/Archives/edgar/data/1484612/000119312526051278/om-20251231.htm",
    "scope_state": "WITHDRAWN_BY_V19_OBSERVATION_HOLD"
  },
  {
    "cik": "0001484612",
    "tag": "WeightedAverageNumberOfSharesOutstandingBasic",
    "source_sha256": "02af597b3235cdde453b8e191f935ab9286843fac1669b188d8e36c1d501f70c",
    "observation": {
      "start": "2024-01-01",
      "end": "2024-12-31",
      "val": 3463,
      "unit": "shares",
      "accn": "0001193125-26-051278"
    },
    "reason": "This weighted-average share observation is withheld because the original statement labels share counts in thousands, while its inline tag omits the scale attribute and encodes the displayed count in unit shares. The conflicting source presentation is retained; no multiplication, replacement value or split adjustment has been applied.",
    "filing_url": "https://www.sec.gov/Archives/edgar/data/1484612/000119312526051278/om-20251231.htm",
    "scope_state": "WITHDRAWN_BY_V19_OBSERVATION_HOLD"
  },
  {
    "cik": "0001484612",
    "tag": "WeightedAverageNumberOfSharesOutstandingBasic",
    "source_sha256": "02af597b3235cdde453b8e191f935ab9286843fac1669b188d8e36c1d501f70c",
    "observation": {
      "start": "2025-01-01",
      "end": "2025-12-31",
      "val": 15211,
      "unit": "shares",
      "accn": "0001193125-26-051278"
    },
    "reason": "This weighted-average share observation is withheld because the original statement labels share counts in thousands, while its inline tag omits the scale attribute and encodes the displayed count in unit shares. The conflicting source presentation is retained; no multiplication, replacement value or split adjustment has been applied.",
    "filing_url": "https://www.sec.gov/Archives/edgar/data/1484612/000119312526051278/om-20251231.htm",
    "scope_state": "WITHDRAWN_BY_V19_OBSERVATION_HOLD"
  }
].map(row => Object.freeze({ ...row, observation: Object.freeze(row.observation) })),
]);
