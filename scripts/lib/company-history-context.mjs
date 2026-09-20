// Equality covers the selected numeric history, not accounting meaning or filing vintage.
export function numericalHistoryKey(concept) {
  const rows = concept.observations.map(row => [concept.kind, row.unit, row.start ?? '', row.end, row.val]);
  rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return JSON.stringify(rows);
}

export function matchingHistoryConcepts(concepts) {
  const groups = new Map();
  for (const concept of concepts) {
    const key = numericalHistoryKey(concept);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(concept);
  }
  return new Map([...groups.values()].flatMap(group => group.map(concept => [concept.tag, group.filter(other => other.tag !== concept.tag)])));
}

export function constantHistoryUnits(concept) {
  const units = new Map();
  for (const row of concept.observations) {
    if (!units.has(row.unit)) units.set(row.unit, []);
    units.get(row.unit).push(row);
  }
  return [...units].filter(([, rows]) => new Set(rows.map(row => row.end)).size >= 2 && new Set(rows.map(row => row.val)).size === 1)
    .map(([unit, rows]) => ({ unit, value: rows[0].val, reportingEnds: new Set(rows.map(row => row.end)).size }));
}
