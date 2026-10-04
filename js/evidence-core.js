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

  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");

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
    chapters.forEach((li, i) => {
      li.classList.toggle("is-active", i === index);
      li.querySelector('button')?.setAttribute('aria-pressed', String(i === index));
    });
    if (label && names[index]) label.textContent = names[index];
  };

  const renderStatic = () => {
    // A single frame at the union state: the one arrangement that carries the
    // finding rather than the transition into it.
    scene.stop();
    section.dataset.motion = "static";
    const index = section.dataset.selectedCore === undefined ? 2 : Math.min(4, Math.max(0, Number(section.dataset.selectedCore)));
    scene.setProgress(index / 4);
    scene.renderOnce();
    setChapter(index);
  };

  // Desktop progress spans the whole CSS pin, so each state gets a share of
  // native scroll. A phone uses the compact stage's passage through the viewport.
  const update = () => {
    if (section.dataset.selectedCore !== undefined) {
      const index = Math.min(4, Math.max(0, Number(section.dataset.selectedCore)));
      scene.setProgress(index / 4); scene.renderOnce(); setChapter(index); return;
    }
    if (motionPreference.matches) return;
    const pin = section.querySelector('.evidence-core__pin');
    const pinned = getComputedStyle(pin).position === 'sticky';
    let progress;
    if (pinned) {
      const top = Number.parseFloat(getComputedStyle(pin).top) || 0;
      const travel = Math.max(1, section.offsetHeight - pin.offsetHeight);
      progress = (top - section.getBoundingClientRect().top) / travel;
    } else {
      const stage = section.querySelector('.evidence-core__stage').getBoundingClientRect();
      const travel = Math.max(1, stage.height + window.innerHeight * .5);
      progress = (window.innerHeight * .75 - stage.top) / travel;
    }
    progress = Math.min(1, Math.max(0, progress));
    scene.setProgress(progress);
    setChapter(scene.chapterAt(progress));
  };
  let nearViewport = false;
  const syncPlayback = () => {
    if (motionPreference.matches) { renderStatic(); return; }
    section.dataset.motion = "scroll";
    update();
    if (nearViewport && document.visibilityState === "visible") scene.start();
    else scene.stop();
  };
  motionPreference.addEventListener("change", syncPlayback);
  section.addEventListener('core:select', () => {
    shown = -1;
    if (section.dataset.selectedCore === undefined && motionPreference.matches) renderStatic();
    else update();
  });
  syncPlayback();
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update, { passive: true });

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      nearViewport = entry.isIntersecting;
      syncPlayback();
    }
  }, { threshold: 0 });
  observer.observe(section);
  document.addEventListener("visibilitychange", syncPlayback);
}
