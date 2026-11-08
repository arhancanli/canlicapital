// Captures the SEC responses the filing_check tests replay (node scripts/capture-filing-check-fixtures.mjs):
// Apple's 10-Q for the quarter to 27 June 2026 (its FilingSummary.xml, document and calculation linkbase)
// and Microsoft's FY2026 10-K (its FilingSummary.xml and the calculation links of its schema; its document
// is already captured as a035). They go into test/fixtures/manifest.json as k###.gz. Company facts are
// cut to the two filings' rows and saved in test/fixtures/filing-check/, which the tests serve in place
// of the manifest's copy (Apple's there is cut to other tools' tags), beside SEC's own extraction of
// the Apple 10-Q's XBRL, which the reader's values are tested against. Files already captured are not
// fetched again. SEC_USER_AGENT replaces the package's user agent.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

import { DEFAULT_USER_AGENT } from "../src/sources.mjs";

const DIR = new URL("../test/fixtures/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", DIR), "utf8"));
const SEC = { "User-Agent": String(process.env.SEC_USER_AGENT ?? "").trim() || DEFAULT_USER_AGENT };
let n = Object.values(manifest).filter((f) => /^k\d/.test(f)).length;

async function fetchText(url) {
  await new Promise((r) => setTimeout(r, 200));
  const res = await fetch(url, { headers: SEC });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.text();
}

// One URL as received (trim keeps the part the tests read).
async function grab(url, trim) {
  if (manifest[url]) return;
  const text = await fetchText(url);
  const file = `k${String(++n).padStart(3, "0")}.gz`;
  writeFileSync(new URL(file, DIR), gzipSync(trim ? trim(text) : text, { level: 9 }));
  manifest[url] = file;
}

// A schema that holds every linkbase (Microsoft's, 2 MB): filing_check reads its calculation links only.
const calculationOnly = (xsd) => `<link:linkbase>\n${(xsd.match(/<(?:[\w-]+:)?calculationLink\b[\s\S]*?<\/(?:[\w-]+:)?calculationLink>/g) ?? []).join("\n")}\n</link:linkbase>\n`;

const A = "https://www.sec.gov/Archives/edgar/data";
await grab(`${A}/320193/000032019326000020/FilingSummary.xml`);
await grab(`${A}/320193/000032019326000020/aapl-20260627.htm`);
await grab(`${A}/320193/000032019326000020/aapl-20260627_cal.xml`);
await grab(`${A}/789019/000119312526323660/FilingSummary.xml`);
await grab(`${A}/789019/000119312526323660/msft-20260630.xsd`, calculationOnly);

// Company facts with only the rows of the filing checked. Every taxonomy is kept, empty or not: which
// taxonomies the file holds decides which facts are compared.
const OWN = new URL("filing-check/", DIR);
mkdirSync(OWN, { recursive: true });
for (const [cik, accession] of [[320193, "0000320193-26-000020"], [789019, "0001193125-26-323660"]]) {
  const name = `CIK${String(cik).padStart(10, "0")}.json`;
  if (existsSync(new URL(`${name}.gz`, OWN))) continue;
  const d = JSON.parse(await fetchText(`https://data.sec.gov/api/xbrl/companyfacts/${name}`));
  for (const concepts of Object.values(d.facts)) {
    for (const [concept, body] of Object.entries(concepts)) {
      for (const [unit, rows] of Object.entries(body.units)) {
        const kept = rows.filter((r) => r.accn === accession);
        if (kept.length) body.units[unit] = kept; else delete body.units[unit];
      }
      if (Object.keys(body.units).length) { delete body.label; delete body.description; } else delete concepts[concept];
    }
  }
  writeFileSync(new URL(`${name}.gz`, OWN), gzipSync(JSON.stringify(d), { level: 9 }));
}
if (!existsSync(new URL("aapl-20260627_htm.xml.gz", OWN))) writeFileSync(new URL("aapl-20260627_htm.xml.gz", OWN), gzipSync(await fetchText(`${A}/320193/000032019326000020/aapl-20260627_htm.xml`), { level: 9 }));
writeFileSync(new URL("manifest.json", DIR), JSON.stringify(manifest, null, 1) + "\n");
console.log(Object.keys(manifest).length, "responses in the manifest");
