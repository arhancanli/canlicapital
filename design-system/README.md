# canli-design-system

Thin React wrappers around canlicapital.com's real markup and stylesheets, built so the site
can be synced into [Claude Design](https://claude.ai/design), which only consumes React
component libraries.

This package does not reimplement the site's look. Every component renders the site's exact
existing HTML classes, and the package's stylesheet (`dist/styles.css`) is the site's own CSS,
imported by relative path and flattened into one file. If a component would need markup the
site does not have, it is not in this package.

## Install and build

```sh
npm install
npm run build
```

`npm run build` is one shot (no watcher). It produces:

- `dist/index.js`: an ESM bundle (`react` and `react-dom` are peer dependencies, not bundled).
- `dist/index.d.ts`: type declarations, one `<Name>Props` interface per component.
- `dist/styles.css`: the flattened, self-contained stylesheet described below.

```sh
npm test
```

runs the guard tests in `test/` (`node:test`): every component's classes are checked against
`dist/styles.css`, the Shell renders byte-identical markup to the site's own
`scripts/product-shell.mjs`, no file in this package contains a literal em dash, and every
exported component has a matching `<Name>Props` export.

## Components

| Component | Source classes |
| --- | --- |
| `ShellHeader` / `ShellFooter` | `scripts/product-shell.mjs` output (`.cc-shell`, `.cc-footer`) |
| `Section` | `css/styles.css` `.section` / `.section--ink` |
| `Eyebrow` | `css/styles.css` `.eyebrow` / `.label` / `.idx` |
| `DisplayHeading` | `css/styles.css` `.display-xl` / `.display-l` / `.display-m` |
| `BodyText` | `css/styles.css` `.body` / `.body-l` |
| `MonoLabel` | `css/styles.css` `.mono-label` |
| `MonoData` | `css/styles.css` `.mono-data` |
| `Hero` | `css/styles.css` `.hero`, `.hero__status`, `.hero__body`, `.hero__word`, `.hero__sub`, `.hero__scroll` |
| `StatBand` | `css/styles.css` `.statband`, `.stat`, `.stat--zero` |
| `CorrectionsList` | `css/progress.css` `.corrections-list` / `.corrections-item` |
| `Ledger` | `css/progress.css` `.ledger` / `.ledger__row` |
| `EstateGrid` | `css/progress.css` `.estate` / `.estate__grid` |
| `ToolsCard` | `css/tools-hub.css` `.tools-card` |
| `DsrHero` | `css/dsr-tool.css` `.dsr-hero` |
| `DsrButton` | `css/dsr-tool.css` `.dsr-button` / `.dsr-button--primary` |
| `DsrSectionHead` | `css/dsr-tool.css` `.dsr-section-head` |
| `DsrBoundary` | `css/dsr-tool.css` `.dsr-boundary` |
| `DevButton` | `css/developers.css` `.dev-button` / `.dev-button--primary` |
| `DevBoundary` | `css/developers.css` `.dev-boundary` |
| `DeveloperKeyBox` | `css/developers.css` `.dev-key-result` |
| `ReceiptBadge` | no class: reproduces the site's bare embed, `<a><img></a>` |

`css/home.css` is deliberately not wrapped. See `.design-sync/NOTES.md` for why (it redeclares
bare `:root` custom properties that collide with `css/styles.css`'s, which would corrupt every
other component's tokens once flattened into one stylesheet).

## Fonts served at runtime

Like the live site, this package does not vendor font files. `src/fonts.css` loads the same
families from Google Fonts that the pages these components are drawn from load:

- **Space Grotesk** and **JetBrains Mono** (`css/styles.css` / `css/progress.css` pages)
- **Bricolage Grotesque**, **Inter** and **IBM Plex Mono** (`css/developers.css` /
  `css/tools-hub.css` / `css/lab.css` pages)
- **Barlow Condensed** (`css/dsr-tool.css`'s display type; it also uses Inter and IBM Plex Mono)

This is a superset of the four families named in this package's brief (Bricolage Grotesque,
Space Grotesk, JetBrains Mono, Inter): IBM Plex Mono and Barlow Condensed are also referenced
directly (not just through a CSS custom property) by `css/developers.css`, `css/tools-hub.css`
and `css/dsr-tool.css`, so leaving them out would mean those components render in a fallback
font instead of the real one.
