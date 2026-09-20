import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { validateDeploySnapshot } from './validate-deploy-snapshot.mjs';

test('a mutating prebuild never changes the upload source or its bound homepage', t => {
  const source = mkdtempSync(resolve(tmpdir(), 'canli-upload-source-'));
  t.after(() => rmSync(source, { recursive: true, force: true }));
  writeFileSync(resolve(source, 'index.html'), 'Bound source bytes');
  writeFileSync(resolve(source, 'build.cjs'), "require('node:fs').writeFileSync('index.html', 'Generated evidence');");
  writeFileSync(resolve(source, 'package.json'), JSON.stringify({ scripts: { build: 'node build.cjs' } }));
  const validation = validateDeploySnapshot(source);
  t.after(() => rmSync(validation, { recursive: true, force: true }));
  assert.equal(readFileSync(resolve(source, 'index.html'), 'utf8'), 'Bound source bytes');
  assert.equal(readFileSync(resolve(validation, 'index.html'), 'utf8'), 'Generated evidence');
});
