import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { createStrategyExhibition } from './strategy-exhibition.js';

// Enhancements keep the original content nodes and all source-bound controls.
export function createLowerChapters() {
  const cleanups = [];
  cleanups.push(createStrategyExhibition());
  const core = document.querySelector('.evidence-core');
  const chapters = [...core.querySelectorAll('[data-core-chapter]')];
  chapters.forEach((chapter, index) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'core-state-button';
    button.disabled = core.dataset.renderer !== 'webgl';
    button.setAttribute('aria-pressed', String(index === 0));
    button.append(...chapter.childNodes); chapter.append(button);
    const select = () => {
      if (core.dataset.renderer !== 'webgl') return;
      core.dataset.selectedCore = String(index);
      core.dispatchEvent(new CustomEvent('core:select', { detail: index }));
      chapters.forEach((li, i) => {
        li.classList.toggle('is-active', i === index);
        li.querySelector('button').setAttribute('aria-pressed', String(i === index));
      });
      core.querySelector('#core-stage-label').textContent = button.querySelector('strong').textContent;
    };
    button.addEventListener('click', select);
    cleanups.push(() => { button.removeEventListener('click', select); chapter.replaceChildren(...button.childNodes); });
  });
  const rendererObserver = new MutationObserver(() => {
    core.querySelectorAll('.core-state-button').forEach(button => { button.disabled = core.dataset.renderer !== 'webgl'; });
  });
  rendererObserver.observe(core, { attributes: true, attributeFilter: ['data-renderer'] });
  cleanups.push(() => rendererObserver.disconnect());
  const follow = document.createElement('button');
  follow.type = 'button'; follow.className = 'core-follow'; follow.textContent = 'Follow scroll';
  const resume = () => { delete core.dataset.selectedCore; core.dispatchEvent(new CustomEvent('core:select', { detail: null })); };
  follow.addEventListener('click', resume);
  core.querySelector('.core-chapters').after(follow);
  cleanups.push(() => { follow.removeEventListener('click', resume); follow.remove(); });

  const films = document.querySelector('.system-films');
  const panels = [...films.querySelectorAll('.system-film')];
  const tabs = document.createElement('div');
  tabs.className = 'film-selector'; tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Choose a system film');
  const names = ['Research state', 'Execution state', 'Publication state'];
  const buttons = panels.map((panel, index) => {
    const button = document.createElement('button');
    button.type = 'button'; button.id = `film-tab-${index}`;
    button.textContent = names[index]; button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', `film-panel-${index}`);
    panel.id = `film-panel-${index}`; panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', button.id);
    tabs.append(button);
    return button;
  });
  const selectFilm = index => {
    buttons.forEach((button, i) => {
      button.setAttribute('aria-selected', String(i === index)); button.tabIndex = i === index ? 0 : -1;
      panels[i].hidden = i !== index;
      if (i !== index) panels[i].querySelector('video')?.pause();
    });
    films.dataset.selectedFilm = String(index);
    ScrollTrigger.refresh();
  };
  const clickFilm = event => { const index = buttons.indexOf(event.target.closest('button')); if (index >= 0) selectFilm(index); };
  const keyFilm = event => {
    const index = buttons.indexOf(document.activeElement);
    if (index < 0 || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
    selectFilm(next); buttons[next].focus();
  };
  const revealFilmHash = () => {
    let hash;
    try { hash = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    const target = document.getElementById(hash);
    const index = panels.findIndex(panel => target && panel.contains(target));
    if (index >= 0) selectFilm(index);
  };
  tabs.addEventListener('click', clickFilm); tabs.addEventListener('keydown', keyFilm);
  films.querySelector('.system-films__head').after(tabs);
  films.classList.add('has-film-selector'); selectFilm(0); revealFilmHash();
  window.addEventListener('hashchange', revealFilmHash);
  cleanups.push(() => {
    window.removeEventListener('hashchange', revealFilmHash); tabs.remove(); films.classList.remove('has-film-selector');
    delete films.dataset.selectedFilm;
    panels.forEach(panel => { panel.hidden = false; panel.removeAttribute('role'); panel.removeAttribute('aria-labelledby'); panel.removeAttribute('id'); });
  });

  // The optional decision record remains a readable five-row ledger. The main
  // process already supplies the cinematic traversal; do not repeat its pin.
  return () => { cleanups.reverse().forEach(cleanup => cleanup()); };
}
