# Optical hero v2 / provenance

Mode: built-in OpenAI image generation, not CLI. Native output: 1672 × 941px;
the tool did not deliver the requested 3840 × 2160. Do not describe this as 4K.
Versioned workspace copy: public/cinema/optical-hero-v2.png. Original retained.
This is a visual-direction asset for review; a high-DPI final master is still a
separate quality gate. No upscaling is presented as additional native detail.

## Subsequent native-resolution study

The selected hero is now `public/cinema/optical-master-v3.webp`, a native
3840 × 3840 original Blender render, not an enlargement of the AI output.
`public/cinema/optical-master-v3-1536.webp` is its downsampled responsive derivative.
Reproducible source: `scripts/render-optical-master.py`; scene and lossless master:
`artifacts/production/optical-master-v3/`. The AI image remains a versioned art
exploration; it is not falsely described as the source pixels of the native render.
First native study retained under optical-master-v2; its broad front softbox
reflections were rejected. V3 changes the studio lighting to narrow grazing strips.

## Exact generation prompt

Use case: stylized-concept. Asset type: high-resolution cinematic website hero background for Canli Capital, independent systematic trading research. Create an original, exceptionally precise photorealistic optical-glass sculpture, NOT a website mockup. Landscape 3840x2160 composition if supported. Deep pure black studio background. One enormous spherical optical instrument occupies the rightmost 62 percent of the frame, slightly cropped at the right edge; left 38 percent is uninterrupted pure black negative space for HTML typography. The sphere is formed from four closely aligned thick crystal-glass lens slices with exquisitely sharp beveled edges and a small precise copper filament passing through their transparent interiors. Three-quarter view, subtle diagonal axis. The outer silhouette reads as ONE beautiful sphere, not separate rings, not plumbing, not a turbine. Clear museum-grade polished borosilicate, smoked graphite interiors, delicate electric cobalt-blue refraction along the lower glass edges, one slender warm copper highlight at the upper edge, restrained silver-white studio reflections. Large readable surfaces with physically coherent reflections, razor-sharp material detail, rich deep blacks, subtle realistic imperfections; premium macro optical product photography using a large softbox. No heavy bloom, no fog, no particles, no noisy mechanical greebles, no roads, no maps, no planet, no stars, no text, no logos, no labels, no interface, no watermark. Keep the sphere's left boundary around 43 percent of the image width, center at 77 percent horizontal and 46 percent vertical. Object fills about 95 percent of image height. This is a conceptual visual for transparent research, not a literal trading device.
