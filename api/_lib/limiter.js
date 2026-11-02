// A sliding minute per caller in this function instance; the oldest callers are forgotten past
// maxCallers. Returns the seconds to wait, or 0 to go ahead. A call may pass its own limit (a tier's).
export function slidingMinute({ perMinute: defaultPerMinute, now = () => Date.now(), maxCallers = 10_000 }) {
  const seen = new Map();
  return (key, perMinute = defaultPerMinute) => {
    const t = now();
    const recent = (seen.get(key) ?? []).filter((x) => t - x < 60_000);
    seen.delete(key);
    if (recent.length >= perMinute) {
      seen.set(key, recent);
      return Math.max(1, Math.ceil((60_000 - (t - recent[0])) / 1000));
    }
    recent.push(t);
    seen.set(key, recent);
    if (seen.size > maxCallers) seen.delete(seen.keys().next().value);
    return 0;
  };
}
