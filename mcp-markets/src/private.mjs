// Private markets from the source: Form D, the notice companies and funds file within 15 days of
// first selling securities in an offering exempt from registration (venture rounds, private
// equity, hedge and real estate funds). How much was offered and sold, to how many investors,
// under which exemption, and who is behind it.
import { z } from "zod";

import { archiveBase, filings, getJson, getText, NotFound, resolveEntity } from "./sources.mjs";
import { all, child, num, parseXml, textAt } from "./xml.mjs";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date as YYYY-MM-DD");
const isoDay = (session, back = 0) => new Date(session.now() - back * 86400000).toISOString().slice(0, 10);

// Form D Item 6 exemption codes.
export const EXEMPTIONS = Object.freeze({
  "06b": "Rule 506(b) (no general solicitation)", "06c": "Rule 506(c) (general solicitation, accredited investors only)", "04": "Rule 504",
  "04a1": "Rule 504(b)(1)(i)", "04a2": "Rule 504(b)(1)(ii)", "04a3": "Rule 504(b)(1)(iii)", "4a5": "Securities Act Section 4(a)(5)",
  "3C": "Investment Company Act Section 3(c)", "3C.1": "Investment Company Act Section 3(c)(1) (100 or fewer holders)", "3C.7": "Investment Company Act Section 3(c)(7) (qualified purchasers)",
});
const money = (s) => (s == null || s === "" || /indefinite/i.test(s) ? null : num(s));

export function parseFormD(xml) {
  const doc = child(parseXml(xml), "edgarSubmission");
  if (!doc) throw new Error("not a Form D filing");
  const issuer = child(doc, "primaryIssuer");
  const o = child(doc, "offeringData");
  const ind = child(o, "industryGroup");
  const size = child(o, "issuerSize");
  const amounts = child(o, "offeringSalesAmounts");
  const investors = child(o, "investors");
  const first = child(o, "typeOfFiling");
  const persons = all(child(doc, "relatedPersonsList") ?? doc, "relatedPersonInfo").map((p) => {
    const n = child(p, "relatedPersonName");
    const name = [textAt(n, "firstName"), textAt(n, "middleName"), textAt(n, "lastName")].filter((x) => x && x !== "N/A").join(" ");
    return { name: name || null, roles: all(p, "relationship").map((r) => r.text.trim()).filter(Boolean) };
  });
  const securities = child(o, "typesOfSecuritiesOffered");
  const types = securities ? securities.children.filter((c) => /^is/.test(c.name) && /true/i.test(c.text)).map((c) => c.name.replace(/^is|Type$/g, "").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()) : [];
  return {
    form: textAt(doc, "submissionType"),
    issuer: { cik: num(textAt(issuer, "cik")), name: textAt(issuer, "entityName"), type: textAt(issuer, "entityType"), incorporated_in: textAt(issuer, "jurisdictionOfInc"),
      year_incorporated: num(textAt(child(issuer, "yearOfInc"), "value")), state: textAt(child(issuer, "issuerAddress"), "stateOrCountry") },
    industry: textAt(ind, "industryGroupType"), fund_type: textAt(child(ind, "investmentFundInfo"), "investmentFundType"),
    revenue_range: textAt(size, "revenueRange"), net_asset_value_range: textAt(size, "aggregateNetAssetValueRange"),
    amendment: /true/i.test(textAt(first, "isAmendment") ?? ""), first_sale: textAt(child(first, "dateOfFirstSale"), "value"),
    first_sale_yet_to_occur: /true/i.test(textAt(child(first, "dateOfFirstSale"), "yetToOccur") ?? ""),
    exemptions: all(child(o, "federalExemptionsExclusions") ?? o, "item").map((i) => i.text.trim()),
    securities: types,
    offered: money(textAt(amounts, "totalOfferingAmount")), offered_indefinite: /indefinite/i.test(textAt(amounts, "totalOfferingAmount") ?? ""),
    sold: money(textAt(amounts, "totalAmountSold")), remaining: money(textAt(amounts, "totalRemaining")),
    minimum_investment: money(textAt(o, "minimumInvestmentAccepted")),
    investors: num(textAt(investors, "totalNumberAlreadyInvested")), non_accredited: /true/i.test(textAt(investors, "hasNonAccreditedInvestors") ?? ""),
    commissions: money(textAt(child(o, "salesCommissionsFindersFees"), "salesCommissions", "dollarAmount")),
    persons,
  };
}

async function readFormD(session, cik, accession) {
  const url = `${archiveBase(cik, accession)}/primary_doc.xml`;
  return { url, ...parseFormD(await getText(session, url, { maxBytes: 2 * 1024 * 1024 })) };
}

const ROW_COLUMNS = ["filed", "issuer", "industry", "fund_type", "state", "sold", "offered", "investors", "first_sale", "exemptions", "amendment", "accession"];
const row = (filed, d, accession) => [filed, d.issuer.name, d.industry, d.fund_type, d.issuer.state, d.sold, d.offered_indefinite ? "indefinite" : d.offered, d.investors, d.first_sale_yet_to_occur ? "yet to occur" : d.first_sale, d.exemptions, d.amendment, accession];

export const offeringsInput = z.object({
  company: z.string().min(1).max(120).optional().describe("An issuer by name or CIK (a startup, a fund). Without it, the latest Form D filings across the market."),
  industry: z.string().max(60).optional().describe("Across the market, keep issuers whose Form D industry group contains these words: \"Pooled Investment Fund\", \"Biotechnology\", \"Other Technology\", \"Real Estate\", \"Banking\"."),
  min_sold: z.number().min(0).optional().describe("Across the market, keep offerings that have sold at least this many dollars."),
  since: DATE.optional().describe("Filed on or after this date; default seven days ago across the market, ten years for an issuer."),
  limit: z.number().int().min(1).max(50).optional().describe("Most offerings to list; default 20. Across the market at most 100 filings are read to find them."),
}).strict();

export async function privateOfferings(session, args) {
  const a = offeringsInput.parse(args);
  const limit = a.limit ?? 20;
  const limits = [
    "From Form D notices as filed with the SEC, due 15 days after the first sale; the SEC does not review them, amounts are as of each filing, and an amendment (D/A) restates the offering.",
    "Form D covers offerings exempt from registration (Regulation D, Section 4(a)(5)); many funds report an indefinite offering amount. Not every private raise files one. state is the EDGAR state or country code of the issuer's address.",
    "Not investment advice.",
  ];
  const decode = (codes) => codes.map((c) => EXEMPTIONS[c] ?? c);
  if (a.company) {
    const e = await resolveEntity(session, a.company);
    const since = a.since ?? isoDay(session, 3653);
    const { sub, rows } = await filings(session, e.cik, { since });
    const picked = rows.filter((r) => /^D(\/A)?$/.test(r.form) && r.filingDate >= since).slice(0, limit);
    if (!picked.length) throw new NotFound(`${sub.name} has filed no Form D since ${since}.`);
    const out = [];
    let latest = null;
    for (const r of picked) {
      const d = await readFormD(session, e.cik, r.accessionNumber);
      latest = latest ?? d;
      out.push(row(r.filingDate, { ...d, exemptions: decode(d.exemptions) }, r.accessionNumber));
    }
    return {
      issuer: { ...latest.issuer, cik: e.cik, name: sub.name, ...(e.matched_by === "name" ? { matched_by: "name", ...(e.other_matches ? { other_matches: e.other_matches } : {}) } : {}) }, since,
      columns: ROW_COLUMNS, rows: out,
      people: latest.persons.slice(0, 20),
      source: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${e.cik}&type=D&dateb=&owner=include&count=40`,
      limits,
    };
  }
  const since = a.since ?? isoDay(session, 7), until = isoDay(session);
  const want = a.industry?.toLowerCase();
  const out = [];
  let scanned = 0, total = null;
  for (let from = 0; from < 100 && out.length < limit; from += 100) {
    const page = await getJson(session, `https://efts.sec.gov/LATEST/search-index?forms=D&dateRange=custom&startdt=${since}&enddt=${until}${from ? `&from=${from}` : ""}`);
    total = total ?? page?.hits?.total?.value ?? null;
    const hits = page?.hits?.hits ?? [];
    for (const h of hits) {
      if (out.length >= limit || scanned >= 100) break;
      const s = h._source ?? {}, accession = s.adsh ?? String(h._id).split(":")[0];
      scanned++;
      let d;
      try { d = await readFormD(session, Number(s.ciks?.[0] ?? 0), accession); } catch (err) { if (err instanceof NotFound) continue; throw err; }
      if (want && !`${d.industry ?? ""} ${d.fund_type ?? ""}`.toLowerCase().includes(want)) continue;
      if (a.min_sold != null && !(d.sold >= a.min_sold)) continue;
      out.push(row(s.file_date ?? null, { ...d, exemptions: decode(d.exemptions) }, accession));
    }
    if (hits.length < 100) break;
  }
  if (!out.length) throw new NotFound(`None of the ${scanned} newest Form D filings between ${since} and ${until} matched${want ? ` industry "${a.industry}"` : ""}${a.min_sold != null ? ` with at least $${a.min_sold} sold` : ""}.`);
  return {
    since, until, filings_in_window: total, read: scanned, shown: out.length,
    columns: ROW_COLUMNS, rows: out,
    source: `https://efts.sec.gov/LATEST/search-index?forms=D&dateRange=custom&startdt=${since}&enddt=${until}`,
    limits,
  };
}
