import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

export function createStrategyExhibition() {
  const section = document.querySelector('#sleeves');
  const table = section?.querySelector('.sleeve-table');
  if (!table) return () => {};
  const studies = [
    ['max', 'Rank equities by relative momentum.', 'Universe → relative momentum → paper portfolio'],
    ['trend', 'Read the direction of each market over time.', 'Market history → time-series trend → paper portfolio'],
    ['vintage', 'Express an inflation surprise through two equity ETFs.', 'Inflation release → surprise signal → IWM / SPY spread'],
    ['forge', 'Study funding carry using live exchange books.', 'Exchange books → funding rates → simulated fills'],
  ];
  const figures = [...table.querySelectorAll('.sleeve-row')].map((row, i) => {
    const [scene, explanation, route] = studies[i];
    const figure = document.createElement('figure');
    figure.className = 'strategy-study';
    const image = document.createElement('img');
    image.src = `/cinema/atlas/${scene}-1920.webp`;
    image.srcset = `/cinema/atlas/${scene}-960.webp 960w, /cinema/atlas/${scene}-1920.webp 1920w, /cinema/atlas/${scene}-3840.webp 3840w`;
    image.sizes = '100vw'; image.width = 3840; image.height = 1920;
    image.alt = explanation + ' Conceptual illustration, not market data.';
    image.loading = 'lazy'; image.decoding = 'async';
    const caption = document.createElement('figcaption');
    caption.textContent = route;
    const note = document.createElement('small');
    note.textContent = 'Mechanism illustration / not performance data';
    figure.append(image, caption, note);
    row.querySelector('p').after(figure);
    return figure;
  });
  const media = gsap.matchMedia();
  media.add('(min-width: 1100px) and (min-height: 800px) and (prefers-reduced-motion: no-preference)', () => {
    const rows = [...table.querySelectorAll('.sleeve-row')];
    const viewport = document.createElement('div');
    viewport.className = 'strategy-exhibition';
    table.before(viewport); viewport.append(table);
    const controls = document.createElement('nav');
    controls.className = 'strategy-exhibition__controls';
    controls.setAttribute('aria-label', 'Explore the four strategies');
    const buttons = rows.map((row, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = row.querySelector('h3').textContent;
      button.addEventListener('click', () => jump(i));
      controls.append(button);
      return button;
    });
    viewport.append(controls);
    section.classList.add('has-strategy-exhibition');
    const render = () => {
      const stage = Math.max(0, Math.min(rows.length - 1, Math.round(-Number(gsap.getProperty(table, 'xPercent')) / 25)));
      section.dataset.strategyStage = String(stage);
      buttons.forEach((button, i) => {
        if (stage === i) button.setAttribute('aria-current', 'step');
        else button.removeAttribute('aria-current');
      });
    };
    const timeline = gsap.timeline({ defaults: { ease: 'none' }, onUpdate: render,
      scrollTrigger: { trigger: viewport, pin: viewport, start: 'top 78px',
        end: () => `+=${innerHeight * 3.2}`, scrub: .45, invalidateOnRefresh: true,
        onRefresh: render } });
    // Each strategy receives a reading hold; no snap or wheel interception.
    for (let i = 1; i < rows.length; i++) {
      timeline.to(table, { xPercent: -25 * i, duration: .4 }, i - .4);
    }
    timeline.to({}, { duration: .6 });
    figures.forEach((figure, i) => {
      timeline.fromTo(figure.querySelector('img'), { scale: 1.035, xPercent: 1.5 },
        { scale: 1, xPercent: -1.5, duration: .8 }, i === 0 ? 0 : i - .25);
    });
    function jump(i) {
      const fraction = (i + .25) / timeline.duration();
      const trigger = timeline.scrollTrigger;
      scrollTo({ top: trigger.start + (trigger.end - trigger.start) * fraction, behavior: 'instant' });
      timeline.progress(fraction);
    }
    render();
    requestAnimationFrame(() => { ScrollTrigger.sort(); ScrollTrigger.refresh(); });
    return () => {
      viewport.before(table); viewport.remove();
      section.classList.remove('has-strategy-exhibition');
      delete section.dataset.strategyStage;
    };
  });
  return () => { media.revert(); figures.forEach(figure => figure.remove()); };
}
