// A plugin whose one tool resolves a company the way the markets pack does: words that match several
// filers come back as the first match with the others listed (matched_by "name", other_matches).
import { z } from "zod";

export const pack = "askdemo";
export const title = "Company resolution demo";
export const network = "none";
export const disk = "none";
const FILERS = { 27904: { name: "DELTA AIR LINES, INC.", ticker: "DAL", revenue: 61.6 }, 1101396: { name: "Delta Apparel, Inc", ticker: "DLA", revenue: 0.4 }, 27996: { name: "DELTA NATURAL GAS CO INC", ticker: null, revenue: 0.1 } };
export function registerTools(server) {
  server.registerTool("demo_company_revenue", {
    title: "Company revenue (demo plugin)",
    description: "A company's revenue by ticker, CIK or name: a demonstration of a name that matches several companies.",
    inputSchema: z.object({ company: z.string().min(1).max(100) }).strict(),
    annotations: { readOnlyHint: true },
  }, async ({ company }) => {
    const out = /^\d+$/.test(company) && FILERS[company]
      ? { company: { cik: Number(company), name: FILERS[company].name, ticker: FILERS[company].ticker }, revenue_billions: FILERS[company].revenue }
      : { company: { cik: 27904, name: FILERS[27904].name, ticker: "DAL", matched_by: "name", other_matches: [{ cik: 1101396, name: FILERS[1101396].name, ticker: "DLA" }, { cik: 27996, name: FILERS[27996].name }] }, revenue_billions: FILERS[27904].revenue };
    return { structuredContent: out, content: [{ type: "text", text: JSON.stringify(out) }] };
  });
}
