import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPaperCurveControls } from './lib/paper-curve-controls.mjs';

const curve = [{ date: '2026-10-01', equity: 100 }, { date: '2026-10-02', equity: 101 }];

test('current controls follow published algorithms without retaining a retired choice', () => {
  const state = { algorithms: [
    { key: 'alphac', name: 'ALPHAC', live_curve: curve },
    { key: 'alphamax', name: 'AlphaMax', live_curve: curve },
  ] };
  const html = renderPaperCurveControls(state);
  assert.match(html, /data-curve-key="alphac" aria-pressed="true"/);
  assert.match(html, /data-curve-key="alphamax" aria-pressed="false">AlphaMax/);
  assert.doesNotMatch(html, /alphaforge/);
});

test('a published algorithm without enough marks does not expose an inert curve choice', () => {
  const html = renderPaperCurveControls({ algorithms: [
    { key: 'empty', name: 'Empty', live_curve: [] },
    { key: 'single', name: 'Single', live_curve: curve.slice(0, 1) },
    { key: 'available', name: 'Available', live_curve: curve },
  ] });
  assert.doesNotMatch(html, /data-curve-key="(?:empty|single)"/);
  assert.match(html, /data-curve-key="available" aria-pressed="true"/);
});

test('published names are escaped and an absent curve has a readable source state', () => {
  const html = renderPaperCurveControls({ algorithms: [{ key: 'a"b', name: 'A & B', live_curve: curve }] });
  assert.match(html, /data-curve-key="a&quot;b"/);
  assert.match(html, />A &amp; B<\/button>/);
  assert.doesNotMatch(renderPaperCurveControls({ algorithms: [] }), /<button/);
  assert.match(renderPaperCurveControls({ algorithms: [] }), /not available in this snapshot/);
});
