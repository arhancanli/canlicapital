// trade_flows: what countries buy from and sell to each other, by product, from UN Comtrade: the value in US
// dollars and the weight as each customs office reported them, year by year. Who supplies a country's chips,
// who buys its soybeans, and how a dependency shifted. Taiwan reports to no UN body; other countries' customs
// list it as "Other Asia, nes", which this tool names as Taiwan.
import { z } from "zod";

import { getJson, NotFound } from "./sources.mjs";

const BASE = "https://comtradeapi.un.org";
const TAIWAN = 490;
// Trade a reporter files with no partner: withheld for confidentiality (Germany's pipeline gas sits here),
// or not stated. A partner's small share can mean its trade is hidden here, not absent.
const HIDDEN = Object.freeze({ 839: "Special Categories (partner withheld by the reporter)", 899: "Areas, nes (partner not stated)" });

// Plain words for the products people ask about, as Harmonized System codes stable across HS editions.
export const PRODUCTS = Object.freeze({
  semiconductors: "8542", chips: "8542", "integrated circuits": "8542", "chip-making equipment": "8486", "semiconductor equipment": "8486",
  "crude oil": "2709", oil: "2709", "refined petroleum": "2710", "natural gas": "2711", lng: "271111", coal: "2701",
  cars: "8703", "car parts": "8708", phones: "8517", smartphones: "8517", computers: "8471", "lithium-ion batteries": "850760", batteries: "8507",
  "solar panels": "8541", "rare earths": "2846", "lithium carbonate": "283691", copper: "7403", "copper ore": "2603", "iron ore": "2601",
  steel: "72", aluminium: "76", aluminum: "76", gold: "7108", soybeans: "1201", wheat: "1001", corn: "1005", maize: "1005", coffee: "0901",
  pharmaceuticals: "30", medicines: "3004", aircraft: "8802", "aircraft parts": "8803", ships: "8901", weapons: "93", "all goods": "TOTAL", total: "TOTAL",
});
const ALIASES = Object.freeze({
  "united states": 842, "united states of america": 842, usa: 842, us: 842, america: 842, uk: 826, britain: 826, "great britain": 826,
  "south korea": 410, korea: 410, russia: 643, vietnam: 704, iran: 364, turkey: 792, "türkiye": 792, turkiye: 792, czechia: 203,
  "czech republic": 203, "hong kong": 344, taiwan: TAIWAN, netherlands: 528, holland: 528, uae: 784, "united arab emirates": 784,
  "ivory coast": 384, bolivia: 68, venezuela: 862, tanzania: 834, syria: 760, laos: 418, moldova: 498, "north korea": 408, world: 0,
});

export const flowsInput = z.object({
  reporter: z.string().min(2).max(60).describe("The country whose customs reported the trade: a name (Germany, South Korea) or an ISO code (DEU, KR)."),
  product: z.string().min(1).max(60).optional().describe("An HS code (2, 4 or 6 digits: 85, 8542, 271111) or plain words (semiconductors, chip-making equipment, crude oil, LNG, cars, phones, lithium-ion batteries, solar panels, rare earths, lithium carbonate, copper, iron ore, steel, soybeans, wheat, coffee, pharmaceuticals, aircraft). Default all goods."),
  flow: z.enum(["imports", "exports"]).optional().describe("Default imports."),
  partner: z.string().min(2).max(60).optional().describe("One partner country, to follow the trade between the two year by year with its share of the reporter's total. Leave out to rank every partner in one year."),
  years: z.array(z.number().int().min(1988).max(2100)).min(1).max(8).optional().describe("Years to read. Default the latest five with data for one partner, or the latest with data for every partner."),
  limit: z.number().int().min(1).max(100).optional().describe("Partners to list when ranking. Default 15."),
}).strict();

const norm = (s) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/^the\s+/, "").replace(/[.,']/g, "").trim();

// A country's Comtrade code from a name, an alias or an ISO code, against the reporter or partner list.
export function findCountry(list, raw, role) {
  const s = norm(raw);
  if (s in ALIASES) {
    const code = ALIASES[s];
    if (code === TAIWAN && role === "reporter") throw new NotFound("Taiwan does not report to UN Comtrade. Its trade shows in other countries' reports, where it is listed as \"Other Asia, nes\": ask for a reporter with Taiwan as the partner.");
    const hit = list.find((c) => c.code === code);
    if (hit) return hit;
  }
  const up = raw.trim().toUpperCase();
  const exact = list.filter((c) => c.iso2 === up || c.iso3 === up || norm(c.name) === s);
  if (exact.length) return exact[0];
  const near = list.filter((c) => norm(c.name).startsWith(s) || norm(c.name).includes(` ${s}`));
  if (near.length === 1) return near[0];
  if (near.length > 1) throw new NotFound(`"${raw}" matches ${near.slice(0, 6).map((c) => c.name).join(", ")}: name one.`);
  throw new NotFound(`UN Comtrade has no ${role} called "${raw}".`);
}

// The countries a list names today: entries without a name, and those that ended (the USSR, West Germany),
// are left out.
async function countries(session, file, keys) {
  const r = await getJson(session, `${BASE}/files/v1/app/reference/${file}`);
  const now = new Date(session.now()).toISOString();
  return (r.results ?? r)
    .filter((c) => c[keys.name] && !(c.entryExpiredDate && c.entryExpiredDate < now))
    .map((c) => ({ code: c[keys.code], name: c[keys.name], iso2: c[keys.iso2] ?? null, iso3: c[keys.iso3] ?? null, group: Boolean(c.isGroup) }));
}

// One year's records. The preview needs no key, takes one year a call and about one call a second.
async function records(session, q) {
  const url = `${BASE}/public/v1/preview/C/A/HS?${new URLSearchParams({ ...q, partner2Code: "0", customsCode: "C00", motCode: "0", includeDesc: "true" })}`;
  for (let attempt = 0; ; attempt += 1) {
    try {
      const r = await getJson(session, url);
      if (r?.error) throw new Error(`UN Comtrade: ${r.error}`);
      return r?.data ?? [];
    } catch (e) {
      if (attempt < 4 && /429|rate limit/i.test(String(e?.message))) { await session.sleep(1200); continue; }
      throw e;
    }
  }
}

const partnerName = (r) => (r.partnerCode === TAIWAN ? "Taiwan (Other Asia, nes)" : HIDDEN[r.partnerCode] ?? r.partnerDesc);
const hiddenValue = (recs) => recs.filter((r) => HIDDEN[r.partnerCode]).reduce((s, r) => s + r.primaryValue, 0);
const r4 = (x) => (Number.isFinite(x) ? Math.round(x * 1e4) / 1e4 : null);
const perKg = (r) => (r.netWgt > 0 ? Math.round((r.primaryValue / r.netWgt) * 100) / 100 : null);

export async function tradeFlows(session, args) {
  const a = flowsInput.parse(args);
  const [reporters, partners] = await Promise.all([
    countries(session, "Reporters.json", { code: "reporterCode", name: "reporterDesc", iso2: "reporterCodeIsoAlpha2", iso3: "reporterCodeIsoAlpha3" }),
    countries(session, "partnerAreas.json", { code: "PartnerCode", name: "PartnerDesc", iso2: "PartnerCodeIsoAlpha2", iso3: "PartnerCodeIsoAlpha3" }),
  ]);
  const reporter = findCountry(reporters, a.reporter, "reporter");
  const partner = a.partner ? findCountry(partners, a.partner, "partner") : null;
  const words = a.product ? norm(a.product) : "total";
  const cmd = /^(\d{2}|\d{4}|\d{6})$/.test(words) ? words : PRODUCTS[words];
  if (!cmd) throw new NotFound(`No product called "${a.product}". Give an HS code (8542 is integrated circuits) or one of: ${Object.keys(PRODUCTS).slice(0, 20).join(", ")}.`);
  const flowCode = a.flow === "exports" ? "X" : "M";
  const base = { reporterCode: String(reporter.code), cmdCode: cmd, flowCode };
  const thisYear = new Date(session.now()).getUTCFullYear();

  // The years to read: those given, or the latest with data (customs figures arrive a year or two late).
  const read = async (year) => records(session, { ...base, period: String(year), ...(partner ? { partnerCode: [...new Set([0, partner.code, ...Object.keys(HIDDEN).map(Number)])].join(",") } : {}) });
  const found = new Map();
  let years = a.years ? [...new Set(a.years)].sort() : null;
  if (!years) {
    let latest = null;
    for (let y = thisYear - 1; y >= thisYear - 4 && latest == null; y -= 1) {
      const rows = await read(y);
      if (rows.length) { latest = y; found.set(y, rows); }
    }
    if (latest == null) throw new NotFound(`UN Comtrade has no ${a.flow ?? "imports"} of ${cmd} reported by ${reporter.name} for ${thisYear - 4} to ${thisYear - 1}.`);
    years = partner ? [latest - 4, latest - 3, latest - 2, latest - 1, latest] : [latest];
  }
  for (const y of years) if (!found.has(y)) found.set(y, await read(y));

  const product = (() => { for (const rows of found.values()) for (const r of rows) if (r.cmdDesc) return { code: cmd, description: r.cmdDesc }; return { code: cmd, description: null }; })();
  const common = {
    reporter: reporter.name, flow: a.flow ?? "imports", product,
    source: `${BASE}/public/v1/preview (UN Comtrade, no key)`,
    limits: [
      "As each customs office reported it, in current US dollars: imports usually at their cost, insurance and freight, exports free on board, so a pair's two reports differ.",
      "Taiwan reports to no UN body; other countries list it as \"Other Asia, nes\", named here as Taiwan.",
      "Some reporters withhold partners for confidentiality (Germany files nearly all its pipeline gas with no partner), so a partner's small share can mean hidden, not absent; unattributed_share says how much of the total names no partner.",
      "Goods only, not services; figures arrive a year or two after the year and can be revised.",
    ],
  };

  if (partner) {
    const rows = years.map((y) => {
      const recs = found.get(y) ?? [];
      const world = recs.find((r) => r.partnerCode === 0), mine = partner.code === 0 ? world : recs.find((r) => r.partnerCode === partner.code);
      return { y, world, mine, hidden: world ? hiddenValue(recs) / world.primaryValue : null };
    });
    const series = rows.map(({ y, world, mine, hidden }, i) => {
      const prev = rows[i - 1]?.mine?.primaryValue;
      return [y, mine?.primaryValue ?? null, prev && mine ? r4(mine.primaryValue / prev - 1) : null, world && mine ? r4(mine.primaryValue / world.primaryValue) : null, r4(hidden), mine?.netWgt ?? null, mine ? perKg(mine) : null];
    });
    if (series.every((s) => s[1] == null)) throw new NotFound(`${reporter.name} reports no ${common.flow} of ${cmd} ${common.flow === "imports" ? "from" : "to"} ${partner.name} in ${years.join(", ")}.`);
    const mostHidden = Math.max(...rows.map((r) => r.hidden ?? 0));
    return {
      ...common, partner: partner.code === TAIWAN ? "Taiwan (Other Asia, nes)" : partner.name,
      series: { columns: ["year", "value_usd", "change", "share_of_total", "unattributed_share", "net_weight_kg", "usd_per_kg"], rows: series },
      ...(mostHidden > 0.1 ? { caution: `Up to ${Math.round(mostHidden * 100)}% of ${reporter.name}'s total names no partner in these years, so ${partner.name}'s share may be understated.` } : {}),
      source: common.source, limits: common.limits,
    };
  }

  const year = years.at(-1), recs = found.get(year) ?? [];
  const world = recs.find((r) => r.partnerCode === 0);
  const ranked = recs.filter((r) => r.partnerCode !== 0).sort((x, y) => y.primaryValue - x.primaryValue);
  if (!ranked.length) throw new NotFound(`${reporter.name} reports no ${common.flow} of ${cmd} in ${year}.`);
  const total = world?.primaryValue ?? ranked.reduce((s, r) => s + r.primaryValue, 0);
  const top = ranked.slice(0, a.limit ?? 15);
  const hidden = hiddenValue(ranked) / total;
  return {
    ...common, year, total_usd: total, partners_reported: ranked.length,
    partners: { columns: ["partner", "value_usd", "share", "net_weight_kg", "usd_per_kg"], rows: top.map((r) => [partnerName(r), r.primaryValue, r4(r.primaryValue / total), r.netWgt ?? null, perKg(r)]) },
    top_share: r4(top.reduce((s, r) => s + r.primaryValue, 0) / total),
    unattributed_share: r4(hidden),
    ...(hidden > 0.1 ? { caution: `${Math.round(hidden * 100)}% of the total names no partner (withheld or not stated), so the partners' shares may be understated.` } : {}),
    source: common.source, limits: common.limits,
  };
}
