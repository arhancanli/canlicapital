import { EDITORIAL_EXCLUSIONS_V17, EDITORIAL_OBSERVATION_EXCLUSIONS_V17 } from './company-editorial-v17.mjs';
export const EDITORIAL_POLICY_V18 = 'extended-v18';
export const EDITORIAL_EXCLUSIONS_V18 = EDITORIAL_EXCLUSIONS_V17;
export const EDITORIAL_OBSERVATION_EXCLUSIONS_V18 = Object.freeze([
  ...EDITORIAL_OBSERVATION_EXCLUSIONS_V17,
  ...[
  {
    "cik": "0001425205",
    "tag": "WeightedAverageNumberOfDilutedSharesOutstanding",
    "source_sha256": "bb58496635d85ba57e1fe3f80d062d09fbf1db1b6d80eb6e8ba8eda9321f7680",
    "observation": {
      "start": "2023-01-01",
      "end": "2023-12-31",
      "val": 235131,
      "unit": "shares",
      "accn": "0001104659-26-018899"
    },
    "reason": "This weighted-average share observation is withheld because the original statement labels share counts in thousands, while its inline tag encodes the displayed count with scale zero and unit shares. The conflicting source presentation is retained; no multiplication, replacement value or tag correction has been applied.",
    "filing_url": "https://www.sec.gov/Archives/edgar/data/1425205/000110465926018899/iova-20251231x10k.htm",
    "scope_state": "WITHDRAWN_BY_V18_OBSERVATION_HOLD"
  },
  {
    "cik": "0001425205",
    "tag": "WeightedAverageNumberOfDilutedSharesOutstanding",
    "source_sha256": "bb58496635d85ba57e1fe3f80d062d09fbf1db1b6d80eb6e8ba8eda9321f7680",
    "observation": {
      "start": "2024-01-01",
      "end": "2024-12-31",
      "val": 289877,
      "unit": "shares",
      "accn": "0001104659-26-018899"
    },
    "reason": "This weighted-average share observation is withheld because the original statement labels share counts in thousands, while its inline tag encodes the displayed count with scale zero and unit shares. The conflicting source presentation is retained; no multiplication, replacement value or tag correction has been applied.",
    "filing_url": "https://www.sec.gov/Archives/edgar/data/1425205/000110465926018899/iova-20251231x10k.htm",
    "scope_state": "WITHDRAWN_BY_V18_OBSERVATION_HOLD"
  },
  {
    "cik": "0001425205",
    "tag": "WeightedAverageNumberOfDilutedSharesOutstanding",
    "source_sha256": "bb58496635d85ba57e1fe3f80d062d09fbf1db1b6d80eb6e8ba8eda9321f7680",
    "observation": {
      "start": "2025-01-01",
      "end": "2025-12-31",
      "val": 357345,
      "unit": "shares",
      "accn": "0001104659-26-018899"
    },
    "reason": "This weighted-average share observation is withheld because the original statement labels share counts in thousands, while its inline tag encodes the displayed count with scale zero and unit shares. The conflicting source presentation is retained; no multiplication, replacement value or tag correction has been applied.",
    "filing_url": "https://www.sec.gov/Archives/edgar/data/1425205/000110465926018899/iova-20251231x10k.htm",
    "scope_state": "WITHDRAWN_BY_V18_OBSERVATION_HOLD"
  },
  {
    "cik": "0001425205",
    "tag": "WeightedAverageNumberOfSharesOutstandingBasic",
    "source_sha256": "bb58496635d85ba57e1fe3f80d062d09fbf1db1b6d80eb6e8ba8eda9321f7680",
    "observation": {
      "start": "2023-01-01",
      "end": "2023-12-31",
      "val": 235131,
      "unit": "shares",
      "accn": "0001104659-26-018899"
    },
    "reason": "This weighted-average share observation is withheld because the original statement labels share counts in thousands, while its inline tag encodes the displayed count with scale zero and unit shares. The conflicting source presentation is retained; no multiplication, replacement value or tag correction has been applied.",
    "filing_url": "https://www.sec.gov/Archives/edgar/data/1425205/000110465926018899/iova-20251231x10k.htm",
    "scope_state": "WITHDRAWN_BY_V18_OBSERVATION_HOLD"
  },
  {
    "cik": "0001425205",
    "tag": "WeightedAverageNumberOfSharesOutstandingBasic",
    "source_sha256": "bb58496635d85ba57e1fe3f80d062d09fbf1db1b6d80eb6e8ba8eda9321f7680",
    "observation": {
      "start": "2024-01-01",
      "end": "2024-12-31",
      "val": 289877,
      "unit": "shares",
      "accn": "0001104659-26-018899"
    },
    "reason": "This weighted-average share observation is withheld because the original statement labels share counts in thousands, while its inline tag encodes the displayed count with scale zero and unit shares. The conflicting source presentation is retained; no multiplication, replacement value or tag correction has been applied.",
    "filing_url": "https://www.sec.gov/Archives/edgar/data/1425205/000110465926018899/iova-20251231x10k.htm",
    "scope_state": "WITHDRAWN_BY_V18_OBSERVATION_HOLD"
  },
  {
    "cik": "0001425205",
    "tag": "WeightedAverageNumberOfSharesOutstandingBasic",
    "source_sha256": "bb58496635d85ba57e1fe3f80d062d09fbf1db1b6d80eb6e8ba8eda9321f7680",
    "observation": {
      "start": "2025-01-01",
      "end": "2025-12-31",
      "val": 357345,
      "unit": "shares",
      "accn": "0001104659-26-018899"
    },
    "reason": "This weighted-average share observation is withheld because the original statement labels share counts in thousands, while its inline tag encodes the displayed count with scale zero and unit shares. The conflicting source presentation is retained; no multiplication, replacement value or tag correction has been applied.",
    "filing_url": "https://www.sec.gov/Archives/edgar/data/1425205/000110465926018899/iova-20251231x10k.htm",
    "scope_state": "WITHDRAWN_BY_V18_OBSERVATION_HOLD"
  }
].map(row => Object.freeze({ ...row, observation: Object.freeze(row.observation) })),
]);
