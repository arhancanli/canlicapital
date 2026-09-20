# Source-bound editorial regression fixture

`dbmm-reviewed-source.json.gz` preserves the exact captured SEC companyfacts response
for CIK0001127475. Uncompressed SHA-256:
`1d83049f899cbff9a062f8d19500599a1f079e18e925526b11f1306ca7a36021`.
Source: https://data.sec.gov/api/xbrl/companyfacts/CIK0001127475.json
Captured: 2026-09-20T07:40:37.958Z.

The compressed bytes are copied unchanged from the retained fourth-cohort capture.
The fixture tests an exact observation holdback, preservation of all other values,
prior-policy reproduction, changed-source rejection and visible reporting gaps.
It is historical captured evidence, not a current-source or publication claim.

`hno-reviewed-source.json.gz` retains the exact HNO Company Facts response from
https://data.sec.gov/api/xbrl/companyfacts/CIK0001342916.json captured at
2026-09-20T07:54:29.633Z. Uncompressed SHA256:
`04f062ef5e20caad0e3d8bf8913f2790f3550faf496fbcc8e4266d8eb14abe28`.
This fixed historical fixture tests the source-bound v12 operating-loss exclusion;
it is not a claim about the current upstream response.
