// Playback truth comes from media events, not an assumed autoplay success.
export function createOpticalFilmControl(film, toggle, { source, saveData = false } = {}) {
  let visible = false;
  let userPaused = false;
  let autoplayRefused = false;
  let userAllowed = false;
  let disposed = false;
  let pending = false;
  const paint = () => {
    const playing = !film.paused && !film.ended;
    toggle.textContent = playing ? 'Pause optical film' : 'Play optical film';
    toggle.removeAttribute('aria-pressed');
  };
  const sync = () => {
    if (disposed) return;
    if (!visible || document.hidden || userPaused || (saveData && !userAllowed)) {
      film.pause();
      paint();
      return;
    }
    if (pending || autoplayRefused || !film.paused) return;
    if (!film.getAttribute('src')) film.src = source;
    pending = true;
    Promise.resolve(film.play()).catch(() => { autoplayRefused = true; }).finally(() => {
      pending = false;
      if (disposed) return;
      // A play request may settle after the scene exits or the user pauses.
      if (!visible || document.hidden || userPaused) film.pause();
      paint();
    });
  };
  const click = () => {
    if (!film.paused) userPaused = true;
    else { userPaused = false; autoplayRefused = false; userAllowed = true; }
    sync();
  };
  const observer = new IntersectionObserver(entries => {
    visible = entries.some(entry => entry.isIntersecting);
    sync();
  }, { threshold: .05 });
  observer.observe(film);
  toggle.addEventListener('click', click);
  document.addEventListener('visibilitychange', sync);
  for (const event of ['play', 'pause', 'ended', 'error']) film.addEventListener(event, paint);
  paint();
  return () => {
    disposed = true;
    observer.disconnect();
    toggle.removeEventListener('click', click);
    document.removeEventListener('visibilitychange', sync);
    for (const event of ['play', 'pause', 'ended', 'error']) film.removeEventListener(event, paint);
    film.pause();
    film.removeAttribute('src');
    film.load();
  };
}
