import { cpSync, mkdtempSync, existsSync, mkdirSync, symlinkSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

// Prebuild updates generated HTML in place. Validate a separate clone so the
// upload source still matches its content-bound source-date manifest.
export function validateDeploySnapshot(source) {
  source = resolve(source);
  if (!existsSync(resolve(source, 'package.json'))) throw new Error('Snapshot package.json is missing');
  const validation = mkdtempSync(resolve(tmpdir(), 'canli-validation-'));
  cpSync(source, validation, { recursive: true, verbatimSymlinks: true, filter: path => !['dist', '.git', '.vercel', 'node_modules', 'artifacts', '.claude', '.firecrawl'].includes(basename(path)) && !basename(path).startsWith('.env') });
  if (existsSync(resolve(source, 'node_modules'))) symlinkSync(resolve(source, 'node_modules'), resolve(validation, 'node_modules'));
  const inventory = 'artifacts/qa/redesign-scope/inventory.json';
  if (existsSync(resolve(source, inventory))) {
    mkdirSync(resolve(validation, 'artifacts/qa/redesign-scope'), { recursive: true });
    copyFileSync(resolve(source, inventory), resolve(validation, inventory));
  }
  const result = spawnSync('npm', ['run', 'build'], { cwd: validation, env: { ...process.env, VERCEL: '1' }, stdio: 'inherit', timeout: 300_000 });
  if (result.error || result.status !== 0) throw new Error(`Snapshot validation failed; inspect ${validation}`);
  return validation;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error('Usage: node scripts/validate-deploy-snapshot.mjs UPLOAD_SOURCE');
  console.log(`Validated clone: ${validateDeploySnapshot(process.argv[2])}`);
  console.log('Deploy the original upload source, not the generated validation clone.');
}
