// =============================================================================
// entry-mount.js
// -----------------------------------------------------------------------------
// Mounts the entry scene on the homepage hero and drives it from scroll.
//
// Every exit is a real one: no WebGL, reduced motion, an unfetchable artifact,
// or an off-screen page each leave the hero exactly as it renders without
// JavaScript. The scene is an enhancement over a page that is already complete.
// =============================================================================

const CANVAS_ID = "entry-scene";
const SOURCE = "/glassbox/trial_sharpe_distribution.json";

async function mount() {
  const canvas = document.getElementById(CANVAS_ID);
  if (!canvas) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let distribution;
  try {
    const response = await fetch(SOURCE, { cache: "force-cache" });
    if (!response.ok) return;
    distribution = await response.json();
  } catch {
    // A field with no data is not drawn. There is no placeholder geometry here,
    // because a decorative scatter of invented points on this site would be a
    // picture of numbers that do not exist.
    return;
  }

  const { createEntryScene } = await import("./entry-scene.js");
  const scene = createEntryScene(canvas, distribution, { reducedMotion });
  if (!scene) return;

  // Describe what is actually on screen. A reader who cannot see it still learns
  // the finding, which is the part that matters.
  const summary = distribution.summary ?? {};
  canvas.setAttribute("role", "img");
  canvas.setAttribute(
    "aria-label",
    `${scene.pointCount} recorded trial identities positioned by the Sharpe ratio each one measured. ` +
    `The median is ${summary.median}, and ${summary.share_above_zero_pct}% score above zero.`,
  );
  canvas.removeAttribute("aria-hidden");
  canvas.classList.add("is-ready");

  if (reducedMotion) {
    scene.renderOnce();
    return;
  }

  const hero = canvas.closest(".hero") ?? document.body;
  const onScroll = () => {
    const rect = hero.getBoundingClientRect();
    const travelled = -rect.top / Math.max(rect.height, 1);
    scene.setScroll(travelled);
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  // Stop when it cannot be seen. A hidden canvas that keeps animating is a
  // battery cost paid for nothing.
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting && document.visibilityState === "visible") scene.start();
      else scene.stop();
    }
  }, { threshold: 0 });
  observer.observe(canvas);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") scene.stop();
    else if (canvas.getBoundingClientRect().bottom > 0) scene.start();
  });
}

mount();
