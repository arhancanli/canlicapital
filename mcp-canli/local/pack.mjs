// Companies saved for offline use. Each one is read once through the fundamentals pack, which keeps its Canli
// reference record and SEC snapshot in its disk cache (CANLI_CACHE_DIR, or ~/.cache/canli-fundamentals); the list
// is kept in CANLI_HOME/offline-pack.json, readable only by its owner. With CANLI_OFFLINE=packs those companies
// answer with no network at all, as of their saved snapshot.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const fileOf = (home) => join(home, "offline-pack.json");

export function packList(home) {
  try { return JSON.parse(readFileSync(fileOf(home), "utf8")); } catch { return { companies: [] }; }
}

export async function packAdd(home, call, companies, now = () => new Date().toISOString()) {
  const pack = packList(home);
  const saved = [], failed = [];
  for (const query of companies) {
    try {
      // find_company keeps the name index too, so the company can be asked for by name offline.
      await call("find_company", { query }).catch(() => null);
      const r = await call("list_concepts", { company: query });
      const reference = r.snapshot?.reference?.fetched_at ?? (r.snapshot?.read_live ? null : r.snapshot?.fetched_at) ?? null;
      const entry = { query, cik: r.company?.cik ?? null, name: r.company?.name ?? null, snapshot_captured: reference, saved_at: now() };
      pack.companies = [...(pack.companies ?? []).filter((c) => c.cik !== entry.cik), entry];
      saved.push(entry);
    } catch (e) {
      failed.push({ query, error: String(e?.message ?? e).slice(0, 200) });
    }
  }
  mkdirSync(home, { recursive: true, mode: 0o700 });
  writeFileSync(fileOf(home), `${JSON.stringify(pack, null, 1)}\n`, { mode: 0o600 });
  return {
    saved,
    ...(failed.length ? { failed } : {}),
    in_pack: pack.companies.length,
    how: "Run with CANLI_OFFLINE=packs and these companies answer with no network, as of the snapshot each was saved with (snapshot_captured); a filing since then is not in the offline copy. canli-mcp pack add again refreshes a company.",
  };
}
