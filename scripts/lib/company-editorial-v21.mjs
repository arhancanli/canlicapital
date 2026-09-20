import { EDITORIAL_EXCLUSIONS_V20, EDITORIAL_OBSERVATION_EXCLUSIONS_V20 } from './company-editorial-v20.mjs';
export const EDITORIAL_POLICY_V21 = 'extended-v21';
export const EDITORIAL_EXCLUSIONS_V21 = EDITORIAL_EXCLUSIONS_V20;
export const EDITORIAL_OBSERVATION_EXCLUSIONS_V21 = Object.freeze([
  ...EDITORIAL_OBSERVATION_EXCLUSIONS_V20,
  ...[
  {
    "cik": "0001417926",
    "tag": "WeightedAverageNumberOfSharesOutstandingBasic",
    "source_sha256": "685ad9dc506bdfe829560566a030c772be69de24616cba6e2a255a48eadc071b",
    "observation": {
      "start": "2014-01-01",
      "end": "2014-12-31",
      "val": 112672160,
      "unit": "shares",
      "accn": "0001185185-17-000595"
    },
    "reason": "These 2014 INVO weighted-average shares are withheld because the main statement reports 112,672,160 while the per-share note reports 112,670,160 for the same annual period. The source disagreement is retained; neither number is substituted or treated as a rounding correction.",
    "filing_url": "https://www.sec.gov/Archives/edgar/data/1417926/000118518517000595/invobioscience10k123115.htm",
    "scope_state": "WITHDRAWN_BY_V21_OBSERVATION_HOLD"
  },
  {
    "cik": "0001417926",
    "tag": "WeightedAverageNumberOfDilutedSharesOutstanding",
    "source_sha256": "685ad9dc506bdfe829560566a030c772be69de24616cba6e2a255a48eadc071b",
    "observation": {
      "start": "2014-01-01",
      "end": "2014-12-31",
      "val": 112672160,
      "unit": "shares",
      "accn": "0001185185-17-000595"
    },
    "reason": "These 2014 INVO weighted-average shares are withheld because the main statement reports 112,672,160 while the per-share note reports 112,670,160 for the same annual period. The source disagreement is retained; neither number is substituted or treated as a rounding correction.",
    "filing_url": "https://www.sec.gov/Archives/edgar/data/1417926/000118518517000595/invobioscience10k123115.htm",
    "scope_state": "WITHDRAWN_BY_V21_OBSERVATION_HOLD"
  }
]
]);
