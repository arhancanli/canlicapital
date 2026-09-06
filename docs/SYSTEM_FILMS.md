# Authentic system films

The homepage system films are deterministic renders of sanitized public evidence. They are not market footage, product mockups, or representations of funded trading.

## Evidence boundary

`scripts/build-system-film-state.mjs` reads three public artifacts and writes one narrow snapshot to `public/system-films/state.json`:

1. The trial ledger contributes research identity and immutable execution counts.
2. The Alpaca reconciliation contributes paper-only sleeve, position, order, and pass-state aggregates.
3. The transparency log contributes signed entry, disclosed payload, sequence, timestamp, and hash-prefix fields.

The sanitizer excludes account identifiers, holdings, tickers, account equity, credentials, and secret-shaped fields. Every film keeps the SHA-256 digest and timestamp of its source artifact.

## Render contract

Run `npm run films:render` to rebuild the state snapshot, seek three paused GSAP timelines frame by frame, and encode:

- one 12-second VP9 WebM per film;
- one 12-second H.264 MP4 fallback per film;
- one PNG poster per film;
- one manifest binding the outputs to the snapshot digest.

The renderer uses 1280 by 720 frames at 24 frames per second. It has no autonomous clock, random input, audio, or infinite animation. A rendered frame depends only on the selected film state and timeline time.

Run `npm run films:verify` to check durations, codecs, silence, file digests, transcripts, source bindings, lazy playback, reduced-motion gating, and deterministic composition constraints.

## Publication behavior

The homepage stores source paths in `data-src` attributes. JavaScript attaches them only when a card approaches the viewport. Reduced-motion visitors receive the poster and transcript without loading or autoplaying video. Every playing film has a pause control.

The commands are ready for a daily job. Daily scheduling is not claimed until the Foundry deployment records an installed schedule, successful runs, failure alerts, and output publication.
