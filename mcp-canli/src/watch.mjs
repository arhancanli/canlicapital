// A live feed of SEC filings: EDGAR's latest-filings feed (through the markets pack's
// latest_filings) read every `every` seconds, each filing not seen before emitted once as a line of
// JSON, oldest first. EDGAR posts a filing within a minute or so of accepting it, so a 30-60 second
// poll sees most filings within about two minutes. Pipe the lines anywhere: a file, a queue, or a
// webhook (`canli-mcp watch --forms 8-K | while read -r l; do curl -s -d "$l" "$HOOK"; done`).
export const MIN_EVERY = 15;
const SEEN_MAX = 5000;

export async function watchFilings(latest, { forms, company, event, every = 60, rounds = Infinity, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}, emit) {
  const wait = Math.max(MIN_EVERY, Number.isFinite(every) ? every : 60) * 1000;
  const seen = new Set();
  let first = true;
  for (let round = 0; round < rounds; round += 1) {
    try {
      const r = await latest({ ...(forms?.length ? { forms } : {}), ...(company ? { company } : {}), ...(event ? { event } : {}), limit: 100 });
      const cols = r.columns ?? [];
      const rows = (r.rows ?? []).map((row) => Object.fromEntries(cols.map((c, i) => [c, row[i]])));
      // The first read only marks what is already there, so the feed starts with what comes next.
      const fresh = rows.filter((f) => f.accession && !seen.has(f.accession)).reverse();
      for (const f of fresh) {
        seen.add(f.accession);
        if (!first) emit(JSON.stringify({ type: "filing", ...f }));
      }
      if (first) emit(JSON.stringify({ type: "watching", forms: forms ?? "all", company: company ?? null, event: event ?? null, every_seconds: wait / 1000, already_filed: fresh.length }));
      first = false;
      if (seen.size > SEEN_MAX) for (const k of [...seen].slice(0, seen.size - SEEN_MAX)) seen.delete(k);
    } catch (e) {
      emit(JSON.stringify({ type: "error", message: String(e?.message ?? e).slice(0, 300) }));
    }
    if (round + 1 < rounds) await sleep(wait);
  }
}
