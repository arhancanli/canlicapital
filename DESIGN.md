# Canli Capital: the open engine

Historical first-iteration direction. The delivered September 9 candidate uses
Chakra Petch display type and the original 96-frame glass instrument. See
[current release handoff](docs/RELEASE-CANDIDATE-2026-09-09.md) and
[final Figma mapping](docs/FIGMA-DESIGN-SCOPE.md) for verified current state.

Reference: https://unitedcarriers.com/, inspected in Chromium on 2026-09-08. The reference uses a dark immersive opening, an oversized dimensional globe, compact utility navigation, white typography, blue and orange light, and generous white sections. Observed fonts: BT Steinhart, BT Steinhart Mono, Helvetica Neue. Firecrawl captures were unavailable because the account has no credits; browser capture is the evidence. No reference brand assets are reused.

![United Carriers browser reference](artifacts/qa/advisor-homepage/united-reference.png)

## Direction

### Cinematic revision, September 8

The reference audit is in `artifacts/reference/united-carriers/DESIGN.md`. The new signature is a continuous cutaway of ALPHAC: one transparent enclosure separates into four actual paper-curve planes as the visitor passes research, observation and publication. This is an original procedural asset, not borrowed freight imagery. The enclosure is illustrative; curves use the published dates and normalized equity. Desktop uses a sticky canvas with scroll-driven camera changes; mobile and reduced motion keep an unpinned static illustration and all chapter copy.

Palette: carbon #080b10, chalk #f7f8fa, ink #141921, blue #476dff, copper #f4a46b, ice #c6d5ec. Display: uppercase Bricolage Grotesque with restrained width and tight line height. Reading: Inter. Evidence labels: IBM Plex Mono. Layout: asymmetric two-field opening (readable copy / large cutaway), continuous dark research journey, then a white strategy register, dark record, blue developer access, and existing evidence library. Native FAQ disclosures resolve the paper/live, transparency and API questions.

Plan critique: an isolated floating chart would only decorate the prior layout. The revision instead uses the same four planes through three meaningful workflow stages, keeps a visible explanation beside each, and makes the conventional chart directly reachable. No decorative speedometer, fabricated telemetry, endless loading screen or scroll hijacking.

The subject is ALPHAC, Canli Capital's running systematic research engine. The homepage introduces the strategies, shows what is happening, explains the open improvement process, and invites developers to use the validation API. Existing research, tools, methodology, corrections and evidence pages retain their URLs and full content.

The signature is an exploded glass view of the actual paper equity curves: separate transparent planes for separate strategies. It conveys the glassbox principle using published data. It is an explanatory perspective illustration, not a conventional comparison chart; the existing interactive console provides that. No decorative returns or invented results.

## Tokens

- Carbon #080b10: cinematic opening and footer.
- Chalk #f7f8fa: editorial background.
- Ink #141921: body text on light surfaces.
- Electric blue #476dff: primary actions and AlphaMax.
- Copper #f4a46b: AlphaTrend.
- Ice #c6d5ec: AlphaVintage; sea glass #82d2c5: AlphaForge.
- Existing Bricolage Grotesque for display, Inter for reading, IBM Plex Mono for data. Retain metric matched fallbacks and nonblocking font loading.
- Generous sections, restrained rounded controls, thin borders, large left aligned display text. A dark opening followed by light strategy pages and a blue developer chapter.

## Structure

Opening / strategies / live console / developer API / glassbox introduction / research process / research library / detailed evidence / accountability / release notes.

The first screen answers what the company builds. Strategy rows make the running systems concrete. Developers have a direct route to the existing key issuance and working quickstart. Detailed evidence remains addressable below and through the full site menu.

## Implementation requirements

Keep the existing claim IDs and hydration paths. Generate the hero SVG from paper-state.json on every build; its caption declares the paper basis and source. Reduced motion and mobile render the same static artifact; only capable desktop browsers enhance its perspective. Do not add a renderer dependency. Preserve all existing page routes, API behavior and claim audits. Shared chrome changes must originate in scripts/product-shell.mjs and css/product-shell.css.

All sections must be visible without JavaScript. Navigation, focus, anchor targets and menu must work by keyboard. Validate real screenshots, phone overflow, paper curve switching, developer quickstart and the existing build and verification suite.
