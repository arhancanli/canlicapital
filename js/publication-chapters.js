import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

// Vector artwork is conceptual, not a fabricated API response or performance plot.
export function createPublicationChapters() {
  const developer = document.querySelector('#developer-api');
  if (!developer) return () => {};
  const figure = document.createElement('figure');
  figure.className = 'publication-route';
  figure.innerHTML = `<svg viewBox="0 0 1200 260" aria-hidden="true" focusable="false">
    <path d="M200 150H1000" stroke="#a7b5ff" stroke-width="2" stroke-dasharray="6 10" fill="none"/>
    <g class="publication-sheet" fill="#f4f4f4" stroke="#d1d8fa" stroke-width="2"><path d="M90 25H260L305 70V235H90Z"/><path d="M260 25V70H305" fill="none"/><path d="M125 105H260M125 132H260M125 159H220" stroke="#0016cb" stroke-width="6"/></g>
    <g class="publication-gate" fill="none" stroke="#f4f4f4" stroke-width="4"><path d="M520 25H680V235H520Z"/><path d="M562 85L542 130L562 175M638 85L658 130L638 175M612 70L588 190"/></g>
    <g class="publication-receipt" fill="#f4f4f4" stroke="#d1d8fa" stroke-width="2"><path d="M895 25H1105V225L1084 212L1063 225L1042 212L1021 225L1000 212L979 225L958 212L937 225L916 212L895 225Z"/><path d="M927 73H1073M927 100H1073M927 127H1027" stroke="#0016cb" stroke-width="6"/><path d="M927 175H1073" stroke="#58616b" stroke-width="2"/></g>
    <rect class="publication-packet" x="340" y="142" width="16" height="16" rx="2" fill="#ff5500"/>
  </svg><figcaption><span><strong>Your inputs</strong>Returns and assumptions</span><span><strong>Declared arithmetic</strong>Validation tools</span><span><strong>Inspectable receipt</strong>Calculation and limits</span></figcaption><p>Conceptual workflow. This illustration sends no request and shows no calculated result.</p>`;
  developer.querySelector('.api-preview').before(figure);
  const media = gsap.matchMedia();
  media.add('(prefers-reduced-motion: no-preference)', () => {
    const trigger = { trigger: figure, start: 'top 85%', end: 'bottom 35%', scrub: .4 };
    gsap.fromTo(figure.querySelector('.publication-packet'), { x: 0 }, { x: 500, ease: 'none', scrollTrigger: trigger });
    gsap.fromTo(figure.querySelector('.publication-sheet'), { y: 14 }, { y: -5, ease: 'none', scrollTrigger: trigger });
    gsap.fromTo(figure.querySelector('.publication-receipt'), { y: -8 }, { y: 12, ease: 'none', scrollTrigger: trigger });
    document.querySelectorAll('.paper-card').forEach((card, i) => {
      gsap.fromTo(card, { rotation: (i-1)*1.2 }, { rotation: 0, ease: 'none', scrollTrigger: { trigger: card, start: 'top 95%', end: 'top 55%', scrub: .4 } });
    });
  });
  requestAnimationFrame(() => ScrollTrigger.refresh());
  return () => { media.revert(); figure.remove(); };
}
