// Who a company legally is and what its securities are called: the Global LEI Foundation's register
// (legal name, jurisdiction, status, parents) and OpenFIGI (ticker, ISIN, CUSIP, SEDOL and FIGI of
// one security, no key at about 25 requests a minute). Check digits are tested before any request,
// so a mistyped identifier is refused rather than answered with something near it.
import { z } from "zod";

import { keyWords, nameWords } from "./records.mjs";
import { getJson, NotFound, postJson } from "./sources.mjs";

const LEI_API = "https://api.gleif.org/api/v1/lei-records";
const FIGI_API = "https://api.openfigi.com/v3/mapping";

const charValue = (c) => (/[0-9]/.test(c) ? Number(c) : c.charCodeAt(0) - 55);
// ISO 6166 (Luhn over letters as two digits).
export function isinValid(id) {
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(id)) return false;
  const digits = [...id].map(charValue).join("");
  let sum = 0;
  [...digits].reverse().forEach((d, i) => { let n = Number(d); if (i % 2) { n *= 2; if (n > 9) n -= 9; } sum += n; });
  return sum % 10 === 0;
}
export function cusipValid(id) {
  if (!/^[0-9A-Z]{8}\d$/.test(id)) return false;
  let sum = 0;
  [...id.slice(0, 8)].forEach((c, i) => { let n = charValue(c); if (i % 2) n *= 2; sum += Math.floor(n / 10) + (n % 10); });
  return (10 - (sum % 10)) % 10 === Number(id[8]);
}
// ISO 17442 (mod 97 over letters as two digits).
export function leiValid(id) {
  if (!/^[A-Z0-9]{18}\d{2}$/.test(id)) return false;
  let rem = 0;
  for (const c of id) for (const d of String(charValue(c))) rem = (rem * 10 + Number(d)) % 97;
  return rem === 1;
}

export function identifierKind(id) {
  if (/^BBG[A-Z0-9]{9}$/.test(id)) return "ID_BB_GLOBAL";
  if (/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(id)) { if (!isinValid(id)) throw new Error(`${id} has the form of an ISIN but its check digit is wrong.`); return "ID_ISIN"; }
  if (/^[0-9][0-9A-Z]{7}\d$/.test(id)) { if (!cusipValid(id)) throw new Error(`${id} has the form of a CUSIP but its check digit is wrong.`); return "ID_CUSIP"; }
  if (/^[B-DF-HJ-NP-TV-Z0-9]{6}\d$/.test(id) && /\d/.test(id.slice(0, 6))) return "ID_SEDOL";
  return "TICKER";
}

export const identifiersInput = z.object({
  id: z.string().min(1).max(20).describe("A ticker, ISIN, CUSIP, SEDOL or FIGI; the kind is read from its form."),
  exchange: z.string().regex(/^[A-Z0-9]{2}$/, "a two-letter exchange code").optional().describe("OpenFIGI's exchange code, for a ticker: US (default), LN, GR, JP, HK..."),
  limit: z.number().int().min(1).max(50).optional().describe("Most listings; default 20."),
}).strict();

export async function securityIdentifiers(session, args) {
  const a = identifiersInput.parse(args);
  const id = a.id.trim().toUpperCase();
  const kind = identifierKind(id);
  const job = { idType: kind, idValue: id, ...(kind === "TICKER" ? { exchCode: a.exchange ?? "US" } : a.exchange ? { exchCode: a.exchange } : {}) };
  const [answer] = await postJson(session, FIGI_API, [job]);
  if (answer?.warning || answer?.error || !answer?.data?.length) throw new NotFound(`OpenFIGI has no security for ${id}${job.exchCode ? ` on exchange ${job.exchCode}` : ""}${answer?.error ? ` (${answer.error})` : ""}.`);
  return {
    searched: { id, kind: kind.replace(/^ID_/, "").replace("BB_GLOBAL", "FIGI"), ...(job.exchCode ? { exchange: job.exchCode } : {}) },
    listings: answer.data.length,
    columns: ["figi", "name", "ticker", "exchange", "security_type", "market_sector", "composite_figi", "share_class_figi"],
    rows: answer.data.slice(0, a.limit ?? 20).map((x) => [x.figi, x.name, x.ticker, x.exchCode, x.securityType, x.marketSector, x.compositeFIGI ?? null, x.shareClassFIGI ?? null]),
    limits: ["OpenFIGI gives the FIGI family; it does not return an ISIN or CUSIP you did not give, which are licensed. Without a key it allows about 25 requests a minute."],
    source: FIGI_API,
  };
}

export const entityInput = z.object({
  name: z.string().min(2).max(160).optional().describe("A legal name, e.g. \"Apple Inc.\" or \"Deutsche Bank\". Every word must be in the name."),
  lei: z.string().optional().describe("Or the 20-character Legal Entity Identifier."),
  limit: z.number().int().min(1).max(10).optional().describe("Other entities of that name to list; default 5."),
}).strict().refine((x) => x.name || x.lei, "Give a name or an LEI.");

const place = (ad) => [ad?.city, ad?.region, ad?.country].filter(Boolean).join(", ") || null;
const brief = (d) => {
  const e = d.attributes.entity, r = d.attributes.registration;
  return { lei: d.id, legal_name: e.legalName?.name ?? null, jurisdiction: e.jurisdiction ?? null, category: e.category ?? null, entity_status: e.status ?? null, created: e.creationDate?.slice(0, 10) ?? null, legal_address: place(e.legalAddress), headquarters: place(e.headquartersAddress), registration_status: r.status ?? null, next_renewal: r.nextRenewalDate?.slice(0, 10) ?? null, last_update: r.lastUpdateDate?.slice(0, 10) ?? null, former_names: (e.otherNames ?? []).map((n) => n.name).slice(0, 5) };
};

async function related(session, lei, path) {
  try { return (await getJson(session, `${LEI_API}/${lei}/${path}`)).data ?? null; } catch (err) { if (err instanceof NotFound) return null; throw err; }
}

export async function legalEntity(session, args) {
  const a = entityInput.parse(args);
  let record, others = [];
  if (a.lei) {
    const lei = a.lei.trim().toUpperCase();
    if (!leiValid(lei)) throw new Error(`${lei} is not a valid LEI: the form or its check digits are wrong.`);
    record = (await getJson(session, `${LEI_API}/${lei}`)).data;
  } else {
    const want = keyWords(a.name);
    const r = await getJson(session, `${LEI_API}?${new URLSearchParams({ "filter[entity.legalName]": a.name, "page[size]": "50" })}`);
    const hits = (r.data ?? []).filter((d) => { const have = new Set(nameWords(d.attributes.entity.legalName?.name)); return want.every((w) => have.has(w)); });
    if (!hits.length) throw new NotFound(`The LEI register has no entity with every word of "${a.name}" in its legal name.`);
    const norm = nameWords(a.name).join(" ");
    const score = (d) => (nameWords(d.attributes.entity.legalName?.name).join(" ") === norm ? 2 : 0) + (d.attributes.entity.status === "ACTIVE" ? 1 : 0);
    hits.sort((x, y) => score(y) - score(x));
    [record, ...others] = hits;
  }
  const lei = record.id;
  const [direct, ultimate, children] = await Promise.all([related(session, lei, "direct-parent"), related(session, lei, "ultimate-parent"), getJson(session, `${LEI_API}/${lei}/ultimate-children?page[size]=1`).catch((err) => { if (err instanceof NotFound) return null; throw err; })]);
  return {
    ...brief(record),
    direct_parent: direct ? { lei: direct.id, legal_name: direct.attributes.entity.legalName?.name ?? null } : null,
    ultimate_parent: ultimate ? { lei: ultimate.id, legal_name: ultimate.attributes.entity.legalName?.name ?? null } : null,
    ultimate_children: children?.meta?.pagination?.total ?? 0,
    ...(others.length ? { others_named: { columns: ["lei", "legal_name", "jurisdiction", "status"], rows: others.slice(0, a.limit ?? 5).map((d) => [d.id, d.attributes.entity.legalName?.name, d.attributes.entity.jurisdiction, d.attributes.entity.status]) } } : {}),
    limits: ["Companies report their own parents to the register and may report an exception instead, so no parent listed does not mean no parent. An entity without an LEI is not in it."],
    source: `${LEI_API}/${lei}`,
  };
}
