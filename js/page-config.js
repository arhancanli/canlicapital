// =============================================================================
// CANLI CAPITAL / page-config.js
// -----------------------------------------------------------------------------
// The per-page parameters that let the SHARED bootstrap (main.js + scroll.js +
// scene.js) drive every page without forking a second system. Each page declares
// a tiny config object inline in its <head> as window.__MERIDIAN_PAGE; this
// module reads it and fills in safe defaults (the landing's values), so a page
// that declares nothing still behaves exactly like the original landing.
//
// The contract (all optional):
//   id        : string  page identity, mirrors <html data-page>. Default: the
//               html data-page attribute, or "home".
//   chapters  : [string] rail chapter labels, fed to the living chapter counter
//               in scroll.js (replaces the old hardcoded CHAPTER_NAMES). Default:
//               the landing's nine chapters.
//   sceneBand : [lo, hi] the sub-range of the global manifold state arc (0..1)
//               that THIS page occupies. scroll.js remaps the page's local scroll
//               progress into this band before calling scene.setScroll, so each
//               sub-page sits in its own chapter of the one shared scene (see
//               DESIGN_SYSTEM section 5). Default [0,1] (the landing uses the
//               whole arc). The landing's tentpole pin still drives setConverge
//               directly; the band only shapes the ambient scroll-state morph.
//   sceneStill: number  the scroll position (0..1, global arc) to freeze the
//               scene at for reduced-motion / no-scroll static frames, so the
//               page's thesis is legible even frozen. Default: midpoint of the
//               band.
//
// Nothing here changes the scene's public contract; it only chooses WHERE on the
// existing state arc a page lives. That is the whole point: one scene engine,
// four chapters, no second world.
// =============================================================================

const DEFAULTS = {
  chapters: [
    "Overview", "Thesis", "ALPHAC", "Systems",
    "Discipline", "Performance", "The glass box", "Progress", "Waitlist", "Colophon",
  ],
  sceneBand: [0, 1],
};

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

export function getPageConfig() {
  const raw = (typeof window !== "undefined" && window.__MERIDIAN_PAGE) || {};
  const id = raw.id
    || document.documentElement.getAttribute("data-page")
    || "home";

  const chapters = Array.isArray(raw.chapters) && raw.chapters.length
    ? raw.chapters
    : DEFAULTS.chapters;

  let band = Array.isArray(raw.sceneBand) && raw.sceneBand.length === 2
    ? [clamp01(raw.sceneBand[0]), clamp01(raw.sceneBand[1])]
    : DEFAULTS.sceneBand;
  // guard against an inverted band so the remap is always monotonic
  if (band[1] < band[0]) band = [band[1], band[0]];

  const sceneStill = typeof raw.sceneStill === "number"
    ? clamp01(raw.sceneStill)
    : (band[0] + band[1]) / 2;

  return { id, chapters, sceneBand: band, sceneStill };
}

// Map a page's local scroll progress (0..1) into its slice of the global state
// arc. The landing's default band [0,1] makes this the identity, so the landing
// is byte-unchanged; a sub-page band like [0.8,1] keeps it in the high-converge
// chapter described in the design system.
export function mapScroll(localP, band) {
  const lo = band[0];
  const hi = band[1];
  return lo + clamp01(localP) * (hi - lo);
}
