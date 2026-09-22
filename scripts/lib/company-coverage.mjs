// Coverage belongs to the selected accounting concept, not the retrieval date.
// Old coverage does not establish that the issuer stopped filing or ceased trading.
// The latest accepted filing behind a company record, and whether the record
// ended more than two years before capture (the same cutoff the coverage note
// uses for a single history). A historical filer's pages state this at company
// level; nothing here claims a current status.
export function latestFiling(company) {
  let latest = null;
  for (const concept of company.concepts ?? []) for (const row of concept.observations ?? []) {
    if (typeof row.filed === 'string' && (!latest || row.filed > latest.filed)) latest = { filed: row.filed, form: typeof row.form === 'string' ? row.form : null, accn: typeof row.accn === 'string' ? row.accn : null };
  }
  return latest;
}
export function historicalCutoff(fetchedAt) {
  const cutoff = new Date(fetchedAt);
  if (!Number.isFinite(cutoff.getTime())) throw new Error('Invalid capture date');
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 2);
  return cutoff.toISOString().slice(0, 10);
}
export function historicalFiler(company) {
  const latest = latestFiling(company);
  return latest !== null && latest.filed < historicalCutoff(company.fetched_at);
}

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

export function coverageByUnit(observations, fetchedAt) {
  return [...new Set(observations.map(row => row.unit))].sort().map(unit => ({
    unit, ...companyCoverage(observations.filter(row => row.unit === unit), fetchedAt),
  }));
}
