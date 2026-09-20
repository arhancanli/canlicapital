import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const rows = [2023, 2024, 2025].map((year, index) => ({ start: `${year}-01-01`, end: `${year}-12-31`,
  filed: `${year+1}-02-01`, form: '10-K', accn: `0000000001-${String(year+1).slice(-2)}-000001`, val: index+1 }));
test('concept inventory excludes future, constant, incompatible-unit and conflicting histories', () => {
  const root = mkdtempSync(join(tmpdir(), 'canli-concept-inventory-'));
  try {
    const directory = join(root, 'delivery'); mkdirSync(directory);
    const facts = {
      NewFlow: { units: { USD: rows } },
      FutureOnlyCoverage: { units: { USD: [...rows.slice(0,2), {...rows[2], end:'2027-12-31',start:'2027-01-01',filed:'2028-02-01'}] } },
      ConstantZero: { units: { USD: rows.map(row => ({...row, val:0})) } },
      UnsupportedUnit: { units: { EUR: rows } },
      Conflicted: { units: { USD: [...rows,{...rows[0],val:999}] } },
      Assets: { units: { USD: rows } },
    };
    const raw = Buffer.from(JSON.stringify({cik:1, facts:{'us-gaap':facts}}));
    const source = gzipSync(raw), selected = Buffer.from(JSON.stringify({cik:'0000000001',source_sha256:sha(raw),fetched_at:'2026-09-20T00:00:00Z'}));
    const descriptor = (name, bytes) => { writeFileSync(join(directory,name),bytes); return {storage_path:name,bytes:bytes.length,sha256:sha(bytes)}; };
    writeFileSync(join(directory,'delivery.json'),JSON.stringify({schema:'canli.company-delivery.v1',files:[{
      cik:'0000000001',selected:descriptor('selected.json',selected),source:descriptor('source.gz',source)}]}));
    const output = join(root,'report.json');
    const run = () => execFileSync(process.execPath,['scripts/inventory-company-concept-coverage.mjs',output,directory],{stdio:'pipe'});
    run(); const first = readFileSync(output); run(); assert.deepEqual(readFileSync(output),first);
    const report = JSON.parse(first), byTag = Object.fromEntries(report.concepts.map(c=>[c.tag,c]));
    assert.equal(report.source_companies,1); assert.equal(byTag.NewFlow.companies_with_structural_history,1);
    assert.equal(byTag.NewFlow.period_kind_companies.instant,0);
    for(const tag of ['FutureOnlyCoverage','ConstantZero','UnsupportedUnit','Conflicted']) assert.equal(byTag[tag].companies_with_structural_history,0,tag);
    assert.equal(byTag.Conflicted.selector_error_companies,1); assert.equal(byTag.Assets,undefined);
    writeFileSync(join(directory,'source.gz'),Buffer.from('corrupted'));
    assert.throws(run);
  } finally { rmSync(root,{recursive:true,force:true}); }
});
