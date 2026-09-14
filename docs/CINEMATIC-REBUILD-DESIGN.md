# Canli Capital / full cinematic rebuild

Delivery status and final evidence: [September 9 release candidate](RELEASE-CANDIDATE-2026-09-09.md).
This document records the art-direction brief; the handoff is authoritative for
the delivered 96-frame instrument, current type system, Figma and release gates.

## Brief

User rejected the incremental preview. Rebuild the entire landing experience in the spirit of United Carriers: high-quality original rendered imagery, large asymmetric typography, alternating light/dark environments, a connected motion story, editorial research presentation, deliberate mobile layout, and a complete footer. Preserve the existing public research routes, data contracts, calculators and developer API.

## Subject and job

Subject: ALPHAC, an independently built systematic research engine running on paper. Audience: researchers inspecting the work and developers validating their own inputs. Job: make the engine understandable and lead to inspectable strategies or developer onboarding. Never suggest funded trading, independently audited performance or guaranteed improvements.

## Design direction

Palette primitives: carbon #060709, white #ffffff, paper #f3f4f2, ink #131619, blue #173fe5, copper #e58e50. Three-layer CSS tokens map these into surface/text/action/component roles. Typography: Bricolage Grotesque display, Inter body, IBM Plex Mono utility. Full-width scenes, internal alignment, compact pill actions, thin rules, and oversized uppercase headings. No generic metric-tile hero.

Signature: an original optical research instrument, made of titanium and sapphire glass. The closed sphere establishes the engine, an exploded assembly opens the research process, and an internal optical junction introduces developer access. All generated imagery is conceptual, not real hardware or data. Actual strategy results remain conventional source-bound charts.

Layout alternatives reviewed:

```
Rejected incremental layout: [headline | wireframe curves] -> repeated panels
Selected complete journey:  [full-bleed instrument + type]
                            [white editorial introduction]
                            [opened assembly / 3-stage scroll story]
                            [dark strategy register]
                            [white observed record]
                            [optical junction / API]
                            [editorial research / accountability]
                            [expandable full evidence]
                            [FAQ / contact / white mega-footer]
```

The reference's moving freight object becomes a recurring optical instrument. Do not reuse its photos, logo, typeface files, award ribbon, testimonials or claims. Do not mistake a crossfade or image pan for generated video.

## Motion and resilience

Use GSAP ScrollTrigger for controlled image reframing, the three-stage process track and modest heading reveals. No artificial loader, forced snapping, custom scroll container or scroll-blocking interaction. Disable scroll pinning and transforms for reduced motion and small screens. Keep all real content in HTML, including the complete evidence disclosure. Anchors into that disclosure must expand it automatically when JavaScript is available. Native disclosure remains usable without JavaScript.

## Scope across pages

Homepage receives a new composition throughout. Shared navigation, footer, type and surface tokens apply across all pages. Systems, performance, research and developer entrances receive matching art direction while retaining their original functional content. Research articles and records remain readable documents, not full-screen advertisements.

## Asset generation and capability boundary

Use built-in OpenAI image generation for three original final raster assets. Save originals in the project, create optimized web copies, and record prompts and source paths. No connected Sora/video tool or OPENAI_API_KEY was available at the initial check. No connected Codex document session was available for a separate ChatGPT Design app. User was asked asynchronously to identify that app and configure video access locally. Do not claim either service was used until it actually was.

## Acceptance

Inspect desktop and mobile screenshots of every primary section. Test reduced motion, no JavaScript, native FAQ keyboard activation, menu, anchor navigation, paper curve switching, developer CTA and mocked API onboarding. Build and preserve page count, route discovery, published-number audit and API regression tests. Keep work in the isolated preview checkout; do not overwrite newer evidence in the publishing checkout or deploy without a separate deployment instruction.
