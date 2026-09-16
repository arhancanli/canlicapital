import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { createDistinctScenes } from './distinct-scenes.js';
import { createLowerChapters } from './lower-chapters.js';
import { createPublicationChapters } from './publication-chapters.js';
gsap.registerPlugin(ScrollTrigger);

export function createOpticalJourney() {
  const destroyContinuity = createDistinctScenes();
  const destroyLowerChapters = createLowerChapters();
  const destroyPublication = createPublicationChapters();
  const media = gsap.matchMedia();
  media.add({ desktop: '(min-width: 1000px)', motion: '(prefers-reduced-motion: no-preference)' }, context => {
    if (!context.conditions.motion) return;
    const desktop = context.conditions.desktop;
    const amount = desktop ? 42 : 18;
    const timelines = [];
    // Transform-only staging: never make the product, data, or controls invisible.
    function enter(sectionSelector, targetSelector, { stagger = .07, y = amount } = {}) {
      const section = document.querySelector(sectionSelector);
      const targets = section && [...section.querySelectorAll(targetSelector)];
      if (!targets?.length) return;
      const tl = gsap.timeline({ scrollTrigger: { trigger: section, start: 'top 88%', toggleActions: 'play none none none' } });
      tl.from(targets, { y, duration: .9, stagger, ease: 'power3.out', immediateRender: false, clearProps: 'transform' });
      timelines.push({ section, tl });
      section.dataset.journeyMotion = 'entrance';
    }
    enter('.cinema-intro', 'h2, .cinema-intro__copy', { stagger: .12 });
    enter('.sleeves', '.section-heading > *');
    document.querySelectorAll('.sleeve-row').forEach((row, i) => {
      row.dataset.journeyMotion = 'strategy';
      gsap.fromTo(row.querySelector('.sleeve-name'), { x: desktop ? 35 : 12 }, {
        x: 0, ease: 'none', scrollTrigger: { trigger: row, start: 'top 90%', end: 'top 45%', scrub: .45 },
      });
      gsap.fromTo(row.querySelector('.sleeve-index'), { rotation: -20, y: 12 }, {
        rotation: 0, y: 0, duration: .8, ease: 'power3.out', scrollTrigger: { trigger: row, start: 'top 85%', toggleActions: 'play none none none' },
      });
    });
    enter('.record-chapter', '.record-chapter__copy > *');
    const chain = document.querySelector('.record-chapter .evidence-chain');
    if (chain) gsap.from(chain.querySelectorAll(':scope > i'), { x: -15, scaleX: .3, duration: .8, stagger: .16, ease: 'power3.out', immediateRender: false,
      scrollTrigger: { trigger: chain, start: 'top 88%', toggleActions: 'play none none none' } });
    const consoleEl = document.querySelector('.record-chapter .live-console');
    if (consoleEl) {
      consoleEl.dataset.journeyMotion = 'product';
      gsap.fromTo(consoleEl, { y: amount, scale: desktop ? .965 : 1 }, { y: 0, scale: 1, ease: 'none',
        scrollTrigger: { trigger: consoleEl, start: 'top 95%', end: 'top 30%', scrub: .45 } });
      // The existing tab handler owns the actual curve and numbers. Only the
      // chart surface settles on interaction; no fake curve or changing values.
      const settle = event => {
        if (!event.detail || !event.target.closest('[data-curve-key]')) return;
        gsap.fromTo(consoleEl.querySelector('.console-chart svg'), { y: 4 }, { y: 0, duration: .2, ease: 'power2.out', overwrite: true });
      };
      consoleEl.addEventListener('click', settle);
      context.consoleCleanup = () => consoleEl.removeEventListener('click', settle);
    }
    enter('.developer-chapter', '.developer-chapter__copy > *', { stagger: .09 });
    const api = document.querySelector('.api-preview');
    if (api) {
      api.dataset.journeyMotion = 'api';
      const tl = gsap.timeline({ scrollTrigger: { trigger: api, start: 'top 90%', toggleActions: 'play none none none' } });
      tl.from(api, { y: amount * 1.5, duration: 1, ease: 'power3.out', immediateRender: false }, 0)
        .from(api.querySelectorAll('.api-preview__steps li span'), { rotation: -90, scale: .7, duration: .7, stagger: .12, ease: 'power3.out', immediateRender: false }, .15);
      timelines.push({ section: api, tl });
    }
    // Full evidence remains open in HTML. These are the real artifacts and
    // controls, not decorative substitute product screenshots.
    enter('.offering', '.offering__intro, .offering__grid > article');
    enter('.evidence-core', '.evidence-core__copy, .evidence-core__stage');
    enter('.system-films', '.system-films__head');
    enter('.trace', '.section-heading');
    const traceLine = document.querySelector('.trace-line');
    if (traceLine && !desktop) {
      traceLine.dataset.journeyMotion = 'decision-route';
      gsap.fromTo(traceLine, { '--trace-progress': 0 }, { '--trace-progress': 1, ease: 'none',
        scrollTrigger: { trigger: traceLine, start: 'top 75%', end: 'bottom 60%', scrub: .5 } });
      traceLine.querySelectorAll('li').forEach(row => gsap.from(row, { x: 18, duration: .75, ease: 'power3.out', immediateRender: false,
        scrollTrigger: { trigger: row, start: 'top 90%', toggleActions: 'play none none none' } }));
    }
    enter('.research', '.research__intro > *');
    document.querySelectorAll('.paper-card').forEach(card => {
      card.dataset.journeyMotion = 'research';
      gsap.from(card, { y: amount, duration: 1, ease: 'power3.out', immediateRender: false,
        scrollTrigger: { trigger: card, start: 'top 90%', toggleActions: 'play none none none' } });
    });
    enter('.evidence', '.section-heading, .evidence-ledger > article');
    enter('.evidence-frontier', ':scope > article', { y: 20 });
    enter('.evidence-detail', '.evidence-detail__head, .evidence-detail__grid > article', { y: 20 });
    enter('.broker-matrix', ':scope > div', { y: 12, stagger: .05 });
    enter('.basis-grid', ':scope > *', { y: 20 });
    enter('.trust', '.section-heading, .trust-grid > article');
    enter('.home-questions', 'h2, .home-questions__list > details', { stagger: .06, y: 16 });
    enter('.access', ':scope > div, :scope > form', { stagger: .12 });
    const signature = document.querySelector('.cinema-intro__signature');
    if (signature) gsap.fromTo(signature.querySelector('span'), { rotation: -45 }, { rotation: 0, ease: 'none',
      scrollTrigger: { trigger: signature, start: 'top bottom', end: 'bottom 60%', scrub: .5 } });

    // Keyboard and hash jumps settle entrances before focusing the real control.
    const settleFocus = event => timelines.forEach(({ section, tl }) => {
      if (section.contains(event.target)) tl.progress(1);
    });
    document.addEventListener('focusin', settleFocus);
    return () => { document.removeEventListener('focusin', settleFocus); context.consoleCleanup?.(); };
  });
  return () => { media.revert(); destroyPublication(); destroyLowerChapters(); destroyContinuity(); };
}
