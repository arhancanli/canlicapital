// Five original rendered layers, no frame stream or perpetual RAF.
export function createOpticalSculpture(host) {
  const element = document.createElement('div');
  element.className = 'optical-sculpture';
  element.setAttribute('aria-hidden', 'true');
  const poster = document.createElement('img');
  poster.src = '/cinema/optical-master-v3-1536.webp';
  poster.alt = ''; poster.className = 'optical-sculpture__poster';
  element.append(poster);
  const controller = new AbortController();
  let loaded = 0;
  const layers = Array.from({ length: 5 }, () => {
    const img = document.createElement('img');
    img.className = 'optical-sculpture__layer';
    img.alt = ''; img.width = 1536; img.height = 1536; img.decoding = 'async';
    img.addEventListener('load', () => {
      loaded++;
      if (loaded === 5) element.classList.add('is-ready');
    }, { signal: controller.signal });
    element.append(img);
    return img;
  });
  host.append(element);
  // A failed layer preserves the poster; no retries and no blank scene.
  const observer = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    layers.forEach((img, i) => { img.src = `/cinema/optical-layers/layer-${i}.webp`; });
    observer.disconnect();
  }, { rootMargin: '200px' });
  observer.observe(host);
  return { element, layers, destroy() { observer.disconnect(); controller.abort(); element.remove(); } };
}
