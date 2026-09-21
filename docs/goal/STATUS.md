# Current state

Updated September 21, 2026. Goal ACTIVE, NOT ACHIEVED. Codex implements directly;
Hermes delegation is stopped. All objectives and publication authorization remain
in REQUIREMENTS.md. EXECUTION_LEDGER.md covers every goal area.

Earlier checkpoints, frozen v22 runtime hashes, retained failures and detailed
baseline evidence are preserved in
[history/STATUS-20260921-before-scope-v19-release-checkpoint.md](history/STATUS-20260921-before-scope-v19-release-checkpoint.md).
Historical process states are not live telemetry. Verify actual files, PRs and
process handles before relying on any recorded state.

## Latest verified transition

The previous turn preserved Digital Ally's unresolved denominator and published
PR152. PR152 merged as1968be0c46468d4f8c1e8c9eb2f3d5c8ceea383e after all four
CI35553887300 checks passed atd144e388680dc0d1b750fa25c7792962e10cf3bb.
Tested and merged tree76f1c84b5c7a6a1f51bf3c7729e443a5a03b2bf4 matches.
Current branch: evidence/audioeye-larimar-context-20260921.

AudioEye's2024/25 statements display dollars and weighted-average shares in
thousands, with unscaled EPS. Selected share facts use scale3 and represent
11,888,000/12,416,000 shares. Full treasury-stock/loss-exclusion disclosure is
retained across its paragraph break. Potential common shares are excluded during
losses; no dilution cause inferred solely from matching numbers.

Larimar's2023/24 statements use dollar thousands but full shares. Prefunded
warrants were included in basic weighted-average shares before August11,2023
exercise, which issued628,403 common shares. Year-end options4,888,502/7,135,390
are excluded as anti-dilutive during losses, not added to the weighted denominator.
The basic-share paragraph and split diluted-loss paragraph are preserved in full.

Report company-share-context-audioeye-larimar-20260921.json uses the unchanged
v7 validator and replays byte-for-byte. Sixteen selected observations match exact
statement/entity/context/unit/scale facts. Scope-v20 now has408 reviewed /392 pending /
0 withdrawn, including64 presentation-only. Exactly16 state/evidence transitions;
all800 observation metadata and prior392 decisions preserved.90 renderer/ledger
tests pass: all10 affected paths, share scales, prefunded basic inclusion, loss
exclusions, unchanged data and removal after a selected observation changes.
No source correction, selector policy or runtime-object change.

Myomo inspected but not registered: one prefunded-warrant inclusion description
lists January2023/August2023 offering closings; another also lists January2024.
Both give3,763,258/7,061,519 outstanding at year-end2025/24 and a $0.0001 exercise
price. Issuance-date weighting remains to be resolved; no new approval or correction.
Seven discrepancy reports remain pending. New AudioEye/Larimar reader notes need
updated relevant release checks and later archive coverage; earlier scope-v19
checks/archive retain their pinned historical coverage. Runtime remains v22.

Recovery79720 polled live; latest 5027 reverified objects, zero failures, incomplete.
Same uploader/plan/bounded policy; original44227 remains terminal after6,023 verified
objects and HTTP520. Counts are not additive uploads. No production deployment or
new indexed-page evidence. Owner attribution file untouched. Next publish these
reviews, continue pending contexts and monitor hosted readiness. All original
indexing, quality/SEO/search-intent, developer-adoption and governed-engine goals
remain active.
