# What Died This Week

Covering the seven days ending 2026-09-06 [public/paper-state.json#transparency].

## Transparency chain

129 new signed entries were appended in this window, sequence 614 through 742, dated 2026-08-31, 2026-09-01, 2026-09-02, 2026-09-03, 2026-09-04, 2026-09-05 [public/glassbox/transparency_log.json#entries].

5 OpenTimestamps anchors were checkpointed in this window: seq 719 (pending), seq 702 (bitcoin, block 965385), seq 683 (bitcoin, block 965232), seq 661 (bitcoin, block 965093), seq 636 (bitcoin, block 964946) [public/glassbox/ots/anchors.json#anchors].

## Corrections and updates

- CORRECTION 2026-09-05: the crypto sleeve did not rebalance for five weeks, and the cause was our plumbing, not the market. Its weekly rebalance failed on 2026-08-13, 2026-08-20,... [public/paper-state.json#transparency]
- UPDATE 2026-09-06: the universe refresh named in the correction above is now wired into the live loop, through the same asset-class-scoped builder the research rebuild uses, with... [public/paper-state.json#transparency]
- UPDATE 2026-09-06: the sizing overlay's realized-volatility leg, which the ladder note above said was also lost by the per-cycle process, is restored: each cycle now records the... [public/paper-state.json#transparency]

## Trial ledger

No new hypothesis identities were recorded in the trial ledger in this window [public/glassbox/trial_ledger.json#recent_hypothesis_identities].

For reference, the kill log currently totals 9 killed at the deployed gauntlet, 37 killed at screen, and 3 survivors [public/glassbox/kill_log.json]. kill_log.json carries no per-kill date, so this generator cannot establish which, if any, of these are new to this window.

## Arrivals reading

Arrivals reading unavailable: scripts/report-arrivals.mjs is not present in this checkout.

## This is a paper record

This is a paper record. No real capital is deployed here, and nothing in this draft is a performance claim or a forecast. Every number above is a measurement taken from the repository's own glass-box artifacts and cited in brackets beside it. This draft is a proposal for the owner to read, edit, or discard; it is never posted anywhere automatically.

- [ ] every number above cites its artifact
