import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpticalFilmControl } from './optical-film-control.js';

const settle = () => new Promise(resolve => setImmediate(resolve));
function setup(options = {}) {
  globalThis.document = Object.assign(new EventTarget(), { hidden: false });
  let intersect;
  globalThis.IntersectionObserver = class {
    constructor(callback) { intersect = callback; }
    observe() {}
    disconnect() {}
  };
  const attrs = new Map();
  const film = Object.assign(new EventTarget(), {
    paused: true, ended: false, calls: 0, reject: false,
    getAttribute: name => attrs.get(name),
    removeAttribute: name => attrs.delete(name),
    load() {},
    play() {
      this.calls++;
      if (this.reject) return Promise.reject(new Error('Autoplay refused'));
      this.paused = false; this.dispatchEvent(new Event('play')); return Promise.resolve();
    },
    pause() { this.paused = true; this.dispatchEvent(new Event('pause')); },
  });
  Object.defineProperty(film, 'src', { set: value => attrs.set('src', value) });
  const toggle = Object.assign(new EventTarget(), { textContent: '', removeAttribute() {} });
  const destroy = createOpticalFilmControl(film, toggle, { source: '/film.mp4', ...options });
  return { film, toggle, destroy, enter: () => intersect([{ isIntersecting: true }]),
    leave: () => intersect([{ isIntersecting: false }]), click: () => toggle.dispatchEvent(new Event('click')) };
}

test('refused autoplay displays Play and never retries until explicitly requested', async () => {
  const s = setup(); s.film.reject = true; s.enter(); await settle();
  assert.equal(s.toggle.textContent, 'Play optical film');
  s.leave(); s.enter(); await settle(); assert.equal(s.film.calls, 1);
  s.film.reject = false; s.click(); await settle();
  assert.equal(s.film.calls, 2); assert.equal(s.toggle.textContent, 'Pause optical film'); s.destroy();
});
test('save-data does not fetch the film until a deliberate play request', async () => {
  const s = setup({ saveData: true }); s.enter(); await settle();
  assert.equal(s.film.getAttribute('src'), undefined);
  s.click(); await settle(); assert.equal(s.film.getAttribute('src'), '/film.mp4');
  assert.equal(s.film.paused, false); s.destroy();
});
test('user pause survives scene re-entry and teardown stops playback', async () => {
  const s = setup(); s.enter(); await settle(); s.click();
  s.leave(); s.enter(); await settle(); assert.equal(s.film.paused, true);
  assert.equal(s.toggle.textContent, 'Play optical film');
  s.click(); await settle(); assert.equal(s.film.paused, false);
  s.destroy(); assert.equal(s.film.paused, true); assert.equal(s.film.getAttribute('src'), undefined);
});
