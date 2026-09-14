import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { createInstrumentSequence } from './instrument-sequence.js';

// A conceptual carrying scene, not a visualization of an actual order.
// The five original list items remain the sole source of product copy/links.
export function createDecisionJourney(shell, route, fallbackCourier) {
  const media = gsap.matchMedia();
  const section = shell.closest('.trace');
  const steps = [...route.children];
  media.add('(min-width: 1000px) and (min-height: 760px) and (prefers-reduced-motion: no-preference)', () => {
    section.classList.add('has-decision-journey');
    const viewport = document.createElement('div');
    viewport.className = 'decision-viewport';
    shell.append(viewport); viewport.append(route);
    const world = document.createElement('div');
    world.className = 'decision-world'; world.setAttribute('aria-hidden', 'true');
    viewport.prepend(world);
    const packet = document.createElement('div');
    packet.className = 'decision-packet';
    packet.setAttribute('aria-hidden', 'true');
    const poster = document.createElement('img');
    poster.className = 'decision-poster'; poster.alt = ''; poster.loading = 'lazy';
    poster.src = '/cinema/optical-master-v3-1536.webp'; poster.width = 1536; poster.height = 1536;
    packet.append(poster);
    viewport.append(packet);
    const sequence = createInstrumentSequence(packet);
    const note = document.createElement('p');
    note.className = 'decision-note';
    note.textContent = 'Conceptual route / not an order replay';
    viewport.append(note);
    const controls = document.createElement('nav');
    controls.className = 'decision-controls';
    controls.setAttribute('aria-label', 'Decision journey stages');
    const buttons = steps.map((step, i) => {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = step.querySelector('span').textContent;
      button.setAttribute('aria-label', `Show ${step.querySelector('span').textContent}`);
      controls.append(button);
      const art = document.createElement('div');
      art.className = `decision-environment decision-environment--${i}`;
      art.setAttribute('aria-hidden', 'true');
      art.innerHTML = '<i></i><i></i><i></i><i></i><b></b>';
      if (i === 1) {
        const background = document.createElement('img');
        background.className = 'decision-boundaries'; background.alt = '';
        background.width = 1672; background.height = 941; background.loading = 'lazy';
        background.src = '/cinema/decision-boundaries-v1.webp';
        art.replaceChildren(background);
      }
      world.append(art);
      return button;
    });
    viewport.append(controls);
    const clock = { value: 0 };
    const update = () => {
      const value = clock.value;
      const stage = Math.min(4, Math.round(value));
      section.dataset.decisionStage = String(stage);
      buttons.forEach((button, i) => button.setAttribute('aria-current', i === stage ? 'step' : 'false'));
      sequence?.seek(value / 4);
    };
    const timeline = gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: {
      trigger: shell, pin: viewport, start: 'top 78px',
      end: () => `+=${innerHeight * 4.5}`, scrub: .5, invalidateOnRefresh: true,
      onRefresh: self => { section.dataset.decisionStart = self.start; section.dataset.decisionEnd = self.end; update(); },
    } });
    // Five reading holds interleaved with four spatial handoffs, not a constantly
    // sliding caption. End poses are available through both scroll and buttons.
    for (let i = 0; i < 4; i++) {
      const start = .45 + i;
      timeline.to([route, world], { xPercent: -(i + 1) * 20, duration: .55 }, start)
        .to(clock, { value: i + 1, duration: .55, onUpdate: update }, start);
    }
    timeline.to(clock, { value: 4, duration: .45, onUpdate: update }, 4);
    timeline.fromTo(packet, { xPercent: 18, yPercent: 4, scale: .56, rotation: -12 }, { xPercent: -35, yPercent: 0, scale: .7, rotation: 0, duration: 1.1 }, 0)
      .to(packet, { xPercent: 16, yPercent: 8, scale: .6, rotation: 8, duration: 1.1 }, 1.1)
      .to(packet, { xPercent: 6, yPercent: 3, scale: .65, rotation: -4, duration: 1.1 }, 2.2)
      .to(packet, { xPercent: 20, yPercent: 12, scale: .48, rotation: 12, duration: 1.15 }, 3.3);
    let focusFrame;
    const go = index => {
      const fraction = (index + .2) / 4.45;
      const trigger = timeline.scrollTrigger;
      scrollTo({ top: trigger.start + (trigger.end - trigger.start) * fraction, behavior: 'instant' });
      timeline.progress(fraction); update();
    };
    const click = event => { const index = buttons.indexOf(event.target.closest('button')); if (index >= 0) go(index); };
    const focus = event => {
      const index = steps.findIndex(step => step.contains(event.target));
      if (index < 0) return;
      cancelAnimationFrame(focusFrame);
      focusFrame = requestAnimationFrame(() => go(index));
    };
    controls.addEventListener('click', click);
    route.addEventListener('focusin', focus);
    update();
    return () => {
      cancelAnimationFrame(focusFrame);
      controls.removeEventListener('click', click); route.removeEventListener('focusin', focus);
      sequence?.destroy();
      shell.insertBefore(route, viewport); viewport.remove();
      section.classList.remove('has-decision-journey');
      delete section.dataset.decisionStart; delete section.dataset.decisionEnd; delete section.dataset.decisionStage;
    };
  });
  media.add('(max-width: 999px) and (prefers-reduced-motion: no-preference), (max-height: 759px) and (prefers-reduced-motion: no-preference)', () => {
    gsap.fromTo(fallbackCourier, { y: 0, rotation: -25 }, { y: () => Math.max(0, route.clientHeight - fallbackCourier.clientHeight), rotation: 90, ease: 'none',
      scrollTrigger: { trigger: route, start: 'top 65%', end: 'bottom 65%', scrub: .45, invalidateOnRefresh: true } });
  });
  return () => media.revert();
}
