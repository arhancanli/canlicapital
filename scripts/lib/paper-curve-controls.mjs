const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

export function renderPaperCurveControls(state) {
  const algorithms = (state?.algorithms ?? []).filter((algorithm) =>
    algorithm?.key && algorithm?.name && Array.isArray(algorithm.live_curve)
      && algorithm.live_curve.length >= 2);
  const initial = algorithms.find((algorithm) => algorithm.key === 'alphac') ?? algorithms[0];
  if (!initial) return '<p>Paper curve marks are not available in this snapshot.</p>';
  return algorithms.map((algorithm) => `<button type="button" data-curve-key="${escapeHtml(algorithm.key)}" aria-pressed="${algorithm === initial}">${escapeHtml(algorithm.key === 'alphac' ? 'Composite' : algorithm.name)}</button>`).join('');
}
