# Canli Capital / morning review

**Historical candidate: visually rejected by the user on September 9.** Passing
checks below do not constitute visual approval. A second direction is in progress:
[current visual-redesign log](VISUAL-REDESIGN-2026-09-09.md). The current worktree
opening is newer than this candidate and its Figma composition.

Production-build preview: http://127.0.0.1:4188/
Development preview: http://127.0.0.1:4187/
Editable design: https://www.figma.com/design/n3MbdBAC6STjHudQocaZa7

Worktree: `/Users/arhancanli/canlicapital-website-20260908`.
Branch: `design/glassbox-website-20260908`.
This is a local release candidate, **not a deployed production release**.
The editable Figma composition and source-mapped design system are complete for
this review candidate. Deployment remains gated below.

## What changed

The complete homepage now uses an asymmetric, image-led opening, angular display
type, alternating black/white/blue sections and a continuous original glassbox
instrument. Its four modules open through research, paper execution and publication.
The narrative leads into the real strategy register, interactive paper curves,
developer API, research, full evidence disclosures, accountability, FAQ and access.
No invented returns, endorsements, customer counts or live-market animations.

The shared header/footer and functional hub entrances carry the new identity across
the public site. All 505 pages remain in the audited link graph. The API key and
validation implementation, evidence IDs, publication sources and existing external
dashboard remain intact. Developer code blocks/tables now support keyboard scrolling.

United Carriers informed composition, typography scale and scroll continuity. Its
branding, copy, proprietary font and industrial assets were not copied. The artwork
is original: a 96-frame Blender sequence plus three OpenAI-generated supporting
images. No claim is made that Sora/video generation was connected.

## Verification evidence

| Check | Result | Evidence |
|---|---|---|
| Production build | Pass | `dist/`; Node 22, Vite build |
| Complete verification | 269 tests pass | `artifacts/qa/release-candidate/canli-final-verify.log` |
| Site graph | 505 pages, 14,236 links | Same verification log |
| Search indexing | 263 indexable, 242 public noindex; no conflicts | Same verification log |
| Published numbers | All displayed numerals trace to published artifacts | Same verification log |
| Layout/fallbacks | 9 cases pass; 320–1920px, no JS, reduced motion | `artifacts/qa/cinematic-rebuild/` |
| Sequence behavior | 9 cases pass across Chromium, WebKit and Firefox | `artifacts/qa/instrument-sequence/` |
| Shared shell | 42/42 representative views pass | `artifacts/qa/product-shell/` |
| Final footer SVG | 9 views pass at 320, 390 and 1440px | `artifacts/qa/footer-vector/` |
| Actual Safari | Homepage interactions and four hubs pass | `artifacts/qa/safari-production/` |
| Automated accessibility | 14 representative views, zero axe violations | `artifacts/qa/cinematic-accessibility/` |
| Adverse conditions | Slow cold load, unavailable images/fonts, enlarged text pass | `artifacts/qa/cinematic-adverse/` |
| Dependency audit | Zero known production dependency vulnerabilities | `artifacts/qa/release-candidate/canli-dependency-audit.json` |
| Figma structure | 13 sections, 10 instances, 31 variables; no broken aliases, missing fonts or missing images | `artifacts/tooling/figma/p4-final-audit.json` |

Accessibility automation is not WCAG certification. Headless viewport tests are
not physical-phone testing. Local scroll samples observed p95 intervals around
9ms with warm entry frames on this Mac; that does not establish universal smoothness.
The throttled cold-load check uses 150ms latency, 200kB/s download and 4x CPU slowdown.
Root-font-size changes deliberately cause layout shifts, so their recorded CLS
values are not page-load performance scores. Field Core Web Vitals remain unmeasured.

The sequence is demand-driven: no initial animation fetch, three concurrent loads,
20 cached decoded frames plus transient decodes, and no retry loop for failed frames.
Reduced motion, save-data, missing frames and disabled JavaScript keep static content.
The 9.46MB total includes both desktop and mobile asset sets; a browser selects one
and requests nearby frames as needed. Source renders/Blender/GLB files are not shipped.

## Release gates — do not skip

1. Integrate authored frontend/generator changes into the **current** publishing
   checkout with a reviewed diff. Do not replace it with this snapshot or copy all
   generated HTML/data wholesale. The live public API already has newer evidence.
2. Regenerate using fresh production artifacts and re-run `npm run build` and
   `npm run verify`. Confirm paper-only boundaries and dated evidence parity.
3. Verify the serverless environment in an authorized staging/release workflow:
   key issuance, validation receipts, store connectivity, rate limiting and access
   form delivery. Local Vite does not run those production functions. Unit/browser
   tests use controlled responses; no production key was issued here.
4. Obtain release approval, deploy through the existing process and verify actual
   redirects, security/cache headers, API responses, asset loading and rollback.
   None of those deployment actions occurred during this design work.
5. Review the visual result on physical phones and the user's preferred Safari
   viewport. Start field performance/error monitoring after release.

Read-only production status returned successfully during the work and explicitly
reported `PAPER_ONLY`. This does not prove every authenticated/write endpoint.
Build/verification logs, dependency audit and the dated public status response are
retained in `artifacts/qa/release-candidate/`, not solely in temporary storage.
No live trading, publishing automation, credentials, campaigns or purchases changed.

## Editable design handoff

Figma contains Cover, Getting Started, Foundations, Action and Question component
pages, asset/motion utilities and the complete **desktop** homepage composition.
Six text styles and one effect style accompany the 31 source-mapped variables.
Action has six Primary/Ghost × Default/Hover/Focus variants; Question has Closed
and Open variants with editable content. Ten instances are integrated into the page.
The FAQ links retain their actual evidence destinations. Access controls preserve
their source-specific blue/white appearance as instance overrides.

The design is a visual/editorial companion, not a live data or browser prototype.
The three process chapters are a static storyboard; chart values are a dated
capture. Responsive layouts and native interactions are implemented and tested in
code, not separately reconstructed as hundreds of Figma screens. Captured editorial
layers remain editable, but not every layer has been individually tokenized.
No organization library was published and no hosted Code Connect mapping was added.
Only three temporary capture frames were removed after validation; Figma history
can recover them. Final proof: `artifacts/tooling/figma/p4-final-audit.png`.

## Primary authored sources

Current visual/runtime sources: `index.html`, `css/cinema-tokens.css`,
`css/cinematic-home.css`, `css/cinema-shell.css`, `js/cinematic-home.js`,
`js/instrument-sequence.js`, plus the shared shell and developer generators/styles.
Assets: `public/cinema/`, `public/fonts/chakra-petch/` (includes license).
Reproducible art: `scripts/build-alphac-instrument.py`,
`scripts/encode-instrument-sequence.py`.
Earlier experimental hero/engine files are retained but are not the current opening.
Do not infer authorship of every dirty/generated file from this worktree's status.

Use Node 22 without changing the user's global shell:

```sh
PATH=/Users/arhancanli/.nvm/versions/node/v22.23.2/bin:$PATH npm run build
PATH=/Users/arhancanli/.nvm/versions/node/v22.23.2/bin:$PATH npm run verify
HOMEPAGE_AUDIT_ORIGIN=http://127.0.0.1:4188 python3 scripts/audit-cinematic-rebuild.py
PRODUCT_SHELL_AUDIT_ORIGIN=http://127.0.0.1:4188 python3 scripts/audit-product-shell.py
```

The worktree currently shares the original installation via a `node_modules`
symlink. Do not run dependency installation against that shared target casually.
Three.js is development-only diagnostic tooling, not a website runtime dependency.

Provenance: `docs/CINEMATIC-ASSET-PROVENANCE.md`.
Design mapping: `docs/FIGMA-DESIGN-SCOPE.md`.
Progress/decisions: `docs/PRODUCTION-GOAL-2026-09-09.md`.
Marketing remains deferred; the existing acquisition draft is for tomorrow's review.
