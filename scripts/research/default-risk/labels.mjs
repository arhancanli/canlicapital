// The events default_risk v1 predicts: every 8-K that reports Item 1.03 (bankruptcy or receivership), 2009 to the given
// day, from EDGAR's full-text search, one CIK per row (a filing naming several filers gives each a row). Only filings
// whose item list carries 1.03 count; a filing that merely mentions the item does not.
// Run: node scripts/research/default-risk/labels.mjs 2026-11-07 > config/research/default-risk-v1/bankruptcy_8k.csv
const UA = "Canli Capital canli-markets-mcp (+https://canlicapital.com/developers)";
const until = process.argv[2] ?? new Date().toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rows = new Map();
for (let year = 2009; year <= Number(until.slice(0, 4)); year += 1) {
  const end = year === Number(until.slice(0, 4)) ? until : `${year}-12-31`;
  for (let from = 0; ; from += 100) {
    const url = `https://efts.sec.gov/LATEST/search-index?q=%22Item%201.03%22&forms=8-K&dateRange=custom&startdt=${year}-01-01&enddt=${end}&from=${from}`;
    let d;
    for (let tries = 0; ; tries += 1) {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (res.ok) { d = await res.json(); break; }
      if (tries >= 3) throw new Error(`${url}: HTTP ${res.status}`);
      await sleep(2000 * (tries + 1));
    }
    const hits = d.hits.hits;
    for (const h of hits) {
      const s = h._source;
      if (!(s.items ?? []).includes("1.03")) continue;
      (s.ciks ?? []).forEach((cik, i) => { const key = `${Number(cik)}|${s.adsh}`; if (!rows.has(key)) rows.set(key, [Number(cik), s.file_date, s.adsh, JSON.stringify(String(s.display_names?.[i] ?? "").replace(/\s+\(CIK.*$/, "").trim())]); });
    }
    await sleep(250);
    if (hits.length < 100 || from + 100 >= d.hits.total.value) break;
  }
  process.stderr.write(`${year}: ${rows.size}\n`);
}
console.log("cik,filed,accession,name");
for (const r of [...rows.values()].sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : a[0] - b[0]))) console.log(r.join(","));
