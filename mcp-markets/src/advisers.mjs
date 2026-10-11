// Investment advisers from the SEC's Investment Adviser Public Disclosure database (Form ADV): who
// is registered, since when, where, under what other names, whether it reports disclosure events,
// and links to its Form ADV and brochures. No key.
import { z } from "zod";

import { getJson, NotFound } from "./sources.mjs";

const IAPD = "https://api.adviserinfo.sec.gov/search/firm";
const parseJson = (s) => { try { return JSON.parse(s ?? "null"); } catch { return null; } };

export const adviserInput = z.object({
  query: z.string().min(2).max(120).describe("A firm's name (\"Bridgewater Associates\", \"Renaissance Technologies\") or its CRD number (105129)."),
  limit: z.number().int().min(1).max(25).optional().describe("Most matching firms to list for a name; default 10."),
}).strict();

async function firmDetail(session, crd) {
  const d = await getJson(session, `${IAPD}/${crd}?hl=false&wt=json`);
  const c = parseJson(d?.hits?.hits?.[0]?._source?.iacontent);
  if (!c?.basicInformation) throw new NotFound(`The SEC's adviser database has no firm with CRD ${crd}.`);
  const b = c.basicInformation, addr = c.iaFirmAddressDetails?.officeAddress ?? {};
  const flags = c.orgScopeStatusFlags ?? {};
  return {
    crd: b.firmId, name: b.firmName, sec_file_number: b.iaSECNumber ? `${b.iaSECNumberType ?? "801"}-${b.iaSECNumber}` : null, status: b.iaScope,
    registered_with: Object.entries({ SEC: flags.isSECRegistered, states: flags.isStateRegistered, "exempt reporting (SEC)": flags.isSECERARegistered, "exempt reporting (state)": flags.isStateERARegistered }).filter(([, v]) => v === "Y").map(([k]) => k),
    sec_registration: (c.registrationStatus ?? []).map((r) => ({ jurisdiction: r.secJurisdiction, status: r.status, effective: r.effectiveDate })),
    latest_adv_filed: b.advFilingDate ?? null,
    office: [addr.street1, addr.street2, addr.city, addr.state, addr.postalCode, addr.country].filter(Boolean).join(", ") || null,
    other_names: (b.otherNames ?? []).filter((n) => n !== b.firmName),
    relying_advisers: (c.relyingAdvisors ?? []).map((r) => ({ crd: r.firmId, name: r.name, status: r.status })),
    state_notice_filings: (c.noticeFilings ?? []).length,
    brochures: (c.brochures?.brochuredetails ?? []).map((x) => ({ name: x.brochureName, submitted: x.dateSubmitted, url: `https://files.adviserinfo.sec.gov/IAPD/Content/Common/crd_iapd_Brochure.aspx?BRCHR_VRSN_ID=${x.brochureVersionID}` })),
    form_adv_pdf: b.hasPdf === "Y" ? `https://reports.adviserinfo.sec.gov/reports/ADV/${b.firmId}/PDF/${b.firmId}.pdf` : null,
    page: `https://adviserinfo.sec.gov/firm/summary/${b.firmId}`,
  };
}

export async function investmentAdvisers(session, args) {
  const a = adviserInput.parse(args);
  const limits = [
    "From the SEC's Investment Adviser Public Disclosure database (Form ADV) as published. Assets under management, client counts and disclosure details are in the Form ADV itself (form_adv_pdf, Items 5 and 11).",
    "Not investment advice.",
  ];
  if (/^\d{1,9}$/.test(a.query.trim())) return { firm: await firmDetail(session, Number(a.query.trim())), source: "https://adviserinfo.sec.gov/", limits };
  const d = await getJson(session, `${IAPD}?query=${encodeURIComponent(a.query.trim())}&hl=false&nrows=${a.limit ?? 10}&start=0&wt=json`);
  const hits = d?.hits?.hits ?? [];
  if (!hits.length) throw new NotFound(`No investment adviser in the SEC's database matches "${a.query}".`);
  const rows = hits.map((h) => {
    const s = h._source ?? {};
    const addr = parseJson(s.firm_ia_address_details)?.officeAddress ?? {};
    return [Number(s.firm_source_id), s.firm_name, s.firm_ia_full_sec_number ?? null, s.firm_ia_scope ?? null, s.firm_ia_disclosure_fl === "Y", [addr.city, addr.state, addr.country].filter(Boolean).join(", ") || null, s.firm_branches_count ?? null];
  });
  return {
    matches: d?.hits?.total ?? rows.length,
    columns: ["crd", "name", "sec_file_number", "status", "has_disclosures", "office", "branches"],
    rows,
    // The best match in full; pass its CRD as query to read another one.
    firm: await firmDetail(session, rows[0][0]),
    source: "https://adviserinfo.sec.gov/",
    limits,
  };
}
