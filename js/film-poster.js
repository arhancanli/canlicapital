// A failed preferred format gets one fallback attempt; never refetch in a loop.
export function prepareFilmPoster(card) {
  const poster = card.querySelector('[data-film-poster]');
  if (!poster || card.dataset.posterReady) return;
  card.dataset.posterReady = 'true';
  let fallbackAttempted = false;
  const message = document.createElement('p');
  message.className = 'film-poster-status';
  message.hidden = true;
  message.setAttribute('role', 'status');
  message.textContent = 'Preview unavailable. The artifact time, state description and evidence link remain below.';
  poster.closest('.system-film__frame').append(message);
  const ready = () => {
    if (!poster.naturalWidth) return;
    card.dataset.posterState = 'ready';
    message.hidden = true;
  };
  const failed = () => {
    if (!fallbackAttempted) {
      fallbackAttempted = true;
      card.dataset.posterState = 'loading';
      poster.closest('picture')?.querySelectorAll('source').forEach(source => source.removeAttribute('srcset'));
      poster.removeAttribute('srcset');
      // The authored img src is the independent PNG fallback.
      poster.src = poster.getAttribute('src');
      return;
    }
    card.dataset.posterState = 'unavailable';
    message.hidden = false;
  };
  poster.addEventListener('load', ready);
  poster.addEventListener('error', failed);
  if (poster.complete && poster.currentSrc) {
    if (poster.naturalWidth) ready(); else failed();
  }
}
