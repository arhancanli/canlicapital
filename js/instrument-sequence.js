import { createOpticalSculpture } from './optical-sculpture.js';

// Same seek/destroy contract, now using the opening's actual optical geometry.
export function createInstrumentSequence(root) {
  if (!root || navigator.connection?.saveData) return null;
  if (root.hasAttribute('data-atlas-process')) {
    // Native document study replaces the unrelated optical assembly here only.
    // Existing optional evidence scenes retain their own renderer.
    const image = root.querySelector('img');
    return {
      seek(progress) {
        const p = Math.max(0, Math.min(1, progress));
        root.dataset.opticalProgress = p.toFixed(3);
        image.style.transform = `translate3d(${(p - .5) * -4}%, 0, 0)`;
      },
      destroy() { image.style.removeProperty('transform'); delete root.dataset.opticalProgress; },
    };
  }
  const sculpture = createOpticalSculpture(root);
  root.classList.add('has-optical-sculpture');
  return {
    seek(progress) {
      const p = Math.max(0, Math.min(1, progress));
      sculpture.layers.forEach((layer, i) => {
        const offset = i === 4 ? 0 : (i - 1.5) * p * 15;
        layer.style.transform = `translate3d(${offset}%, ${-offset * .18}%, 0)`;
      });
      sculpture.element.style.transform = `rotate(${-8 + p * 16}deg) scale(${1 - p * .18})`;
      root.dataset.opticalProgress = p.toFixed(3);
    },
    destroy() { sculpture.destroy(); root.classList.remove('has-optical-sculpture'); delete root.dataset.opticalProgress; },
  };
}
