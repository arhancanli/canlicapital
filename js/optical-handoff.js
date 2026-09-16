import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
gsap.registerPlugin(ScrollTrigger);

export function createOpticalHandoff() {
  // The homepage ends with compact links. Other page families remain unchanged
  // until their separately approved shared-shell phase.
  if (document.body.classList.contains('atlas-complete')) return;
  const root = document.querySelector('.cc-handoff');
  if (!root) return;
  const stage = root.querySelector('.cc-handoff__stage');
  const packet = root.querySelector('.cc-handoff__packet');
  const steps = [...root.querySelectorAll('[data-handoff-step]')];
  const media = gsap.matchMedia();
  media.add({ wide: '(min-width: 1000px) and (min-height: 780px)', motion: '(prefers-reduced-motion: no-preference)' }, context => {
    if (!context.conditions.motion) return;
    const wide = context.conditions.wide;
    const viewport = root.querySelector('.cc-handoff__viewport');
    const syncLayout = () => root.classList.toggle('is-kinetic', wide && viewport.offsetHeight <= innerHeight - 78);
    syncLayout();
    const state = { progress: 0 };
    let stageWidth = stage.clientWidth, stageHeight = stage.clientHeight;
    const setX = gsap.quickSetter(packet, 'x', 'px');
    const setY = gsap.quickSetter(packet, 'y', 'px');
    const setRotation = gsap.quickSetter(packet, 'rotation', 'deg');
    const trace = root.querySelector('.cc-handoff__trace');
    const update = () => {
      const p = state.progress;
      // Follow the same cubic Bezier path drawn by the SVG. Two halves join at
      // the validation aperture; no arbitrary numeric result is animated.
      const t = p < .5 ? p * 2 : (p - .5) * 2;
      const c = p < .5 ? [[120,210],[280,210],[310,85],[500,85]] : [[500,85],[690,85],[720,210],[880,210]];
      const u = 1-t;
      const x = u*u*u*c[0][0] + 3*u*u*t*c[1][0] + 3*u*t*t*c[2][0] + t*t*t*c[3][0];
      const y = u*u*u*c[0][1] + 3*u*u*t*c[1][1] + 3*u*t*t*c[2][1] + t*t*t*c[3][1];
      setX((x/1000-.12)*stageWidth);
      setY((y/300-.7)*stageHeight);
      setRotation(Math.sin(p*Math.PI*2)*12);
      trace.style.strokeDashoffset = String(1-p);
      const phase = p < .32 ? 0 : p < .7 ? 1 : 2;
      root.dataset.handoffPhase = String(phase);
      root.dataset.handoffProgress = p.toFixed(3);
      steps.forEach((step, i) => step.classList.toggle('is-current', i === phase));
    };
    const tl = gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: {
      id: 'optical-handoff', trigger: root,
      start: () => root.classList.contains('is-kinetic') ? 'top 78px' : stage.getBoundingClientRect().top + scrollY - innerHeight * .85,
      end: () => root.classList.contains('is-kinetic') ? 'bottom bottom' : stage.getBoundingClientRect().bottom + scrollY - innerHeight * .25,
      scrub: .55,
      onRefresh: trigger => { stageWidth = stage.clientWidth; stageHeight = stage.clientHeight; root.dataset.handoffStart = String(trigger.start); root.dataset.handoffEnd = String(trigger.end); update(); },
    } });
    tl.to(state, { progress: 1, duration: 1, onUpdate: update }, 0)
      .to(root.querySelector('.cc-handoff__gate'), { rotation: 35, duration: 1 }, 0);
    update();
    // Enlarged text must never be trapped inside a viewport-height scene.
    let resizeFrame;
    const resize = new ResizeObserver(() => {
      const previous = root.classList.contains('is-kinetic');
      syncLayout();
      if (previous !== root.classList.contains('is-kinetic')) {
        cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(() => ScrollTrigger.refresh());
      }
    });
    resize.observe(viewport);
    const focusStep = event => {
      const link = event.target.closest('[data-handoff-step]');
      if (!link || !root.classList.contains('is-kinetic')) return;
      const fraction = Number(link.dataset.handoffStep)/2;
      const trigger = tl.scrollTrigger;
      scrollTo({ top: trigger.start+(trigger.end-trigger.start)*fraction, behavior: 'instant' });
      tl.progress(fraction);
    };
    root.addEventListener('focusin', focusStep);
    return () => {
      root.classList.remove('is-kinetic');
      resize.disconnect();
      cancelAnimationFrame(resizeFrame);
      root.removeEventListener('focusin', focusStep);
      steps.forEach(step => step.classList.remove('is-current'));
      gsap.set(packet, { clearProps: 'transform' });
      trace.style.removeProperty('stroke-dashoffset');
      delete root.dataset.handoffPhase;
      delete root.dataset.handoffProgress;
      delete root.dataset.handoffStart;
      delete root.dataset.handoffEnd;
    };
  });
}
