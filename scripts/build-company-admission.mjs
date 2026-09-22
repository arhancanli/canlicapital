// Build the owner-approved indexing admission for one frozen company release.
//
// Admission answers one question per URL: may production serve this page as
// indexable and list it in the sitemap? It never adds, edits or removes pages;
// withheld pages stay reachable with X-Robots-Tag: noindex. The output is a
// tracked, reviewed file bundled with the deployment, so remote storage cannot
// enable indexing by itself.
//
// Owner decision 2026-09-21 ("clean set"): admit every company overview, every
// directory page and every history without a selected-quality flag, except
// companies that still have an accounting-scope review pending in any
// registered basic/diluted ledger. Flagged histories stay noindex until reviewed.
//
// Filing pages (a release that binds a filings catalog) inherit their company's
// admission. The admission file records only their counts and pins a gzip
// sidecar that lists the admitted accessions per company; the sidecar is read
// by the production sitemap step, never by the serving function.
//
// Usage:
//   node scripts/build-company-admission.mjs \
//     --release <company-release.json> --discovery <discovery dir> \
//     --quality <selected-quality report> --scope <ledger.json.gz> [--scope ...] \
//     --out config/company-admission-v22.json [--root <repository whose relative input paths to record>] \
//     [--filings-out config/company-filing-admission-v25.json.gz]   (required when the release binds filings)
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync, renameSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

const ORIGIN = 'https://canlicapital.com';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function args(argv) {
  const out = { scope: [] };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, ''), value = argv[i + 1];
    if (!value) throw new Error(`Missing value for ${argv[i]}`);
    if (key === 'scope') out.scope.push(value); else out[key] = value;
  }
  for (const key of ['release', 'discovery', 'quality', 'out']) if (!out[key]) throw new Error(`--${key} is required`);
  if (out['filings-out'] !== undefined && !/\.json\.gz$/.test(out['filings-out'])) throw new Error('--filings-out must name a .json.gz file');
  if (!out.scope.length) throw new Error('At least one --scope ledger is required');
  return out;
}

function input(role, path) {
  const bytes = readFileSync(path);
  return { role, path, bytes, sha256: sha256(bytes) };
}

export function buildCompanyAdmission({ release, discovery, shards, quality, scopes, decided = '2026-09-21', filingsPath }) {
  if (release.schema !== 'canli.company-release.v1') throw new Error('Unexpected release schema');
  const bindsFilings = release.filings_root !== undefined;
  if (bindsFilings && (!/^[a-f0-9]{64}$/.test(release.filings_root) || !Number.isSafeInteger(release.filings) || release.filings < 1 || !Number.isSafeInteger(release.filing_companies) || release.filing_companies < 1)) throw new Error('Invalid release filings binding');
  if (bindsFilings !== (typeof filingsPath === 'string')) throw new Error(bindsFilings ? 'The release binds filings; a filing admission path is required' : 'The release binds no filings');
  if (bindsFilings && !/^config\/[a-z0-9-]+\.json\.gz$/.test(filingsPath)) throw new Error('Filing admission path must be a tracked config/*.json.gz file');
  if (discovery.schema !== 'canli.company-discovery.v1' || discovery.release_hash !== release.release_hash || discovery.catalog_root !== release.catalog_root) throw new Error('Discovery does not bind the release');
  const ADMISSIBLE_POLICIES = ['extended-v22', 'extended-v23'];
  if (quality.schema !== 'canli.company-selected-quality.v1' || !ADMISSIBLE_POLICIES.includes(quality.selection_policy)) throw new Error('Quality report is not a selected-quality report for an admissible policy');
  if (quality.totals.companies !== release.companies || quality.totals.histories !== release.histories) throw new Error('Quality totals do not match the release');

  // Every company URL in the release, from the discovery shards Codex built and audited.
  const companies = new Map();
  const locPattern = /<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?\s*<\/url>/g;
  let directoryLocs = 0;
  for (const xml of shards) {
    for (const [, loc, lastmod] of xml.matchAll(locPattern)) {
      if (!loc.startsWith(`${ORIGIN}/`)) throw new Error(`Foreign sitemap URL: ${loc}`);
      const path = loc.slice(ORIGIN.length);
      if (/^\/companies(?:\/page\/[1-9]\d*)?$/.test(path)) { directoryLocs++; continue; }
      // Filing paths are matched first: "filings" would otherwise read as a concept tag.
      const filing = path.match(/^\/companies\/(\d{10})\/filings(?:\/(\d{10}-\d{2}-\d{6}))?$/);
      const match = filing ? null : path.match(/^\/companies\/(\d{10})(?:\/([A-Za-z][A-Za-z0-9]{0,99}))?$/);
      if (!filing && !match) throw new Error(`Unexpected discovery URL: ${loc}`);
      if (!lastmod || !/^\d{4}-\d{2}-\d{2}$/.test(lastmod)) throw new Error(`Missing or invalid lastmod: ${loc}`);
      const [, cik, tag] = filing ?? match;
      const entry = companies.get(cik) ?? { overview: false, tags: new Set(), filingIndex: false, filings: new Set(), lastmod };
      if (entry.lastmod !== lastmod) throw new Error(`Company ${cik} has more than one lastmod`);
      if (filing) {
        if (!bindsFilings) throw new Error(`Discovery lists a filing page but the release binds no filings: ${loc}`);
        if (tag) { if (entry.filings.has(tag)) throw new Error(`Duplicate filing ${path}`); entry.filings.add(tag); }
        else { if (entry.filingIndex) throw new Error(`Duplicate filing index ${path}`); entry.filingIndex = true; }
      } else if (tag) {
        if (entry.tags.has(tag)) throw new Error(`Duplicate history ${path}`);
        entry.tags.add(tag);
      } else {
        if (entry.overview) throw new Error(`Duplicate overview ${path}`);
        entry.overview = true;
      }
      companies.set(cik, entry);
    }
  }
  const histories = [...companies.values()].reduce((sum, entry) => sum + entry.tags.size, 0);
  if (companies.size !== release.companies || histories !== release.histories) throw new Error(`Discovery lists ${companies.size} companies/${histories} histories; release has ${release.companies}/${release.histories}`);
  for (const [cik, entry] of companies) {
    if (!entry.overview) throw new Error(`Company ${cik} has no overview URL`);
    if (entry.filingIndex !== entry.filings.size > 0) throw new Error(`Company ${cik} lists a filing index without filings or filings without an index`);
  }
  if (bindsFilings) {
    const filings = [...companies.values()].reduce((sum, entry) => sum + entry.filings.size, 0), indexes = [...companies.values()].filter(entry => entry.filingIndex).length;
    if (filings !== release.filings || indexes !== release.filing_companies) throw new Error(`Discovery lists ${indexes} filing indexes/${filings} filings; release has ${release.filing_companies}/${release.filings}`);
  }
  const directoryPages = discovery.directory_pages;
  if (!Number.isSafeInteger(directoryPages) || directoryPages < 1) throw new Error('Discovery has no directory page count');
  if (directoryLocs !== 0 && directoryLocs !== directoryPages) throw new Error('Directory URLs disagree with discovery count');

  const concepts = [...new Set([...companies.values()].flatMap(entry => [...entry.tags]))].sort();
  if (concepts.length > 128) throw new Error('Concept count exceeds the admission mask width');

  // Rule 1: a company with any pending accounting-scope observation stays entirely noindex.
  const excluded = new Map();
  for (const { label, ledger } of scopes) {
    if (!Array.isArray(ledger.rows)) throw new Error(`${label} has no rows`);
    for (const row of ledger.rows) {
      if (typeof row.state !== 'string' || !/^\d{10}$/.test(row.cik)) throw new Error(`${label} has an invalid row`);
      if (row.state !== 'ACCOUNTING_SCOPE_REVIEW_PENDING') continue;
      if (!companies.has(row.cik)) continue; // not in this release; nothing to withhold
      excluded.set(row.cik, `accounting-scope review pending in ${label}`);
    }
  }

  // Rule 2: a history with any selected-quality flag stays noindex.
  const flagged = new Map();
  for (const page of quality.flagged_pages) {
    const match = page.path?.match(/^\/companies\/(\d{10})\/([A-Za-z][A-Za-z0-9]{0,99})$/);
    if (!match || match[1] !== page.cik || match[2] !== page.tag || !Array.isArray(page.flags) || !page.flags.length) throw new Error(`Invalid flagged page ${page.path}`);
    if (!companies.get(page.cik)?.tags.has(page.tag)) throw new Error(`Flagged page is not in the release: ${page.path}`);
    const set = flagged.get(page.cik) ?? new Set();
    if (set.has(page.tag)) throw new Error(`Duplicate flagged page ${page.path}`);
    set.add(page.tag); flagged.set(page.cik, set);
  }
  const flaggedCount = [...flagged.values()].reduce((sum, set) => sum + set.size, 0);
  if (flaggedCount !== quality.totals.flagged_pages) throw new Error('Flagged page list does not match its total');

  const mask = tags => tags.reduce((value, tag) => value | (1n << BigInt(concepts.indexOf(tag))), 0n).toString(16);
  const out = {};
  const counts = { overviews_admitted: 0, histories_admitted: 0, histories_withheld_flagged: 0, histories_withheld_company: 0, overviews_withheld_company: 0, directory_pages: directoryPages };
  const filingCounts = { filing_indexes_admitted: 0, filings_admitted: 0, filing_indexes_withheld_company: 0, filings_withheld_company: 0 };
  const filingCompanies = {};
  for (const cik of [...companies.keys()].sort()) {
    const entry = companies.get(cik), tags = [...entry.tags];
    const admitted = excluded.has(cik) ? [] : tags.filter(tag => !flagged.get(cik)?.has(tag));
    if (excluded.has(cik)) { counts.overviews_withheld_company++; counts.histories_withheld_company += tags.length; }
    else { counts.overviews_admitted++; counts.histories_admitted += admitted.length; counts.histories_withheld_flagged += tags.length - admitted.length; }
    out[cik] = { lastmod: entry.lastmod, available: mask(tags), admitted: mask(admitted), overview: !excluded.has(cik) };
    if (entry.filingIndex) {
      // Rule 3: filing pages follow their company. A withheld company keeps every filing page noindex.
      filingCompanies[cik] = [...entry.filings].sort();
      if (excluded.has(cik)) { filingCounts.filing_indexes_withheld_company++; filingCounts.filings_withheld_company += entry.filings.size; }
      else { filingCounts.filing_indexes_admitted++; filingCounts.filings_admitted += entry.filings.size; }
    }
  }
  if (bindsFilings) Object.assign(counts, filingCounts);
  counts.urls_admitted = counts.overviews_admitted + counts.histories_admitted + counts.directory_pages + (bindsFilings ? filingCounts.filing_indexes_admitted + filingCounts.filings_admitted : 0);
  if (counts.histories_admitted + counts.histories_withheld_flagged + counts.histories_withheld_company !== release.histories) throw new Error('History partition does not close');
  if (bindsFilings && filingCounts.filings_admitted + filingCounts.filings_withheld_company !== release.filings) throw new Error('Filing partition does not close');

  const filingAdmission = bindsFilings ? buildFilingAdmission({ release, filingCompanies, filingCounts }) : null;
  const admission = {
    schema: 'canli.company-admission.v1',
    release_hash: release.release_hash,
    selection_policy: quality.selection_policy,
    catalog_root: release.catalog_root,
    download_root: release.download_root,
    companies_in_release: release.companies,
    histories_in_release: release.histories,
    decision: {
      date: decided,
      by: 'owner',
      scope: 'clean set',
      rules: [
        'Every directory page is admitted.',
        'A company with any ACCOUNTING_SCOPE_REVIEW_PENDING observation in a supplied ledger is withheld entirely (overview and histories).',
        'A history listed in the v22 selected-quality flagged_pages is withheld.',
        'Every other overview and history in the release is admitted.',
        'Withheld pages remain reachable and are served noindex; admission never edits page content.',
        ...(bindsFilings ? ['A filing index and every filing page of an admitted company are admitted; those of a withheld company are withheld.'] : []),
      ],
    },
    concepts,
    directory_lastmod: [...companies.values()].map(entry => entry.lastmod).sort().at(-1),
    excluded_companies: Object.fromEntries([...excluded].sort()),
    counts,
    ...(bindsFilings ? { filings: { path: filingsPath, sha256: sha256(filingAdmission.bytes), bytes: filingAdmission.bytes.length, filings_root: release.filings_root, ...filingCounts } } : {}),
    companies: out,
  };
  return { admission, filingAdmission };
}

// The sidecar: every company with filing pages and its accessions, in release
// order. It is pinned by SHA-256 from the admission and carries the release
// hash and filings root, so a sitemap can never list filings of another release.
function buildFilingAdmission({ release, filingCompanies, filingCounts }) {
  const document = {
    schema: 'canli.company-filing-admission.v1', release_hash: release.release_hash, filings_root: release.filings_root,
    filing_companies: Object.keys(filingCompanies).length, filings: Object.values(filingCompanies).reduce((sum, list) => sum + list.length, 0),
    counts: filingCounts, companies: filingCompanies,
  };
  if (document.filings !== release.filings || document.filing_companies !== release.filing_companies) throw new Error('Filing admission does not cover the release');
  return { document, bytes: gzipSync(Buffer.from(JSON.stringify(document) + '\n'), { level: 9 }) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const options = args(process.argv.slice(2));
  const root = resolve(options.root ?? process.cwd());
  const releaseInput = input('release', options.release);
  const discoveryInput = input('discovery', resolve(options.discovery, 'discovery.json'));
  const discovery = JSON.parse(discoveryInput.bytes);
  const shardDir = resolve(options.discovery, 'releases', discovery.release_hash);
  const shardInputs = discovery.files.filter(file => file.name !== 'sitemap.xml').map(file => {
    const shard = input('discovery-shard', resolve(shardDir, file.name));
    if (shard.sha256 !== file.sha256) throw new Error(`Discovery shard hash mismatch: ${file.name}`);
    return shard;
  });
  if (shardInputs.length !== discovery.shards || readdirSync(shardDir).filter(name => name !== 'sitemap.xml').length !== discovery.shards) throw new Error('Unexpected discovery shard set');
  const qualityInput = input('selected-quality', options.quality);
  const scopeInputs = options.scope.map(path => input('scope-ledger', path));
  const tracked = path => {
    const recorded = relative(root, resolve(path));
    if (recorded.startsWith('..')) throw new Error(`Path outside --root: ${path}`);
    return recorded;
  };
  const { admission, filingAdmission } = buildCompanyAdmission({
    release: JSON.parse(releaseInput.bytes),
    discovery,
    shards: shardInputs.map(shard => shard.bytes.toString('utf8')),
    quality: JSON.parse(qualityInput.bytes),
    scopes: scopeInputs.map(scope => ({ label: scope.path.split('/').at(-1), ledger: JSON.parse(scope.path.endsWith('.gz') ? gunzipSync(scope.bytes) : scope.bytes) })),
    filingsPath: options['filings-out'] === undefined ? undefined : tracked(options['filings-out']),
  });
  admission.inputs = [releaseInput, discoveryInput, ...shardInputs, qualityInput, ...scopeInputs]
    .map(({ role, path, sha256: digest }) => ({ role, path: tracked(path), sha256: digest }));
  if (filingAdmission) {
    writeFileSync(options['filings-out'] + '.pending', filingAdmission.bytes);
    renameSync(options['filings-out'] + '.pending', options['filings-out']);
  }
  const bytes = JSON.stringify(admission) + '\n';
  writeFileSync(options.out + '.pending', bytes);
  renameSync(options.out + '.pending', options.out);
  console.log(JSON.stringify({ out: options.out, sha256: sha256(bytes), bytes: Buffer.byteLength(bytes), ...admission.counts, excluded_companies: Object.keys(admission.excluded_companies).length, ...(filingAdmission ? { filings_out: options['filings-out'], filings_sha256: admission.filings.sha256 } : {}) }));
}
