import { EDITORIAL_EXCLUSIONS_V19, EDITORIAL_OBSERVATION_EXCLUSIONS_V19 } from './company-editorial-v19.mjs';
export const EDITORIAL_POLICY_V20 = 'extended-v20';
export const EDITORIAL_EXCLUSIONS_V20 = EDITORIAL_EXCLUSIONS_V19;
export const EDITORIAL_OBSERVATION_EXCLUSIONS_V20 = Object.freeze([
  ...EDITORIAL_OBSERVATION_EXCLUSIONS_V19,
  ...[
  {
    "cik": "0001607962",
    "tag": "EarningsPerShareBasic",
    "source_sha256": "65d510c294653d7f3865b561279f8eb53c45e516643e1812cfe6330a41480012",
    "observation": {
      "start": "2021-01-01",
      "end": "2021-12-31",
      "val": -0.27,
      "unit": "ILS/shares",
      "accn": "0001178913-24-000730"
    },
    "reason": "This EPS observation is withheld because the historical ReWalk statement labels amounts in U.S. dollars but its inline fact encodes ILS per share. The source currency conflict is retained; no conversion, relabeling or replacement value has been applied.",
    "filing_url": "https://www.sec.gov/Archives/edgar/data/1607962/000117891324000730/zk2431037.htm",
    "scope_state": "WITHDRAWN_BY_V20_OBSERVATION_HOLD"
  },
  {
    "cik": "0001607962",
    "tag": "EarningsPerShareBasic",
    "source_sha256": "65d510c294653d7f3865b561279f8eb53c45e516643e1812cfe6330a41480012",
    "observation": {
      "start": "2022-01-01",
      "end": "2022-12-31",
      "val": -0.31,
      "unit": "ILS/shares",
      "accn": "0001178913-24-000730"
    },
    "reason": "This EPS observation is withheld because the historical ReWalk statement labels amounts in U.S. dollars but its inline fact encodes ILS per share. The source currency conflict is retained; no conversion, relabeling or replacement value has been applied.",
    "filing_url": "https://www.sec.gov/Archives/edgar/data/1607962/000117891324000730/zk2431037.htm",
    "scope_state": "WITHDRAWN_BY_V20_OBSERVATION_HOLD"
  },
  {
    "cik": "0001607962",
    "tag": "EarningsPerShareBasic",
    "source_sha256": "65d510c294653d7f3865b561279f8eb53c45e516643e1812cfe6330a41480012",
    "observation": {
      "start": "2023-01-01",
      "end": "2023-12-31",
      "val": -0.37,
      "unit": "ILS/shares",
      "accn": "0001178913-24-000730"
    },
    "reason": "This EPS observation is withheld because the historical ReWalk statement labels amounts in U.S. dollars but its inline fact encodes ILS per share. The source currency conflict is retained; no conversion, relabeling or replacement value has been applied.",
    "filing_url": "https://www.sec.gov/Archives/edgar/data/1607962/000117891324000730/zk2431037.htm",
    "scope_state": "WITHDRAWN_BY_V20_OBSERVATION_HOLD"
  },
  {
    "cik": "0001607962",
    "tag": "EarningsPerShareDiluted",
    "source_sha256": "65d510c294653d7f3865b561279f8eb53c45e516643e1812cfe6330a41480012",
    "observation": {
      "start": "2021-01-01",
      "end": "2021-12-31",
      "val": -0.27,
      "unit": "ILS/shares",
      "accn": "0001178913-24-000730"
    },
    "reason": "This EPS observation is withheld because the historical ReWalk statement labels amounts in U.S. dollars but its inline fact encodes ILS per share. The source currency conflict is retained; no conversion, relabeling or replacement value has been applied.",
    "filing_url": "https://www.sec.gov/Archives/edgar/data/1607962/000117891324000730/zk2431037.htm",
    "scope_state": "WITHDRAWN_BY_V20_OBSERVATION_HOLD"
  },
  {
    "cik": "0001607962",
    "tag": "EarningsPerShareDiluted",
    "source_sha256": "65d510c294653d7f3865b561279f8eb53c45e516643e1812cfe6330a41480012",
    "observation": {
      "start": "2022-01-01",
      "end": "2022-12-31",
      "val": -0.31,
      "unit": "ILS/shares",
      "accn": "0001178913-24-000730"
    },
    "reason": "This EPS observation is withheld because the historical ReWalk statement labels amounts in U.S. dollars but its inline fact encodes ILS per share. The source currency conflict is retained; no conversion, relabeling or replacement value has been applied.",
    "filing_url": "https://www.sec.gov/Archives/edgar/data/1607962/000117891324000730/zk2431037.htm",
    "scope_state": "WITHDRAWN_BY_V20_OBSERVATION_HOLD"
  },
  {
    "cik": "0001607962",
    "tag": "EarningsPerShareDiluted",
    "source_sha256": "65d510c294653d7f3865b561279f8eb53c45e516643e1812cfe6330a41480012",
    "observation": {
      "start": "2023-01-01",
      "end": "2023-12-31",
      "val": -0.37,
      "unit": "ILS/shares",
      "accn": "0001178913-24-000730"
    },
    "reason": "This EPS observation is withheld because the historical ReWalk statement labels amounts in U.S. dollars but its inline fact encodes ILS per share. The source currency conflict is retained; no conversion, relabeling or replacement value has been applied.",
    "filing_url": "https://www.sec.gov/Archives/edgar/data/1607962/000117891324000730/zk2431037.htm",
    "scope_state": "WITHDRAWN_BY_V20_OBSERVATION_HOLD"
  }
]
]);
