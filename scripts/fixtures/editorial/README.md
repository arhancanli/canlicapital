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
