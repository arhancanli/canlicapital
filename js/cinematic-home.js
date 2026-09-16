import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { createInstrumentSequence } from "./instrument-sequence.js";
import { createOpticalJourney } from "./optical-journey.js";

gsap.registerPlugin(ScrollTrigger);

// The opening uses an original native-resolution Blender optical study developed
// after AI art exploration. Neither it nor the later sequence is trading data.
const media = gsap.matchMedia();
const process = document.querySelector(".cinema-process");
const header = document.querySelector(".cc-shell");
const updateHeader = () => header?.classList.toggle("is-top", scrollY < 40);
addEventListener("scroll", updateHeader, { passive: true });
updateHeader();

function revealHashTarget(hash = location.hash) {
  if (!hash || hash === "#") return;
  let target;
  try { target = document.getElementById(decodeURIComponent(hash.slice(1))); } catch { return; }
  if (!target) return;
  let parent = target.parentElement;
  let opened = false;
  while (parent) {
    if (parent instanceof HTMLDetailsElement && !parent.open) { parent.open = true; opened = true; }
    parent = parent.parentElement;
  }
  if (opened) requestAnimationFrame(() => { ScrollTrigger.refresh(); target.scrollIntoView({ block: "start", behavior: "instant" }); });
}

document.addEventListener("click", event => {
  const link = event.target.closest("a[href]");
  if (!link) return;
  const url = new URL(link.href, location.href);
  if (url.origin === location.origin && url.pathname === location.pathname) revealHashTarget(url.hash);
});
addEventListener("hashchange", () => revealHashTarget());
document.querySelectorAll(".deep-record").forEach(details => details.addEventListener("toggle", () => ScrollTrigger.refresh()));

media.add({ desktop: '(min-width: 1000px)', motion: '(prefers-reduced-motion: no-preference)', continuity: '(min-width: 1280px) and (min-height: 760px)', tall: '(min-height: 850px)' }, context => {
  if (!context.conditions.desktop || !context.conditions.motion) return;
  gsap.to(".cinema-hero__art", {
    yPercent: 3, ease: "none",
    scrollTrigger: { trigger: ".cinema-hero", start: "top top", end: "bottom top", scrub: .6 },
  });
  gsap.fromTo(".optical-threshold__light", { yPercent: 15 }, {
    yPercent: 0, ease: "none",
    scrollTrigger: { trigger: ".optical-threshold", start: "top bottom", end: "bottom 20%", scrub: .6 },
  });
});

media.add("(max-width: 999px) and (prefers-reduced-motion: no-preference)", () => {
  const root = process?.querySelector('[data-instrument-sequence]');
  if (!root) return;
  const sequence = createInstrumentSequence(root);
  const playhead = { progress: 0 };
  gsap.to(playhead, { progress: 1, ease: 'none', onUpdate: () => sequence?.seek(playhead.progress),
    scrollTrigger: { trigger: root, start: 'top 90%', end: 'bottom 20%', scrub: .3 } });
  return () => sequence?.destroy();
});

createOpticalJourney();

document.fonts?.ready.then(() => ScrollTrigger.refresh());
document.querySelectorAll(".cinema-home img").forEach(img => {
  if (!img.complete) img.addEventListener("load", () => ScrollTrigger.refresh(), { once: true });
});
addEventListener("pageshow", () => { ScrollTrigger.refresh(); revealHashTarget(); });
revealHashTarget();
