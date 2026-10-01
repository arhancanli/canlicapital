import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { candidatesForArchive, generateCandidates } from './generate.mjs';
import { checkCandidate, checkCandidates } from './check.mjs';
import { readArchive } from './source.mjs';
import { candidateId } from './contract.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const early = { start: '2019-01-01', end: '2019-12-31', val: 100, filed: '2020-02-20', accn: '0000000001-20-000001', form: '10-K', fp: 'FY', fy: 2019 };
const late = { ...early, val: 150, filed: '2021-02-20', accn: '0000000001-21-000001', fy: 2020 };
const future = { ...late, val: 300, filed: '2022-02-20', accn: '0000000001-22-000001', fy: 2021 };

function fixture(t, rows = [late, early, future], customize = () => {}) {
  const dir = mkdtempSync(join(tmpdir(), 'canli-first-later-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const snapshots = join(dir, 'sources'); mkdirSync(snapshots);
  const facts = { cik: 1, entityName: 'Synthetic annual source', facts: { 'us-gaap': { NetIncomeLoss: { units: { USD: rows } } } } };
  customize(facts);
  const raw = Buffer.from(JSON.stringify(facts)); const digest = hash(raw);
  const snapshotPath = join(snapshots, digest + '.json.gz'); writeFileSync(snapshotPath, gzipSync(raw));
  const record = { schema: 'canli.company-reference.v1', cik: '0000000001', name: facts.entityName, source_sha256: digest, source_url: 'https://data.sec.gov/api/xbrl/companyfacts/CIK0000000001.json', fetched_at: '2022-03-01T00:00:00Z' };
  const recordPath = join(dir, '0000000001.json'); writeFileSync(recordPath, JSON.stringify(record));
  return { dir, snapshots, recordPath, snapshotPath, record, raw, archive: readArchive(recordPath, snapshots) };
}
function generate(f, asOf = '2021-12-31') { return candidatesForArchive(f.archive, { asOf, limit: 2 }); }
function check(f, item) { return checkCandidate(item, f.recordPath, f.snapshots); }
function changed(item, mutate) { const copy = structuredClone(item); mutate(copy); copy.id = candidateId(copy); return copy; }

test('selects the earliest and latest eligible filed observations through an explicit cutoff, not array or fiscal-year order', (t) => {
  const f = fixture(t); const { candidates, report } = generate(f);
  assert.equal(candidates.length, 1); const item = candidates[0];
  assert.equal(item.earliest.value, 100); assert.equal(item.later.value, 150);
  assert.deepEqual(item.answer, { earliest_value: 100, later_value: 150, difference: 50, percent_difference: 50, percent_difference_status: 'defined' });
  assert.equal(report.excluded_rows.filed_after_cutoff, 1);
  assert.equal(item.eligible_accessions, 2); assert.equal(item.human_verified, false);
  assert.equal(item.changed_value_cause, 'not_established');
  assert.ok(item.question.includes('not first-ever reporting'));
  assert.equal(check(f, JSON.parse(JSON.stringify(item))).valid, true);
  assert.equal(generate(f, '2021-02-20').candidates[0].later.value, 150);
  assert.equal(generate(f, '2020-02-20').candidates.length, 0);
});

test('quarter, YTD, instant and nonperiodic observations cannot contaminate an annual pair, and every exclusion is counted', (t) => {
  const f = fixture(t, [early, late,
    { ...late, form: '10-Q', fp: 'Q3', val: 999 },
    { ...late, start: '2019-10-01', val: 998 },
    { ...late, end: '2019-09-30', val: 997 },
    { ...late, start: undefined, val: 996 },
    { ...late, form: '8-K', val: 995 },
    { ...late, fp: 'Q2', val: 994 },
  ]);
  const result = generate(f); assert.equal(result.candidates[0].later.value, 150);
  assert.deepEqual(result.report.excluded_rows, { quarterly_filing_form: 1, quarter_or_short_duration: 1, ytd_or_partial_year_duration: 1, instant_or_missing_start: 1, nonannual_filing_form: 1, not_fy_filing_context: 1 });
  assert.equal(result.report.observations_us_gaap_all_units, 8);
  assert.equal(result.report.eligible_rows, 2);
});

test('concepts, currencies and exact start dates remain distinct even with a common period end', (t) => {
  const f = fixture(t, [early, late], (facts) => {
    facts.facts['us-gaap'].NetIncomeLoss.units.EUR = [{ ...early, val: 900 }, { ...late, val: 950 }];
    facts.facts['us-gaap'].GrossProfit = { units: { USD: [late] } };
    facts.facts['us-gaap'].OperatingIncomeLoss = { units: { USD: [early, { ...late, start: '2019-01-02' }] } };
  });
  const result = generate(f); assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].period.concept, 'NetIncomeLoss');
  assert.equal(result.report.excluded_rows.other_unit, 2);
  assert.equal(result.report.rejected_groups.no_later_distinct_filed_date, 3);
});

test('duplicate exact source rows do not inflate accessions; conflicting values for one accession refuse the whole group', (t) => {
  const duplicated = fixture(t, [early, { ...early, frame: 'CY2019' }, late]);
  const item = generate(duplicated).candidates[0]; assert.equal(item.eligible_accessions, 2);
  assert.equal(check(duplicated, item).valid, true);
  const conflict = fixture(t, [early, { ...early, val: 101 }, late]);
  const result = generate(conflict); assert.equal(result.candidates.length, 0);
  assert.equal(result.report.rejected_groups.accession_conflict, 1);
  const forged = changed(item, (x) => { x.source = conflict.archive.source; });
  assert.equal(check(conflict, forged).valid, false);
});

test('same-day differing accession values refuse arbitrary date-only ordering', (t) => {
  const good = fixture(t, [early, late]); const item = generate(good).candidates[0];
  const f = fixture(t, [early, { ...early, val: 90, accn: '0000000001-20-000002' }, late]);
  const result = generate(f); assert.equal(result.candidates.length, 0);
  assert.equal(result.report.rejected_groups.same_day_value_conflict, 1);
  const forged = changed(item, (x) => { x.source = f.archive.source; });
  assert.equal(check(f, forged).valid, false);
});

test('zero earliest value makes percentage explicitly undefined; negative earliest uses its absolute magnitude', (t) => {
  const zero = fixture(t, [{ ...early, val: -0 }, { ...late, val: 50 }]);
  const item = generate(zero).candidates[0];
  assert.equal(item.answer.earliest_value, 0); assert.equal(item.answer.percent_difference, null);
  assert.equal(item.answer.percent_difference_status, 'zero_earliest');
  assert.equal(check(zero, JSON.parse(JSON.stringify(item))).valid, true);
  const negative = fixture(t, [{ ...early, val: -100 }, { ...late, val: -50 }]);
  assert.equal(generate(negative).candidates[0].answer.percent_difference, 50);
});

test('reverted endpoint values are recorded separately, without claiming no historical change', (t) => {
  const f = fixture(t, [early, late, { ...future, val: 100 }]);
  const result = generate(f, '2022-02-20'); assert.equal(result.candidates.length, 0);
  assert.equal(result.report.rejected_groups.reverted_at_cutoff, 1);
});

test('invalid dates, source fiscal metadata and fractional or unsafe amounts cannot yield partially plausible pairs', (t) => {
  for (const patch of [{ filed: '2021-02-30' }, { filed: '2018-12-31' }, { accn: 'not-accession' }, { fy: '2020' }, { val: 1.25 }, { val: Number.MAX_SAFE_INTEGER + 1 }]) {
    const f = fixture(t, [early, { ...late, ...patch }]);
    const result = generate(f); assert.equal(result.candidates.length, 0);
    assert.equal(result.report.rejected_groups.invalid_filing_metadata, 1);
  }
  const unsafeDelta = fixture(t, [{ ...early, val: -Number.MAX_SAFE_INTEGER }, { ...late, val: Number.MAX_SAFE_INTEGER }]);
  assert.equal(generate(unsafeDelta).report.rejected_groups.unsafe_or_nonfinite_arithmetic, 1);
});

test('cutoff requires a real calendar date within capture bounds and bounded integral output limits', (t) => {
  const f = fixture(t);
  for (const asOf of [undefined, '2021-02-30', '2021-12-31T00:00:00Z', '2022-03-02']) assert.throws(() => candidatesForArchive(f.archive, { asOf, limit: 2 }), /as_of/);
  for (const limit of [0, 101, 1.5]) assert.throws(() => candidatesForArchive(f.archive, { asOf: '2021-12-31', limit }), /limit/);
});

test('snapshot corruption and record identity/time/URL changes are refused before source use', (t) => {
  const f = fixture(t); writeFileSync(f.snapshotPath, gzipSync(Buffer.from(JSON.stringify({ changed: true }))));
  assert.throws(() => readArchive(f.recordPath, f.snapshots), /SHA-256/);
  for (const patch of [{ name: 'Another company' }, { fetched_at: '2022-02-30T00:00:00Z' }, { fetched_at: '2022-03-01T24:00:00Z' }, { source_url: 'https://example.test/data.json' }, { cik: '0000000002' }]) {
    const fresh = fixture(t); writeFileSync(fresh.recordPath, JSON.stringify({ ...fresh.record, ...patch }));
    assert.throws(() => readArchive(fresh.recordPath, fresh.snapshots));
  }
  const link = fixture(t); const bytes = readFileSync(link.snapshotPath); rmSync(link.snapshotPath);
  const alternate = join(link.dir, 'other.gz'); writeFileSync(alternate, bytes); symlinkSync(alternate, link.snapshotPath);
  assert.throws(() => readArchive(link.recordPath, link.snapshots));
});

test('independent checker refuses source, endpoint, arithmetic, claims and question tampering even with recomputed IDs', (t) => {
  const f = fixture(t); const item = generate(f).candidates[0];
  const mutations = [
    (x) => { x.answer.difference = 51; }, (x) => { x.answer.percent_difference = 55; },
    (x) => { x.earliest.value = 101; }, (x) => { x.later.filed = '2021-02-21'; },
    (x) => { x.source.snapshot_sha256 = 'a'.repeat(64); }, (x) => { x.source.captured_at = '2022-03-01T01:00:00Z'; },
    (x) => { x.eligible_accessions = 3; }, (x) => { x.human_verified = true; },
    (x) => { x.changed_value_cause = 'accounting_restatement'; }, (x) => { x.limitations = []; },
    (x) => { x.question = x.question.replace('not first-ever', 'first-ever'); },
    (x) => { x.period.start = '2019-01-02'; }, (x) => { x.as_of = '2020-12-31'; },
  ];
  for (const mutate of mutations) assert.equal(check(f, changed(item, mutate)).valid, false);
});

test('batch checker reports duplicate IDs and malformed candidates instead of inflating success', (t) => {
  const f = fixture(t); const item = generate(f).candidates[0];
  const result = checkCandidates([item, item, null], f.dir, f.snapshots);
  assert.equal(result.passed, 1); assert.equal(result.failed, 2);
});

test('CLI generates a reproducible small packet, verifies it independently and preserves existing output bytes', (t) => {
  const f = fixture(t); const out = join(f.dir, 'candidates.jsonl');
  const run = (name, args) => spawnSync(process.execPath, [join(HERE, name), ...args], { encoding: 'utf8' });
  const built = run('generate.mjs', [f.dir, f.snapshots, out, '2021-12-31', '2']); assert.equal(built.status, 0, built.stderr);
  const verified = run('check.mjs', [out, f.dir, f.snapshots]); assert.equal(verified.status, 0, verified.stderr);
  assert.equal(JSON.parse(verified.stdout).passed, 1);
  const before = readFileSync(out); const second = run('generate.mjs', [f.dir, f.snapshots, out, '2021-12-31']);
  assert.equal(second.status, 1); assert.match(second.stderr, /overwrite/); assert.deepEqual(readFileSync(out), before);
  assert.deepEqual(generateCandidates(f.dir, f.snapshots, { asOf: '2021-12-31', limit: 2 }).candidates, [JSON.parse(before.toString().trim())]);
});

test('CLI preserves a competing output or summary created immediately before its exclusive open', (t) => {
  const f = fixture(t);
  for (const summary of [false, true]) {
    const out = join(f.dir, summary ? 'summary-race.jsonl' : 'output-race.jsonl');
    const target = summary ? out + '.summary.json' : out;
    const hook = join(f.dir, summary ? 'summary-race.mjs' : 'output-race.mjs');
    writeFileSync(hook, `import fs from 'node:fs';\nimport { syncBuiltinESMExports } from 'node:module';\nconst original = fs.openSync;\nfs.openSync = (path, ...args) => {\n  if (path === ${JSON.stringify(target)}) {\n    const rival = original(path, 'wx');\n    try { fs.writeFileSync(rival, 'competing file'); } finally { fs.closeSync(rival); }\n  }\n  return original(path, ...args);\n};\nsyncBuiltinESMExports();\n`);
    const result = spawnSync(process.execPath, ['--import', hook, join(HERE, 'generate.mjs'), f.dir, f.snapshots, out, '2021-12-31'], { encoding: 'utf8' });
    assert.equal(result.status, 1); assert.match(result.stderr, /overwrite/);
    assert.equal(readFileSync(target, 'utf8'), 'competing file');
    if (summary) {
      const partial = JSON.parse(readFileSync(out, 'utf8').trim());
      assert.equal(check(f, partial).valid, true);
    }
  }
});

test('symlink CLI aliases reject missing arguments and perform the same generation and checks as direct paths', (t) => {
  const f = fixture(t);
  const aliases = {};
  const missing = [];
  for (const name of ['generate.mjs', 'check.mjs']) {
    const direct = join(HERE, name); const alias = join(f.dir, 'alias ' + name);
    symlinkSync(direct, alias); aliases[name] = alias;
    for (const [kind, path] of [['direct', direct], ['alias', alias]]) {
      const run = spawnSync(process.execPath, [path], { encoding: 'utf8' });
      missing.push({ name, kind, status: run.status, usage: /Usage:/.test(run.stderr), stdout: run.stdout });
    }
  }
  assert.deepEqual(missing, ['generate.mjs', 'check.mjs'].flatMap((name) => ['direct', 'alias'].map((kind) => ({ name, kind, status: 1, usage: true, stdout: '' }))));
  const aliasOut = join(f.dir, 'alias-candidates.jsonl'), directOut = join(f.dir, 'direct-candidates.jsonl');
  for (const [script, out] of [[aliases['generate.mjs'], aliasOut], [join(HERE, 'generate.mjs'), directOut]]) {
    const generated = spawnSync(process.execPath, [script, f.dir, f.snapshots, out, '2021-12-31', '2'], { encoding: 'utf8' });
    assert.equal(generated.status, 0, generated.stderr);
    assert.deepEqual(JSON.parse(generated.stdout), { companies: 1, candidates: 1, independently_checked: 1, as_of: '2021-12-31' });
  }
  assert.deepEqual(readFileSync(aliasOut), readFileSync(directOut));
  assert.deepEqual(readFileSync(aliasOut + '.summary.json'), readFileSync(directOut + '.summary.json'));
  for (const script of [aliases['check.mjs'], join(HERE, 'check.mjs')]) {
    const checked = spawnSync(process.execPath, [script, aliasOut, f.dir, f.snapshots], { encoding: 'utf8' });
    assert.equal(checked.status, 0, checked.stderr);
    const result = JSON.parse(checked.stdout); assert.equal(result.passed, 1); assert.equal(result.failed, 0);
  }
});
