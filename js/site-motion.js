// Shared enhancement. HTML remains the source of information and interaction.
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
gsap.registerPlugin(ScrollTrigger);

const main = document.querySelector('main');
const shell = document.querySelector('[data-product-shell]');
if (main && shell && !document.documentElement.dataset.opticalMotion) {
  document.documentElement.dataset.opticalMotion = 'ready';
  const home = document.body.classList.contains('cinema-home');
  const legacy = ['systems', 'research', 'performance', 'open', 'progress'].includes(document.documentElement.dataset.page);
  const chapters = [...main.querySelectorAll('section')].filter(section =>
    section.querySelector('h2') && !section.parentElement.closest('section'));
  for (const section of chapters) {
    section.dataset.opticalChapter = '';
    const rule = document.createElement('span');
    rule.className = 'cc-chapter-rule';
    rule.setAttribute('aria-hidden', 'true');
    section.prepend(rule);
  }
  const media = gsap.matchMedia();
  media.add('(prefers-reduced-motion: no-preference)', () => {
    const progress = document.createElement('div');
    progress.className = 'cc-reading-progress';
    progress.setAttribute('aria-hidden', 'true');
    document.body.append(progress);
    gsap.fromTo(progress, { scaleX: 0 }, { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: .15 } });

    const hero = home ? null : main.querySelector('.sys-hero, .research-hero, .perf-hero, .dev-hero');
    let art;
    if (hero) {
      art = document.createElement('div');
      art.className = 'cc-optical-backdrop';
      art.setAttribute('aria-hidden', 'true');
      hero.prepend(art);
      hero.classList.add('has-optical-backdrop');
      gsap.fromTo(art, { yPercent: -5 }, { yPercent: 9, ease: 'none',
        scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: .6 } });
    }

    for (const section of chapters) {
      const rule = section.querySelector(':scope > .cc-chapter-rule');
      gsap.fromTo(rule, { scaleX: .08 }, { scaleX: 1, ease: 'none', scrollTrigger: { trigger: section, start: 'top 90%', end: 'top 30%', scrub: .45 } });
      // Legacy hubs already own their heading/diagram timelines. Never double-
      // animate those targets. Documents and generated tools get a gentle lift.
      if (!home && !legacy) {
        const heading = section.querySelector('h2');
        gsap.from(heading, { y: 18, duration: .7, ease: 'power3.out', immediateRender: false,
          scrollTrigger: { trigger: section, start: 'top 90%', toggleActions: 'play none none none' } });
      }
    }
    if (!home && !legacy) {
      const title = document.querySelector('h1');
      if (title) gsap.from(title, { y: 20, duration: .8, ease: 'power3.out', clearProps: 'transform' });
      // Papers use semantic article/h2 markup rather than section wrappers.
      main.querySelectorAll('.paper__body > h2').forEach(heading => {
        heading.dataset.journeyMotion = 'document';
        gsap.from(heading, { x: -12, duration: .65, ease: 'power3.out', immediateRender: false,
          scrollTrigger: { trigger: heading, start: 'top 92%', toggleActions: 'play none none none' } });
      });
    }
    const footer = document.querySelector('.cc-footer');
    const wordmark = footer?.querySelector('.cc-footer__wordmark');
    if (wordmark) {
      gsap.fromTo(wordmark, { yPercent: 26 }, { yPercent: 0, ease: 'none', scrollTrigger: { trigger: wordmark, start: 'top bottom', end: 'bottom bottom', scrub: .6 } });
      gsap.fromTo(wordmark.querySelector('span'), { rotation: -45 }, { rotation: 0, ease: 'none', scrollTrigger: { trigger: footer, start: 'top bottom', end: 'bottom bottom', scrub: .6 } });
    }
    const menu = document.querySelector('.cc-shell__index');
    const animateMenu = () => {
      if (!menu.open) return;
      gsap.fromTo(menu.querySelector('.cc-shell__panel'), { y: -8 }, { y: 0, duration: .22, ease: 'power2.out', clearProps: 'transform', overwrite: true });
    };
    menu?.addEventListener('toggle', animateMenu);
    return () => { progress.remove(); art?.remove(); hero?.classList.remove('has-optical-backdrop'); menu?.removeEventListener('toggle', animateMenu); };
  });
  let refreshFrame;
  const refresh = () => {
    cancelAnimationFrame(refreshFrame);
    refreshFrame = requestAnimationFrame(() => { ScrollTrigger.sort(); ScrollTrigger.refresh(); });
  };
  main.addEventListener('toggle', refresh, true);
  main.querySelectorAll('img').forEach(img => { if (!img.complete) img.addEventListener('load', refresh, { once: true }); });
  document.fonts?.ready.then(refresh);
  addEventListener('pageshow', refresh);
  addEventListener('canli:content-layout', refresh);
}
