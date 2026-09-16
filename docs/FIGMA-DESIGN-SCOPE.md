# Canli Capital / Figma v1 scope

Run: canli-cinema-20260908. Source: css/cinema-tokens.css,
css/cinematic-home.css, css/cinema-shell.css, index.html.
File: n3MbdBAC6STjHudQocaZa7. Composition page 0:1; final root 46:2.
Initial Safari capture 2:2 was removed after validated composition, as were the
two intermediate captures 63:6 and 65:6. Figma history retains recoverability.

## P0 discovery

- Code Connect files: none found (`rg --files -g '*.figma.*'`).
- Existing canvas: one captured homepage, raw frames, no components.
- Existing local collections, variables, text/effect/paint styles: none.
- Product fonts verified available: Chakra Petch Medium, Inter Regular/Medium,
  IBM Plex Mono Regular. No font substitution is necessary.
- Libraries discovered: community kits, no organization libraries available.
- Simple Design System search returned Button and Accordion assets, no variables
  for the color query, and a Heading style. These are third-party kit conventions,
  not Canli Capital's optical/cinematic identity. Their remote ownership and
  independent token model do not provide an editable, code-matched brand system.
  Build a local Canli foundation and components rather than changing the site to
  match the kit. No same-name local token conflicts exist.
- The Figma search server accepts only one query despite its batch schema.
  Remaining identified searches were issued individually, not guessed successful.

## Locked foundation mapping

| Source | Figma collection | Mapping |
|---|---|---|
| 15 literal color tokens in cinema-tokens.css | Canli / Primitives | `cin/{suffix}`, one Value mode, hidden scopes |
| 7 semantic color aliases | Canli / Semantic | `cin/{suffix}`, one Default mode, role-specific scopes |
| 4 component color aliases | Canli / Semantic | button background/text, header/footer background |
| Button radius 100px | Canli / Geometry | `cin/button-radius`, Default mode |
| Button height 48px, x padding 23px, y padding 0px, action gap 12px | Canli / Geometry | Explicit CSS tokens, same defaults |
| Three font families | Text styles | Preserve exact families/styles; no extra font variables needed |
| Responsive type/layout expressions | Style documentation | Record formula + representative desktop/mobile values, not invented responsive modes |

Text styles: Canli/Display/Desktop (90.72px at 1440),
Canli/Display/Mobile (57.6px at 390 due to clamp minimum),
Canli/Heading/Desktop (87.84px at 1440), Canli/Body (16/28.8),
Canli/Action (11.52px Inter Medium), Canli/Utility (10.08px IBM Plex Mono).
Effect style: Canli/Menu shadow (0 25px 60px, code shadow color).

## Component scope

1. Action: Primary/Ghost × Default/Hover/Focus (six variants); editable label;
   fixed 48px minimum height, pill geometry, source-bound typography/colors.
2. Question: Closed/Open (two variants); editable question and answer; native
   HTML details semantics documented in usage, no simulated DOM behavior claim.

These are the repeated homepage controls. Other source content remains editable
in the page composition; live data is not converted into fabricated components.
No library publication or Code Connect server mapping is authorized by this scope.
Record local component-to-CSS/HTML mappings and variable WEB syntax instead;
publishing a library remains a separate optional step.

## Page structure and completion gates

Cover, Getting Started, Foundations, Components divider, Action, Question,
Utilities, Website composition. Preserve the capture until the componentized
composition is visually checked; then remove only the exact temporary capture ID.
All created IDs and validations are saved in artifacts/tooling/figma.
No placeholder shimmer, broken alias, clipped text, or unverified font at handoff.

## Runtime findings

- `get_screenshot` hosted asset returned HTTP 202 without bytes through a bounded
  readiness wait. `use_figma`'s inline `node.screenshot()` returns actual PNG bytes
  successfully; use that path for visual proof, not repeated hosted-asset polling.
- In this runtime, `TextNode.resize()` resets `textAutoResize` to `NONE`.
  Set explicit width first, then restore `textAutoResize = 'HEIGHT'` and vertical
  HUG after parenting. Verified from read-back and an overlapping-cover screenshot.
  This corrects the ordering in the generic reference example for this runtime.
- Two component references disagreed about property ownership. The official
  `ComponentSetNode extends ComponentPropertiesMixin` typing and successful
  runtime read-back confirm set-level `addComponentProperty` works. Action's
  actual editable key is `Label#36:0`; no guessed suffix was used.
- Source-specific fixed geometry remains documented, not generalized into
  invented tokens: Action's 10px internal arrow gap and 1px border; Question's
  27px summary padding, 24px indicator gap and 28px answer bottom space.
- Hidden instance children are skipped by default in this runtime. Set
  `figma.skipInvisibleInstanceChildren = false` before editing closed answers or
  hidden arrows; set text properties before hiding a child. Failed calls rolled
  back, verified by canvas read before the corrected FAQ operation.
- Nested color aliases retained the supplied fallback paint in screenshots.
  Supply the actual resolved source color along with its binding. Footer was
  corrected to #f4f4f4 while retaining its component-token alias.
- Capture's first nested `Header` was an evidence subsection, not global nav.
  Actual top-level navigation was resolved from the Body's direct children.
  Always inspect hierarchy rather than matching a generic tag name.

## Final implementation mapping / September 9

| Artifact | Verified node | Source |
|---|---|---|
| Desktop homepage, 13 flow sections + overlaid navigation | 46:2 | index.html, cinematic-home.css, cinema-shell.css |
| Global navigation | 86:30 | scripts/product-shell.mjs |
| Action component set, six variants | 35:2 | .button; cinema-tokens.css geometry |
| Question component set, two variants | 41:2 | .home-questions details / summary |
| Foundation documentation | 16:2 | cinema-tokens.css and responsive CSS formulas |
| Review boundaries note | 87:30 | RELEASE-CANDIDATE-2026-09-09.md |

Final audit: 31 variables, six text styles, one effect style, ten homepage
instances, eight retained image hashes. No broken aliases, missing fonts or
missing images. All 13 sections were visually checked. Final audit/PNG and
component/page-order readback are saved under artifacts/tooling/figma/p4-final-audit
and p4-file-handoff. Phase P4 is complete; no library publication occurred.

Scope exceptions: process is a static storyboard, chart is a dated snapshot,
responsive behavior remains authoritative in code. Editorial capture layers are
not claimed to be fully tokenized. Access Action instances preserve source blue
label/transparent ghost overrides. Both oversized decorative arrows use original
SVG in code and Figma, avoiding font-dependent emoji fallback.
