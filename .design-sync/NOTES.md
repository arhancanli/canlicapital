# Claude Design converter notes

Every gotcha hit while building `design-system/` and staging the converter check in
`.ds-sync/`, in the order they came up. `package-validate.mjs ./ds-bundle` currently exits 0
with all 22 components discovered and every `[CSS_*]` / `[FONT_*]` finding resolved or
explained below.

## 1. `css/home.css` is not wrapped: a real `:root` token collision

`css/home.css` redeclares bare (unprefixed) custom properties also declared by
`css/styles.css`: `--ink`, `--mono`, `--max`, `--ease` and others, with different values for a
light theme. On the live site this never bites because no single page loads both files. Once
flattened into one `design-system/dist/styles.css`, whichever file loads last would win the
cascade for every one of those names, repainting every `css/styles.css`-based component in
this package with `home.css`'s values (wrong background, wrong mono font, wrong max width).
This is real corruption, not a cosmetic quirk, so this package does not wrap a Hero/Button
pair sourced from `home.css`. The button family requirement is instead met by
`css/developers.css`'s own `.dev-button` / `.dev-button--primary`, which uses `--dev-*`
prefixed tokens and has no such collision. The Hero family requirement is met by
`css/styles.css`'s own `.hero` family (used on /research, /systems, /progress, /performance,
/open), which was always the intended source for `.hero__*` anyway.

## 2. `css/tools-hub.css` needed `css/lab.css` too

`.tools-card`'s rules read `--lab-ink`, `--lab-cyan` and `--lab-muted`, all declared in
`css/lab.css`'s `:root`, not `css/tools-hub.css`'s own (it has none). Without importing
`css/lab.css`, `ToolsCard` would resolve to unset custom properties and render with no color.
`css/lab.css` uses `--lab-*` prefixed tokens, so it does not collide with anything else in the
bundle. Added to `design-system/src/styles.css`'s import chain, between `css/dsr-tool.css` and
`css/tools-hub.css`.

## 3. `scripts/product-shell.mjs` cannot be imported directly from `design-system/src`

TypeScript's `rootDir` (needed to keep `dist/index.d.ts` flat rather than mirroring paths from
the site root) refuses to emit declarations for a source file that imports something outside
that root, and `scripts/product-shell.mjs` lives at the repo root, outside
`design-system/src`. Per the brief's own fallback ("if it cannot be imported cleanly, generate
a module from it at build time"), `design-system/scripts/build.mjs` copies
`scripts/product-shell.mjs` byte for byte into `design-system/src/shell/generated-product-shell.mjs`
as the very first build step, every build, so it can never go stale. `ProductShell.tsx` imports
from that generated sibling file, never hand-retyped. The generated file is not committed
(same treatment as `dist/`); running `npm run build` regenerates it.

An ambient `declare module "../../../scripts/product-shell.mjs" { ... }` shim was tried first
and does not work: TypeScript does not consult ambient module declarations for relative-path
specifiers (only for bare/package-style ones), so it always tries real file resolution first
and hits the `rootDir` error regardless. `allowJs: true` was added to `tsconfig.json` so the
generated copy (once physically under `src/`) type-checks by inference from its own JS.

## 4. Byte-identical Shell markup without a wrapper element

`ShellHeader` / `ShellFooter` must render markup identical to
`renderProductShellHeader` / `renderProductShellFooter`'s own HTML strings for the guard test
to pass, but React's `dangerouslySetInnerHTML` sets a container's children, not the container
itself, so a naive `<div dangerouslySetInnerHTML={...} />` wrapper would add a `<div>` never
present in the original markup. `design-system/src/shell/rawElement.ts` instead parses the
root element's tag name and attributes out of the HTML string with a regex, and constructs a
real `<header>` / `<footer>` element carrying those exact attributes (in the same order) with
`dangerouslySetInnerHTML` only for its inner content. No attribute is retyped by hand and no
extra element is introduced. The content passed to `dangerouslySetInnerHTML` here is always
the output of a trusted, dependency-free, first-party build-time function, never user input,
which is what makes this safe.

## 5. Fonts: six families, not four

The brief named four families to check for (Bricolage Grotesque, Space Grotesk, JetBrains
Mono, Inter). Checking the actual stylesheets this package imports turned up two more used
directly (not just through a shared CSS custom property, but written literally in a
`font-family` value): IBM Plex Mono (`css/developers.css`, `css/tools-hub.css`,
`css/dsr-tool.css`) and Barlow Condensed (`css/dsr-tool.css`'s `--dsr-display`). Leaving either
out would mean `DsrHero`, `DevButton` and `ToolsCard` render in a fallback font instead of the
real one, so `design-system/src/fonts.css` requests all six in one Google Fonts request. See
`design-system/README.md`'s "Fonts served at runtime" section.

## 6. CSS flattening: inline local imports only, leave the remote font `@import` alone

`design-system/scripts/build-css.mjs` walks `@import` statements to produce
`dist/styles.css`. It only inlines a LOCAL import (a relative path); the Google Fonts
`@import url("https://fonts.googleapis.com/...")` inside `fonts.css` is left exactly as
written, because those fonts are meant to load from the network at runtime (same as the live
site), not be vendored into the bundle. `[FONT_REMOTE] "Arial Narrow"` in
`package-validate.mjs`'s output below is this working as intended: "Arial Narrow" is one of
the metric-matched local `@font-face` fallback names declared in `css/product-shell.css`
(a system font used to avoid layout shift while the real webfont loads), not something this
package needs to serve, and the validator's own message says it is assuming exactly that.

## 7. `componentSrcMap` for `ShellHeader` / `ShellFooter`

The converter's source-matching heuristic looks for a file literally named `<Name>.tsx` (or
`<Name>/index.tsx`). `ShellHeader` and `ShellFooter` both live in
`design-system/src/shell/ProductShell.tsx`, so without help neither matched
(`package: 22 components (20 src-matched)`). `.design-sync/config.json` pins both names to
that file via `componentSrcMap`, after which discovery reports `22 components (22 src-matched)`.

## 8. `runtimeFontPrefixes`

Without it, `package-validate.mjs`'s `[FONT_MISSING]` check would flag every one of this
package's six font families, since none of them ship as a vendored `@font-face` in the bundle
(they load from Google Fonts at runtime, same as the live site). `.design-sync/config.json`
lists all six family-name prefixes so the check treats them as system-equivalent instead of
missing.

## 9. Token coverage and render-preview warnings are informational, not failures

`package-validate.mjs` reports `tokens: 87 defined, 78 referenced (2 missing, below
threshold)`: below its own warning threshold (3), so it never even emits a `[TOKENS_MISSING]`
line. The seven `[RENDER_THIN]` / `[RENDER_BLANK]` warnings are the auto-generated preview
renderer running components with their smart-default props and finding too little visible
content (e.g. `Eyebrow` needs real heading text, `EstateGrid` and `Ledger` need real row data
to look like anything). The validator's own message is the fix if this package ever needs
richer generated previews: author `.design-sync/previews/<Name>.tsx` for the affected
components, which the docs say wins over the generated render. Not done here since these are
explicitly called out as non-blocking and the guard tests already exercise every component
with realistic props.

## 10. `node --test test/` failed on this environment; use bare `node --test`

Passing a positional path (`test/`, `./test`) to `node --test` on this Node build raised a
bogus `MODULE_NOT_FOUND` for a module literally named "test" (a CJS-loader quirk under
`"type": "module"`, not a real missing file). `node --test` with no path argument (its default
auto-discovery of `**/*.test.{js,mjs,cjs}`) works correctly, so `design-system/package.json`'s
`test` script uses that form.

## 11. A single-pass CSS body strip, not a repeated one

`design-system/test/lib/css-classes.mjs` collapses `{ declaration: body; }` blocks to `;`
before extracting class names from what is left, so a color value or a URL inside a
declaration is never mistaken for a class name. The first version of this looped the collapse
until stable, meant to handle a nested `@media (...) { .a { } .b { } }` block. That is exactly
what broke it: after one pass such a block becomes `@media (...) { .a ; .b ; }`, itself now a
brace-free block, so a second pass swallowed it whole, deleting `.a` and `.b`. This is exactly
how `.cc-shell__index-wide` (real, but only ever styled inside a `@media` block, never at the
top level) went missing and failed guard test 1 for `ShellHeader`. Fixed to a single pass.

## 12. Two literal em dashes caught in draft comments

Guard test 3 (no em dash character anywhere under `design-system/`) caught two literal em
dashes written into explanatory comments while drafting `Eyebrow.tsx` and
`CorrectionsList.tsx`. Both were rewritten (a comma, and a colon-led clause) before this
package's first commit. The test itself builds its own em dash constant from
`String.fromCodePoint(0x2014)`, the same technique `scripts/audit-writing.mjs` uses for its
`literalEmDash` constant, so the test file does not contain the character it is scanning for.

## 13. `CorrectionsList` does not insert its own separator

The live corrections list's date/body separator (a dash) is not template markup; it is part of
the source data in `paper-state.json`, and `scripts/build-progress-corrections.mjs` concatenates
the date label and the rest of the entry with nothing in between. `CorrectionsList`'s `text`
prop is documented as carrying that separator itself, and the component inserts none of its
own, matching the real build script instead of guessing at punctuation.

## For the deploy snapshot's prune list

`~/alphaforge/scripts/lib/site_snapshot.sh` should prune the same four directory names added
to `.vercelignore` and the audit skip sets here: `design-system`, `.design-sync`, `.ds-sync`,
`ds-bundle`. Not edited in this repo; that script lives in a different one.
