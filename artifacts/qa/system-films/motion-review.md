# System films animation review

| Severity | Location | Finding | Standard | Resolution |
| --- | --- | --- | --- | --- |
| Medium | `js/home.js` viewport playback | A motion preference changed after page load did not unload media that was already playing. | Reduced motion must remove positional motion and remain responsive to the active user preference. | Resolved. The media-query change handler pauses playback, removes video sources, clears the native poster binding, and restores the static poster state. |
| Low | `scripts/build-system-film-state.mjs` broker rails | Artifact object order placed AlphaVintage before AlphaTrend, drifting from the public broker matrix. | Motion should preserve spatial and semantic consistency across related views. | Resolved. Sanitization now applies the fixed public rail order: AlphaMax, AlphaTrend, AlphaVintage. |
| Low | `tools/system-films/composition.js` grouped entrances | Broker, record, and metric stagger gaps exceeded 80 ms. | Decorative group staggers should stay between 30 and 80 ms so the sequence does not feel blocked or slow. | Resolved. Group gaps now use 65 to 80 ms. |
| Low | Homepage poster delivery | Native video poster attributes could request all three images before the below-fold section approached the viewport. | Explanatory motion must not degrade the primary page interaction or largest contentful paint. | Resolved. Posters are lazy images, and the native video poster is assigned only with the lazy media sources. |

## Verdict

Approve. Each composition uses one finite paused GSAP timeline, deterministic seeking, explicit entry states, purpose-specific easing, and transform or opacity motion. The only continuous hold is a bounded five-second glow phase. There is no autonomous composition clock, random input, audio, infinite GSAP repeat, layout-property tween, `transition: all`, or `scale(0)` object entrance. Homepage playback is muted, user-pausable, viewport-bound, visibility-aware, and poster-only under reduced motion.
