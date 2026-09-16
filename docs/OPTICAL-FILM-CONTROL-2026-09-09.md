# Optical film playback checkpoint

The preceding turn made progress on editable Figma mobile layouts. This turn checked media loading and found that the developer chapter's pause label assumed autoplay succeeded.

The extracted controller now derives the label from actual media state. Autoplay refusal stops automatic retries until an explicit request. User pause survives scene re-entry. Offscreen and hidden-document playback pauses; teardown removes the source. Save-data does not fetch the film automatically, but explicit playback is available. No image resolution was reduced: the artwork can occupy a large high-density display area.

Verification:

- `npm run test:optical-film`: three lifecycle tests covering refused autoplay, save-data and persistent pause/teardown.
- Built-preview Chromium and WebKit: deliberately rejected first autoplay, verified Play label, successful user retry and subsequent pause.
- Production build passed.

The webapp-testing skill informed browser verification. These are targeted media checks, not evidence of complete cinematic design parity. The existing native 1920 × 1080 film and original artwork are unchanged. Full mobile Figma authoring remains unfinished.
