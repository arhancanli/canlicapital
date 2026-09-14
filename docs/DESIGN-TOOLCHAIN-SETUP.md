# Design production setup — 2026-09-08

Current review: [September 9 release candidate](RELEASE-CANDIDATE-2026-09-09.md).
The installation notes below include the initial setup chronology; current QA
results and release gates are maintained in that handoff.

## Installed and verified

- Blender 4.5.13 LTS, Apple Silicon: `/Applications/Blender.app`.
  Downloaded from https://download.blender.org/release/Blender4.5/.
  SHA-256 matched the vendor manifest:
  `663ce944257c61ff1d6aa09e15c8f57bbd8d59023adb2fa7edde33a9ed960b53`.
  Code signature verification and macOS notarization assessment passed.
- Figma 126.8.18: `/Applications/Figma.app`, launched for user sign-in.
  Vendor download: https://desktop.figma.com/mac-arm/Figma.zip.
  Code signature verification and macOS notarization assessment passed.
- GSAP 3.15.0, Lenis 1.3.23, Three.js 0.184.0, Playwright 1.62.1,
  Vite 8.0.16 and bundled FFmpeg 5.3.0 package resolve locally.
  Three.js is explicitly declared and locked as development-only tooling; it was previously present
  only in the shared installation. No npm installation scripts were executed.
- Google Chrome and Playwright Chromium were already installed.
- Node 22.23.2 is installed and matches this project's Node 22 engine.
  The current default shell uses Node 24; the global default was not changed.

## Reusable commands

From `/Users/arhancanli/canlicapital-website-20260908`:

```sh
PATH=/Users/arhancanli/.nvm/versions/node/v22.23.2/bin:$PATH npm run tools:blender -- --version
PATH=/Users/arhancanli/.nvm/versions/node/v22.23.2/bin:$PATH npm run tools:verify
```

The verification command requires the Vite development preview at
`http://127.0.0.1:4187`. Override with `CANLI_PREVIEW_ORIGIN` if needed.
The Blender wrapper accepts `CANLI_BLENDER_BIN` for a different installation.

Each verification run creates a fresh `artifacts/toolchain/check-*` directory.
It uses factory startup, does not save Blender user preferences, renders a
12-frame diagnostic cube animation, exports GLB, encodes MP4 and WebP, checks
MP4 decoding, performs a Three.js browser draw, and verifies video playback.
This is a pipeline diagnostic, not proposed website imagery or a quality benchmark.

Successful initial report: `artifacts/toolchain/check-zp3z5yoj/report.json`.
Cycles rendered on `Apple M5 Pro (GPU - 20 cores)` using Metal. Browser rendering,
video playback and image conversion passed. This does not establish production
scene performance, cross-browser coverage, or full-site design quality.

## Connection history and current status

- Figma remote MCP is now configured in the user's Codex configuration at
  `https://mcp.figma.com/mcp`. OAuth login was completed through Safari;
  `codex mcp list` reports enabled / OAuth. No token was added to the project.
  Direct session tools initially did not expose Figma. Resolved by using Codex's
  documented app-server MCP transport through `scripts/figma-connection.py`.
  This uses the existing OAuth connection without reading credential files.
  Figma `whoami` verified a Pro plan / Full seat. Tool discovery confirms
  design context, screenshots, file creation and canvas editing are exposed.
  Created `Canli Capital — Website Design` in the user's team drafts:
  https://www.figma.com/design/n3MbdBAC6STjHudQocaZa7 (opened in Safari).
  That initially blank workspace now contains source-mapped foundations,
  reusable Action/Question components and the editable homepage composition.
- Playwright WebKit and Firefox were installed for both the existing Node and
  Python test clients (the clients use different browser revisions).
  Chromium, WebKit and Firefox each launched and loaded the local homepage
  with its hero image and without JavaScript page errors in a reduced-motion
  desktop smoke check. Subsequent sequence, layout and shared-shell audits are
  recorded in the September 9 release-candidate handoff.
- Safari automation is now enabled after explicit user authorization and local
  administrator authentication. A real Safari 26.5 WebDriver session loaded
  the local homepage, verified the heading, loaded hero image and no horizontal
  overflow, then closed the test session. Subsequent actual Safari regression
  checks cover the animated sequence, curve, disclosures, deep links and hubs.
- Safari is the user's chosen browser for this workflow. Figma's website and
  the local preview were opened explicitly in Safari. The system-wide default
  browser was not changed. Blender remains a local desktop/rendering tool.
  Physical-device review and post-deployment verification remain release gates.
- Figma account authorization and Pro / Full seat entitlement are verified.
- The design-document connection is working and has been used to edit Figma.
  OpenAI image generation supplied three original images. No Sora/video-generation
  connection is claimed; the delivered frame sequence was rendered in Blender.
  No API credentials were added and no subscription was purchased.
- Spline is intentionally not installed: it is an optional alternative, not a
  dependency of the Blender + canvas-sequence workflow.

## Scope and safety

No live website deployment, global shell modification, account permission
change, or purchase was performed. The original `meridian` source checkout and
its shared `node_modules` installation were not modified. Website source, assets,
tests and documentation were authored in the isolated preview worktree.
Blender and Figma were added to Applications without replacing existing apps.
Downloaded installers remain in `/tmp/canli-design-setup.wresXJ`; the Blender
disk image has been unmounted. The original 96-frame sequence is now delivered;
source integration, staging verification and release approval remain separate.
