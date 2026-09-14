import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { createOpticalSculpture } from './optical-sculpture.js';

// The opening's optical geometry persists across the entire product journey. It never
// consumes data, changes a result, captures input, or enters the tab order.
export function createResearchContinuity() {
  const root = document.querySelector('.research-journey');
  if (!root) return () => {};
  const media = gsap.matchMedia();
  media.add('(min-width: 1280px) and (min-height: 760px) and (prefers-reduced-motion: no-preference)', () => {
    const rail = document.createElement('div');
    rail.className = 'research-journey__rail';
    rail.setAttribute('aria-hidden', 'true');
    rail.innerHTML = `<div class="research-journey__viewport">
      <div class="research-journey__caption"><span>GLASSBOX / OPEN RESEARCH</span><span class="research-journey__chapter">Research</span></div>
      <div class="research-journey__orbit"></div>
      <div class="research-journey__stage"><div class="research-journey__packet"></div></div>
      <div class="research-journey__foot"><span>CONCEPTUAL RESEARCH PATH</span><div><i></i></div><span>Scroll to inspect ↓</span></div>
    </div>`;
    root.prepend(rail);
    root.classList.add('has-continuity');
    const packet = rail.querySelector('.research-journey__packet');
    const sculpture = createOpticalSculpture(packet);
    const layers = sculpture.layers;
    const orbit = rail.querySelector('.research-journey__orbit');
    const caption = rail.querySelector('.research-journey__chapter');
    const stages = [
      { selector: '.cinema-process', label: 'The process', ry: -8, rx: 0, rz: -12, spread: 40, scale: .85 },
      { selector: '.sleeves', label: 'The strategies', ry: 12, rx: 0, rz: 10, spread: 45, scale: .82 },
      { selector: '.record-chapter', label: 'The record', ry: -12, rx: 0, rz: -5, spread: 28, scale: .95 },
      { selector: '.developer-chapter', label: 'For developers', ry: 18, rx: 0, rz: 15, spread: 55, scale: .8 },
      { selector: '#record-details', label: 'Look inside', ry: -18, rx: 0, rz: -10, spread: 38, scale: .9 },
      { selector: '.research', label: 'Research', ry: -32, rx: 16, rz: -16, spread: 20, scale: .9, color: '#000000' },
      { selector: '#evidence-details', label: 'Evidence', ry: 30, rx: -12, rz: 12, spread: 72, scale: .82, color: '#071024' },
      { selector: '.trust', label: 'Accountability', ry: -22, rx: 24, rz: -9, spread: 42, scale: .95, color: '#000000' },
      { selector: '.home-questions', label: 'Inspection', ry: 38, rx: -20, rz: 7, spread: 65, scale: .85, color: '#080c24' },
      { selector: '.access', label: 'Access', ry: 0, rx: 0, rz: 0, spread: 9, scale: 1, color: '#0016cb' },
    ];
    const apply = (stage, tl, position = 0) => {
      const vars = { rotationY: stage.ry, rotationX: stage.rx, rotation: stage.rz, scale: stage.scale };
      if (!tl) {
        gsap.set(packet, vars);
        layers.forEach((layer, i) => gsap.set(layer, { xPercent: i === 4 ? 0 : (i - 1.5) * stage.spread * .28 }));
        return;
      }
      tl.to(packet, vars, position)
        .to(orbit, { rotation: stage.ry * 3, scale: stage.scale * 1.1 }, position);
      layers.forEach((layer, i) => tl.to(layer, { xPercent: i === 4 ? 0 : (i - 1.5) * stage.spread * .28 }, position));
    };
    apply({ ...stages[0], spread: 3, scale: 1 });
    const opening = gsap.timeline({ defaults: { duration: 1, ease: 'none' }, scrollTrigger: {
      trigger: root.querySelector('.cinema-process'), start: 'top 78px', end: 'bottom 60%', scrub: .5,
    } });
    apply(stages[0], opening);
    caption.textContent = stages[0].label;
    stages.slice(1).forEach(stage => {
      const section = root.querySelector(stage.selector);
      const tl = gsap.timeline({ defaults: { duration: 1, ease: 'none' }, scrollTrigger: {
        trigger: section, start: 'top 95%', end: 'top 30%', scrub: .65, invalidateOnRefresh: true,
        onEnter: () => { caption.textContent = stage.label; root.dataset.continuityChapter = stage.label; },
        onLeaveBack: () => {
          const previous = stages[stages.indexOf(stage) - 1];
          caption.textContent = previous.label; root.dataset.continuityChapter = previous.label;
        },
      } });
      apply(stage, tl);
    });
    gsap.fromTo(rail.querySelector('.research-journey__foot i'), { scaleX: 0 }, { scaleX: 1, ease: 'none',
      scrollTrigger: { trigger: root, start: 'top 78px', end: 'bottom bottom', scrub: true } });
    // Deep-record toggles and font/image layout changes already refresh the
    // page's shared ScrollTriggers. No perpetual RAF or separate scroll listener.
    requestAnimationFrame(() => { ScrollTrigger.sort(); ScrollTrigger.refresh(); });
    return () => { sculpture.destroy(); root.classList.remove('has-continuity'); delete root.dataset.continuityChapter; rail.remove(); };
  });
  return () => media.revert();
}
