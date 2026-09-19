// Coverage belongs to the selected accounting concept, not the retrieval date.
// Old coverage does not establish that the issuer stopped filing or ceased trading.
export function companyCoverage(observations, fetchedAt) {
  if (!observations.length) throw new Error('Coverage requires observations');
  const starts = observations.map(row => row.start ?? row.end).sort();
  const ends = observations.map(row => row.end).sort();
  const cutoff = new Date(fetchedAt);
  if (!Number.isFinite(cutoff.getTime())) throw new Error('Invalid coverage capture date');
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 2);
  return { first: starts[0], last: ends.at(-1), units: [...new Set(observations.map(row => row.unit))].sort(), historicalOnly: ends.at(-1) < cutoff.toISOString().slice(0, 10) };
}

export function latestObservationsByUnit(observations) {
  const units = [...new Set(observations.map(row => row.unit))].sort();
  return units.flatMap(unit => {
    const rows = observations.filter(row => row.unit === unit);
    const latestEnd = rows.map(row => row.end).sort().at(-1);
    // Retain distinct reporting intervals with the same end date. The overview
    // shows both start and end, so an annual interval is never silently replaced.
    return rows.filter(row => row.end === latestEnd).sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''));
  });
}
