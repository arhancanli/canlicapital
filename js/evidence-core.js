// =============================================================================
// evidence-core.js
// -----------------------------------------------------------------------------
// Drives the Evidence Core section: loads the published trial distribution,
// mounts the WebGL scene, and advances it from the section's own scroll
// position.
//
// This replaced a three.js + GSAP ScrollTrigger implementation. The section is
// pinned by CSS, its progress is one subtraction, and the scene is 9 KB, so
// 628 KB of library was being loaded to compute a fraction and interpolate
// between five arrays.
//
// The section is complete without any of this: the chapter list is real markup,
// and the poster is real CSS. Every failure path below leaves that in place.
// =============================================================================

const SOURCE = "/glassbox/trial_sharpe_distribution.json";

export async function initEvidenceCore(section) {
  const canvas = section?.querySelector("#evidence-core-canvas");
  if (!canvas) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let trials;
  try {
    const response = await fetch(SOURCE, { cache: "force-cache" });
    if (!response.ok) return;
    trials = (await response.json()).ranked;
  } catch {
    return;
  }
  if (!Array.isArray(trials) || !trials.length) return;

  const { createCoreScene } = await import("./core-scene.js");
  const scene = createCoreScene(canvas, trials);
  if (!scene) return;

  section.dataset.renderer = "webgl";
  canvas.setAttribute("role", "img");
  canvas.setAttribute(
    "aria-label",
    `${scene.count} recorded trial identities moving through five states. In the union state ` +
    `${scene.aboveZero} scored above zero on their first measurement and ${scene.belowZero} did not.`,
  );
  canvas.removeAttribute("aria-hidden");

  const chapters = [...section.querySelectorAll("[data-core-chapter]")];
  const label = section.querySelector("#core-stage-label");
  const names = chapters.map((li) => li.querySelector("strong")?.textContent?.trim() ?? "");
  let shown = -1;
  const setChapter = (index) => {
    if (index === shown) return;
    shown = index;
    chapters.forEach((li, i) => li.classList.toggle("is-active", i === index));
    if (label && names[index]) label.textContent = names[index];
  };

  if (reducedMotion) {
    // A single frame at the union state: the one arrangement that carries the
    // finding rather than the transition into it.
    scene.setProgress(0.5);
    scene.renderOnce();
    setChapter(2);
    return;
  }

  // Progress is how far the section has travelled ACROSS the viewport, not how
  // far it has been scrolled past its own pin. The pin version left 119px of
  // travel once the section was tightened, so the morph completed in a flick and
  // every state after the first was unreachable. This gives the full height of
  // the section plus a screen -- about 1,900px -- without adding a pixel to the
  // page.
  const update = () => {
    const rect = section.getBoundingClientRect();
    // The pin is stuck for the whole section, so progress is how far the section
    // has been scrolled THROUGH, which is exactly the distance the pin stays on
    // screen. Every state therefore gets a real share of the scroll.
    const travel = Math.max(1, rect.height - window.innerHeight);
    const progress = Math.min(1, Math.max(0, -rect.top / travel));
    scene.setProgress(progress);
    setChapter(scene.chapterAt(progress));
  };
  update();
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update, { passive: true });

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting && document.visibilityState === "visible") scene.start();
      else scene.stop();
    }
  }, { threshold: 0 });
  observer.observe(section);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") scene.stop();
    else if (section.getBoundingClientRect().bottom > 0) scene.start();
  });
}
