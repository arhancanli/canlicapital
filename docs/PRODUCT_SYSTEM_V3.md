# Canli Capital Product System v3

**Status:** Current implementation contract

**Owner:** Arhan Canli

**Applies to:** All product, research, trial, measurement, verification and archival presentation routes

**Supersedes on conflict:** `DESIGN_SYSTEM.md`, `LANDING_STRUCTURE_V2.md`, `LANDING_COPY_V2.md`, `LANDING10_MOTION.md` and page-specific legacy styling notes

## 1. Subject, audience and job

The subject is not a hedge fund and not a generic analytics dashboard. It is a prospective evidence
system for systematic trading.

The primary audience is a technically curious visitor who wants to decide whether an ALPHAC claim
is worth believing. Secondary audiences are quantitative researchers, potential reviewers, software
engineers and application readers evaluating Arhan Canli's work.

The homepage has one job: move a visitor from the thesis to inspectable current evidence in less
than ten seconds.

## 2. Design thesis

The interface should feel like entering an operating evidence instrument. It combines the spatial
confidence of advanced infrastructure products with the exact labeling of a scientific record.

The design must not resemble a trading terminal pasted onto a marketing template. It also must not
use generic particles, decorative market charts, fake order streams or anonymous data grids.

The single aesthetic risk is the Evidence Core. Everything around it is calm, legible and exact.

## 3. Signature: Evidence Core

The Evidence Core is a data-bound three-dimensional object that explains the Canli Capital method.
It is remembered because it turns the evidence lifecycle into space:

1. Trial identities enter as individually addressable nodes.
2. Frozen identities acquire a visible hash ring.
3. Killed trials recede but remain present in the union.
4. Admitted sleeves resolve into separate execution rails.
5. Broker marks enter the rails as observed pulses.
6. Signed public records lock into a central spine.

The object is not a logo animation. Every count, state and chapter label comes from the public claim
or Foundry status contracts.

## 4. Token system

### Color

```css
:root {
  --cc-night: #06111b;
  --cc-carbon: #0a1722;
  --cc-surface: #0f202d;
  --cc-chalk: #f3f8fb;
  --cc-muted: #91a8b6;
  --cc-line: rgba(173, 210, 229, 0.17);
  --cc-cobalt: #315cff;
  --cc-cyan: #66d6ff;
  --cc-mint: #58e0b5;
  --cc-amber: #f1b85b;
  --cc-red: #ff6f73;
}
```

Cobalt identifies action. Cyan identifies evidence movement. Mint identifies a passing verification.
Amber and red are state-only colors. They are never decorative accents.

### Typography

| Role | Family | Use |
|---|---|---|
| Display | Bricolage Grotesque | Thesis, section headlines and one-line statements |
| Body | Inter | Explanations, controls and navigation |
| Data | IBM Plex Mono | Values, hashes, timestamps, states and compact labels |

The display face carries personality through width and optical size. It is not applied to tables or
long paragraphs. Data values use tabular numerals where the browser and font support them.

### Type scale

```css
:root {
  --cc-type-hero: clamp(3.5rem, 8.8vw, 9.5rem);
  --cc-type-display: clamp(2.4rem, 5vw, 5.8rem);
  --cc-type-section: clamp(1.85rem, 3.4vw, 3.8rem);
  --cc-type-card: clamp(1.2rem, 1.7vw, 1.65rem);
  --cc-type-body-lg: clamp(1.05rem, 1.35vw, 1.3rem);
  --cc-type-body: 1rem;
  --cc-type-data: 0.75rem;
}
```

### Spacing and geometry

Use an eight-pixel base rhythm. Product sections use generous vertical space; evidence components
use denser internal rhythm.

```css
:root {
  --cc-space-1: 0.5rem;
  --cc-space-2: 1rem;
  --cc-space-3: 1.5rem;
  --cc-space-4: 2rem;
  --cc-space-6: 3rem;
  --cc-space-8: 4rem;
  --cc-space-12: 6rem;
  --cc-pad-inline: clamp(1.1rem, 4vw, 5rem);
  --cc-radius-sm: 0.45rem;
  --cc-radius-md: 0.8rem;
  --cc-radius-lg: 1.3rem;
}
```

Corners remain compact. Large soft cards would make the system feel like a general SaaS template.

## 5. Global shell

Every presentation route receives the same shell contract:

1. Skip link.
2. Global header.
3. Route context and current state.
4. Main content.
5. Related evidence rail.
6. Global footer.

The header contains the Canli Capital wordmark, a read-only record-status indicator, the primary
route set and one action: `Enter the live record`.

Primary navigation:

1. Live
2. Research
3. Trials
4. Systems
5. Methodology
6. Verify

Secondary navigation is available through a compact menu:

1. Foundry
2. Corrections
3. Status
4. Founder
5. Open data

The mobile header keeps the record state visible. The menu opens as a full-width information panel,
not a small floating popover.

## 6. Claim grammar

Every important value uses a claim component backed by `/contracts/public-claims.json`.

```text
[OBSERVED]  Paper-trading days
19          through 26 Aug 2026
Source      program_status.json / forward_record / live_days
```

Required maturity labels:

| Machine value | Visible label | Color behavior |
|---|---|---|
| `observed` | Observed | Neutral or mint only when a separate check passes |
| `simulated` | Simulated | Cyan outline |
| `model_estimated` | Model estimate | Amber outline |
| `planned` | Objective | Muted outline, never result styling |

A green state means a named verification passed. It never means a strategy is profitable, mature or
safe unless that is exactly what the named check measures.

## 7. Core components

### Status strip

The strip sits above the hero copy and shows four artifact-derived facts:

1. Paper record start.
2. Broker-executed sleeves.
3. Capital basis.
4. Current validation status.

Each cell links to its source or governing method. A loading state keeps the label and replaces only
the value. A failed fetch displays `Evidence unavailable` and links to system status.

### Evidence card

Evidence cards contain a maturity badge, label, value, basis text, source link and optional sparkline.
The card never puts an objective and an observed result in the same typographic slot.

### Action hierarchy

1. Primary: filled cobalt, one per viewport chapter.
2. Secondary: chalk or transparent with a visible boundary.
3. Evidence link: text with a directional glyph.
4. Verification action: data-style control with explicit result state.

Actions use consistent verbs. `Enter the live record` always opens the live record. `Verify record`
always starts or explains verification.

### Data tables

Tables use sticky headers when useful, tabular numerals, explicit units and horizontal containment on
small screens. Color never carries status alone. Dense rows use forty-four-pixel minimum interactive
targets for links and controls.

## 8. Homepage structure

### Desktop storyboard

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ Canli Capital    record status    Live Research Trials Systems      CTA │
├──────────────────────────────────────────────────────────────────────────┤
│ PAPER SINCE ...  BROKER ...  CAPITAL: PAPER  VALIDATION ...             │
│                                                                          │
│ A trading system that             ┌───────────────────────────────────┐ │
│ has to prove every claim.         │ Evidence Core, first stable frame │ │
│                                   │ Actual nodes, rails and chain     │ │
│ Lead copy                         └───────────────────────────────────┘ │
│ [Enter live record] [Methodology]                                     │
├──────────────────────────────────────────────────────────────────────────┤
│ WHAT YOU GET        Four compact access and boundary cards              │
├──────────────────────────────────────────────────────────────────────────┤
│ EVIDENCE DASHBOARD  Current observed, modeled and planned claims         │
├──────────────────────────────────────────────────────────────────────────┤
│ PINNED EVIDENCE CORE: identity -> union -> sleeve -> broker -> record    │
├──────────────────────────────────────────────────────────────────────────┤
│ LIVE SYSTEM FILMS   Testing / broker observed / record sealed            │
├──────────────────────────────────────────────────────────────────────────┤
│ RESEARCH FRONTIER   Killed work, current candidates, complete union      │
├──────────────────────────────────────────────────────────────────────────┤
│ FOUNDER + METHOD + CORRECTIONS + FOOTER                                  │
└──────────────────────────────────────────────────────────────────────────┘
```

### Mobile storyboard

```text
┌──────────────────────────┐
│ Brand   record state  ☰  │
├──────────────────────────┤
│ Four-cell status stack   │
│                          │
│ A trading system that    │
│ has to prove every claim │
│                          │
│ Lead                     │
│ [Enter live record]      │
│ [Methodology]            │
│                          │
│ Evidence Core poster     │
├──────────────────────────┤
│ What you get             │
├──────────────────────────┤
│ Evidence cards           │
├──────────────────────────┤
│ Five static core stages  │
├──────────────────────────┤
│ System films on demand   │
├──────────────────────────┤
│ Research and founder     │
└──────────────────────────┘
```

## 9. Evidence Core motion contract

The desktop narrative uses one top-level GSAP timeline with ScrollTrigger. A stable wrapper is pinned.
Only child layers move. The timeline uses `scrub` and does not use `toggleActions`.

Chapter progress:

| Progress | Chapter | Visual change |
|---:|---|---|
| 0.00 to 0.18 | Idea | Uncommitted nodes enter a bounded field |
| 0.18 to 0.36 | Frozen identity | Hash rings resolve and the trial count becomes explicit |
| 0.36 to 0.58 | Trial union | Killed and blocked nodes remain visible as the union expands |
| 0.58 to 0.80 | Broker execution | Admitted rails receive observed broker pulses |
| 0.80 to 1.00 | Signed record | Verified observations lock into the append-only spine |

Motion rules:

1. Animate transforms, opacity and shader uniforms only.
2. Create ScrollTriggers in document order.
3. Use `scrub: 0.8` as the initial tuning value and test it on low-power hardware.
4. Apply `will-change` only while a layer can animate.
5. Pause request-animation-frame work when the section is offscreen or the document is hidden.
6. Dispose geometry, materials, textures, listeners and timelines on teardown.
7. Refresh ScrollTrigger only after meaningful layout changes such as font or media completion.

### Reduced motion

Reduced motion shows five complete static frames in document order. It does not pin, scrub, rotate or
hide information. Keyboard and screen-reader users receive the same chapter labels and claim links.

### Capability fallback

The full renderer is eligible only when the device passes a conservative capability check. Mobile,
low-memory, low-power and failed-WebGL paths use an exported poster or simple SVG sequence.

## 10. System films

System films are generated from sanitized evidence data. They are not background stock footage.

Each film has:

1. A clear title and evidence timestamp.
2. A poster frame.
3. WebM and H.264 sources.
4. Muted inline playback.
5. No autoplay until the film is near the viewport.
6. A text transcript describing the state transitions.
7. A link to the source claims.

The first three films are `The engine is testing`, `The broker is observed` and `The record is sealed`.

## 11. Route migration model

The current source inventory identifies four presentation families. Migration treats each family once:

1. Product v3 homepage: retain its evidence-first structure, then align it to this contract.
2. Legacy product v2: migrate `/systems`, `/performance`, `/progress`, `/open` and `/research` through
   the shared shell component.
3. Evidence document v1: update the six generators so all 446 generated routes inherit the current
   header, footer, typography, claim grammar and related-evidence rail.
4. Archival publication v1: preserve all 16 hash-bound paper files and add current-shell presentation
   wrappers that link to the immutable originals.

The deterministic migration manifest is `artifacts/qa/product-contract-inventory.json`.

## 12. Writing contract

1. No em dash in editable rendered copy, metadata or structured data.
2. No unsupported novelty or performance superlative.
3. No number without a source or explicit non-evidence label.
4. No objective styled as an observed result.
5. No limitation separated from the claim it limits.
6. No false implication that a paper account contains funded strategy capital.
7. No claim of independent validation from a self-published broker reconciliation.

`contracts/writing-ratchet.json` records the temporary legacy ceiling. Every migration lowers it. The
release requirement remains zero in every editable rendered scope. Hash-bound originals are preserved
and linked as archival sources.

## 13. Performance and accessibility gates

1. Mobile LCP at most 2.5 seconds.
2. INP at most 200 milliseconds.
3. CLS at most 0.05.
4. Three.js and GSAP are lazy chunks and never block meaningful first paint.
5. No autoplay media blocks the hero.
6. Full keyboard navigation and visible focus.
7. WCAG 2.2 AA contrast and semantics.
8. Complete reduced-motion and WebGL-failure paths.
9. No perpetual render loop outside a visible active scene.

## 14. Design self-critique

A generic dark quant site would use neon particles, random candlesticks and a wall of statistics. That
direction was rejected because it communicates trading aesthetics without communicating Canli Capital's
method. A generic infrastructure site would use an abstract gradient mesh and interchangeable feature
cards. That direction was rejected because the visual could belong to any company.

The Evidence Core is specific because its structure is the research protocol. The quiet interface
around it gives the evidence enough space to remain understandable.

## 15. Definition of implemented

This specification is implemented only when:

1. Every presentation route has the current global shell.
2. Archival files remain byte-preserved behind presentation wrappers.
3. Every important homepage value resolves through the public claim contract.
4. The Evidence Core uses real public state and passes motion fallbacks.
5. Every writing ratchet is zero for editable rendered output.
6. Performance and accessibility gates pass on production-like builds.
7. Visual screenshots confirm coherent desktop and mobile behavior across route families.
