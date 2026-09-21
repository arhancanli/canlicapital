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

PR156 merged as0e137bad49183089b1543b2e80e0f4ceda365f41 after all four
CI35555389095 checks passed at9ac8042c6d0ee1ac5e8e85c39c5ca7ca661195d0.
Tested and merged tree031af7c4dedc69ae24cda34b9aa38845c630be27 verified.
Current branch: evidence/fuwei-sutro-history-20260921. Previous turn advanced24
observations and published three filing reviews.

Sutro's selected2022/23 observations come from the2024 annual filing; selected
2024/25 observations come from the2025 filing. Both use dollar thousands/full
shares and disclose loss-period exclusion of options, RSUs, warrants and ESPP.
The newer filing retrospectively applies a1-for10 reverse split, reflected in
trading December3,2025, with fractional shares rounded up. Separate source-bound
notes retain the different historical bases without automatically rescaling older
observations or approving the unused2024 column of the older filing.
company-share-context-sutro-20260921.json validates16 observations across two
filings with unchanged v7 and reproduces byte-for-byte.

Fuwei's selected eight EPS observations cover2019-2021 RMB and2021 USD. The USD
column is a convenience translation at RMB6.3726/USD1, not another period; its
filing reflects a2016 one-for4 split. Generic replay67359 stopped because diluted
facts are hidden outside the statement. Initial combined spec retained verbatim:
corpus-local/company-batch2-fuwei-sutro-initial-spec-20260921.json,
SHAd826ecee3fe4290c0504c525cbc2abe46e86cf9e35314bd7754abb4227e43089.

Source-specific pending report company-fuwei-hidden-eps-pending-20260921.json
retains eight visible basic facts from statement/EPS note and ten matching hidden
diluted facts with contexts/units. No explicit SEC hidden DOM links connect them
to the reviewed rows. Duplicate semantic hidden facts and matching numbers alone
do not establish a particular mapping or absent-dilution cause. Fuwei stays
pending with no reader note/registration. Primary SHA
b6a021ab0d2a6e6247798b172b4b3958dda62fbfeb2f5fb170380cd028296fbc;
source SHA461f36cc6d22580f4ee7d58898461755a8d1baad4071d4307af62cc9ae0a887c.
Initial pending runner rejected a basic fact from the separate quarterly table;
retained corpus-local/company-fuwei-initial-runner-20260921.py.gz, raw SHA
3273e1b4987d21d8ae3544cb073cb63b83888c57fd315bf62894b7d92222d558.
Corrected runner excludes other visible tables while requiring exact reviewed
visible-basic or hidden-diluted identity; shared locator and admission guards unchanged.
Pending report/replay4078 byte-identical,terminal0.

Batch2 ledger scope-v22 now448 reviewed /352 pending /0 withdrawn,64 presentation-only.
Exactly16 Sutro state/evidence changes; all800 observation metadata and prior432
decisions preserved. Fuwei's eight remain pending.92 renderer/numerics/scope tests
pass, including rejection of all nine pending reports as approved. No source value,
selector policy or runtime-object change. Batch2 ledger version v22 is separate
from the unchanged runtime release v22.

Current notes need later release checks/archive coverage. Last completed browser
covers scope-v20 (940 cases/1,020 note-source checks), not scope-v21/22 additions.
Scope-v20 archive remains674 files/30 reports,seven historical pending reports;
Myomo/Fuwei and newer notes need later coverage. Prior full HTTP covers90,732
candidate pages/6,646 downloads. No running audit to restart.

Recovery79720 active; receipt6653 verified objects,0 failures,incomplete.
Original44227 terminal520 and all prior failures retained. Same bounded policy,
plan and uploader; no additive upload count or restart. No production deployment
or new indexing evidence;90,732 candidates unpublished, last confirmed indexed262.
Next publish these reviews, continue pending contexts and hosted readiness.
All original indexing/quality/SEO/intent/developer-adoption/governed-engine goals
remain active. Owner attribution file untouched.
