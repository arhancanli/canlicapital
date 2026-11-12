// Opened holdings added up into one portfolio's real exposure. Plain arithmetic with nothing to import,
// so the server and the look-through page in a browser run the same code and give the same answer.
const legal = /\b(inc|incorporated|corp|corporation|co|company|ltd|limited|plc|holdings?|group|class [a-c]|cl [a-c]|the|sa|nv|ag|se|lp|llc)\b/g;
export const issuerKey = (name) => String(name ?? "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]+/g, " ").replace(legal, " ").replace(/\s+/g, " ").trim();
const round = (x, d) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);

// holdings: [{ symbol, weight }]. opened(symbol) gives what that holding is:
//   { kind: "fund", fund, period, filed, positions: [[name, percent], ...], values_add_to?, looked_through?, note? }
// values_add_to: the positions' dollar values over the fund's net assets, a check on the report beside the weights.
//   { kind: "stock", name, note? }
export function mergeOpened(holdings, opened, { top = 25 } = {}) {
  const total = holdings.reduce((s, h) => s + h.weight, 0);
  const exposure = new Map(), funds = [], notes = [];
  const add = (key, name, w, via) => {
    const e = exposure.get(key) ?? { name, weight: 0, via: new Map() };
    e.weight += w; e.via.set(via, (e.via.get(via) ?? 0) + w); exposure.set(key, e);
  };
  for (const h of holdings) {
    const w = h.weight / total, sym = h.symbol.toUpperCase(), o = opened(sym);
    if (o.note) notes.push(o.note);
    if (o.kind !== "fund") { add(issuerKey(o.name ?? sym), o.name ?? sym, w, sym); continue; }
    let covered = 0;
    for (const [name, pct] of o.positions) {
      if (!Number.isFinite(pct)) continue;
      covered += pct / 100;
      add(issuerKey(name), name, (w * pct) / 100, sym);
    }
    funds.push({ symbol: sym, ...(o.looked_through ? { looked_through: o.looked_through } : {}), fund: o.fund, ...(o.series_id ? { series_id: o.series_id } : {}), ...(o.class_id ? { class_id: o.class_id } : {}), period: o.period, filed: o.filed, positions: o.positions.length, weight: round(w, 6), weights_add_to: round(covered, 4), ...(Number.isFinite(o.values_add_to) ? { values_add_to: o.values_add_to } : {}) });
  }
  const ranked = [...exposure.values()].sort((x, y) => y.weight - x.weight);
  const sum2 = ranked.reduce((s, e) => s + e.weight ** 2, 0);
  // Overlap between two funds: the weight they share, the sum over issuers of the smaller of the
  // two funds' own weights in it (1 for identical funds, 0 for none in common).
  const own = (sym) => funds.find((x) => x.symbol === sym)?.weight ?? null;
  const overlap = [];
  for (let i = 0; i < funds.length; i += 1) for (let j = i + 1; j < funds.length; j += 1) {
    const [p, q] = [funds[i].symbol, funds[j].symbol];
    let shared = 0;
    for (const e of exposure.values()) { const x = e.via.get(p), y = e.via.get(q); if (x && y) shared += Math.min(x / own(p), y / own(q)); }
    overlap.push([p, q, round(Math.min(1, shared), 4)]); // N-PORT weights can add to a little over 1 (derivatives, cash)
  }
  return {
    holdings: holdings.length, funds,
    positions_after_look_through: ranked.length,
    effective_positions: round(1 / sum2, 1),
    top_weight: round(ranked[0]?.weight ?? 0, 6),
    columns: ["issuer", "weight", "via"],
    rows: ranked.slice(0, top).map((e) => [e.name, round(e.weight, 6), Object.fromEntries([...e.via].map(([k, v]) => [k, round(v, 6)]))]),
    overlap: { columns: ["fund", "fund", "shared_weight"], rows: overlap },
    ...(notes.length ? { notes } : {}),
  };
}
