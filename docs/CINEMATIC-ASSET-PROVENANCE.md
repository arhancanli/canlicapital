# Original cinematic assets

These assets are conceptual illustrations, not trading hardware, architecture
schematics, observations, or evidence of investment performance.

## OpenAI image generation

Three original images were generated earlier in this design session with the
connected OpenAI image-generation tool. Original PNGs are retained in
`artifacts/generated/cinema/`. Optimized derivatives are in `public/cinema/`.

| Asset | Visual brief / role |
|---|---|
| engine-hero | Titanium and sapphire optical research instrument on black; hub/editorial imagery |
| engine-open | Exploded optical assembly on a light background; research/editorial imagery |
| engine-api | Close interior optical connections on black; developer chapter |

These are brief summaries, not claimed verbatim copies of the original prompts.
The images are not video. The connected toolset did not provide a verified OpenAI
video-generation workflow; no Sora output or subscription entitlement is claimed.

## Original Blender sequence

`scripts/build-alphac-instrument.py` creates the geometry, materials, camera and
lighting from scratch. Four sapphire bands open around a copper core, using the
same model throughout. Module names reflect the four current research strategies,
but the image does not encode their measured performance or actual infrastructure.

- Blender 4.5.13 LTS, Cycles, Metal GPU, AgX, 48 samples, transparent RGBA.
- 96 frames, 1280 × 800 master. Source model and GLB retained under
  `artifacts/production/instrument-sequence/`, not shipped to website visitors.
- `scripts/encode-instrument-sequence.py`: FFmpeg WebP encoding, quality 82;
  1280 × 800 desktop and 768 × 480 mobile variants.
- Both sets together: 9,461,582 bytes; 3 concurrent requests maximum and 20 decoded
  frames maximum at runtime. Static frames work without JavaScript/reduced motion.
- Frame fetch failures are not retried in a loop. Skipped-scroll work is deprioritized.

The closed and open proof frames were visually reviewed in two iterations before
the final render. This is rendered 3D animation, not AI-generated video.

## Typography

Chakra Petch Medium is locally served from `public/fonts/chakra-petch/` with its
SIL Open Font License. Download source: Google Fonts' official `ofl/chakrapetch`
directory. United Carriers' proprietary font and industrial assets were not copied.
Inter and IBM Plex Mono remain the site's existing reading/data fonts.
