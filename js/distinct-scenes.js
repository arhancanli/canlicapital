import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { createInstrumentSequence } from './instrument-sequence.js';

export function createDistinctScenes() {
  const media = gsap.matchMedia();
  // The lower chapters now show native product diagrams, not decorative video.
  media.add('(min-width: 1000px) and (min-height: 760px) and (prefers-reduced-motion: no-preference)', () => {
    const process = document.querySelector('.cinema-process');
    process.classList.add('is-enhanced', 'has-full-scene');
    const art = process.querySelector('[data-instrument-sequence]');
    const track = process.querySelector('.cinema-process__track');
    const sequence = createInstrumentSequence(art);
    const controls = document.createElement('nav');
    controls.className = 'process-controls';
    controls.setAttribute('aria-label', 'Explore the research process');
    const buttons = ['Research', 'Paper observations', 'Publication'].map((label, index) => {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = label;
      button.addEventListener('click', () => go(index));
      controls.append(button); return button;
    });
    process.querySelector('.cinema-process__viewport').append(controls);
    const playhead = { progress: 0 };
    const update = () => {
      const stage = Math.max(0, Math.min(2, Math.round(-Number(gsap.getProperty(track, 'xPercent')) / (100 / 3))));
      process.dataset.processStage = String(stage);
      buttons.forEach((button, i) => i === stage ? button.setAttribute('aria-current', 'step') : button.removeAttribute('aria-current'));
    };
    const timeline = gsap.timeline({ defaults: { ease: 'none' }, onUpdate: update, scrollTrigger: {
      trigger: process, pin: process.querySelector('.cinema-process__viewport'),
      start: 'top 78px', end: () => `+=${innerHeight * 2.8}`, scrub: .45,
      invalidateOnRefresh: true,
      onRefresh: self => {
        process.dataset.sceneStart = self.start; process.dataset.sceneEnd = self.end;
        // Image/font refresh temporarily rewinds child callbacks. Restore the
        // external layer renderer as well as GSAP's own transformed elements.
        sequence?.seek(self.progress);
        update();
      },
    } });
    // Camera movement continues while each chapter has a stable reading hold.
    timeline.to(track, { xPercent: -100 / 3, duration: .4 }, .4)
      .to(track, { xPercent: -200 / 3, duration: .4 }, 1.2)
      .to(playhead, { progress: 1, duration: 2, onUpdate: () => sequence?.seek(playhead.progress) }, 0)
      .fromTo(art, { scale: 1, xPercent: 0 }, { scale: 1.06, xPercent: -2, duration: 1 }, 0)
      .to(art, { scale: 1, xPercent: 2, duration: 1 }, 1);
    function go(index) {
      const fraction = [.1, .5, .9][index];
      const trigger = timeline.scrollTrigger;
      scrollTo({ top: trigger.start + (trigger.end - trigger.start) * fraction, behavior: 'instant' });
      timeline.progress(fraction);
      update();
    }
    let focusFrame;
    const focusChapter = event => {
      const chapter = event.target.closest('[data-process-step]');
      if (!chapter) return;
      cancelAnimationFrame(focusFrame);
      // Safari performs its native focus scroll after dispatching focusin.
      // Follow that default action so it cannot strand the focused link.
      focusFrame = requestAnimationFrame(() => {
        go(Number(chapter.dataset.processStep));
      });
    };
    track.addEventListener('focusin', focusChapter);
    update();
    return () => { controls.remove(); cancelAnimationFrame(focusFrame); sequence?.destroy(); track.removeEventListener('focusin', focusChapter); process.classList.remove('is-enhanced', 'has-full-scene'); delete process.dataset.sceneStart; delete process.dataset.sceneEnd; delete process.dataset.processStage; };
  });
  requestAnimationFrame(() => { ScrollTrigger.sort(); ScrollTrigger.refresh(); });
  return () => media.revert();
}
