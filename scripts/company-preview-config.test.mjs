import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, existsSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { companyPreviewConfig } from './lib/company-preview-config.mjs';
import { prepareCompanyPreviewOutput, prepareEnabledCompanyPreviewOutput } from './prepare-company-preview-output.mjs';

test('alternate config tracks the base without activating production routes', () => {
  const base = JSON.parse(readFileSync('vercel.json')), before = structuredClone(base);
  const preview = companyPreviewConfig(base);
  assert.deepEqual(base, before);
  assert.deepEqual(JSON.parse(readFileSync('vercel.company-preview.json')), preview);
  assert.ok(!base.rewrites.some(r => r.destination.includes('company-reference')));
  assert.deepEqual(preview.rewrites.slice(3), base.rewrites);
});
function fixture(t) {
  const root = mkdtempSync(resolve(tmpdir(), 'company-preview-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(resolve(root, 'dist/companies'), { recursive: true });
  mkdirSync(resolve(root, 'dist/company-data')); mkdirSync(resolve(root, 'companies'));
  for (const name of ['index.html', 'company-page-assets.json', 'companies.html', 'developers.html']) writeFileSync(resolve(root, 'dist', name), 'retained');
  writeFileSync(resolve(root, 'companies/source.html'), 'original');
  return root;
}
test('cleanup is confined to generated company artifacts after an explicit preview build', t => {
  const root = fixture(t);
  assert.deepEqual(prepareEnabledCompanyPreviewOutput(root, { VERCEL_ENV: 'production' }), []);
  assert.ok(existsSync(resolve(root, 'dist/companies.html')));
  assert.throws(() => prepareEnabledCompanyPreviewOutput(root, { VERCEL_ENV: 'production', COMPANY_CLEAN_ROUTE_PREVIEW: '1' }), /preview-only/);
  for (const VERCEL_ENV of [undefined, 'production', 'development']) {
    assert.throws(() => prepareCompanyPreviewOutput(root, { VERCEL_ENV }), /preview-only/);
    assert.ok(existsSync(resolve(root, 'dist/companies.html')));
  }
  prepareEnabledCompanyPreviewOutput(root, { VERCEL_ENV: 'preview', COMPANY_CLEAN_ROUTE_PREVIEW: '1' });
  for (const name of ['companies', 'companies.html', 'company-data']) assert.ok(!existsSync(resolve(root, 'dist', name)));
  for (const name of ['index.html', 'company-page-assets.json', 'developers.html']) assert.ok(existsSync(resolve(root, 'dist', name)));
  assert.equal(readFileSync(resolve(root, 'companies/source.html'), 'utf8'), 'original');
});
test('symlink guard fails before deleting any generated company output', t => {
  const root = fixture(t);
  rmSync(resolve(root, 'dist/company-data'), { recursive: true });
  symlinkSync(resolve(root, 'companies'), resolve(root, 'dist/company-data'));
  assert.throws(() => prepareCompanyPreviewOutput(root, { VERCEL_ENV: 'preview' }), /symlink/);
  assert.ok(existsSync(resolve(root, 'dist/companies.html')));
  assert.ok(existsSync(resolve(root, 'companies/source.html')));
});
