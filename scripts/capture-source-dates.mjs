import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gitCommitDate, writeSourceDates } from './lastmod.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
let hasGit = false;
try {
  hasGit = execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() === 'true';
} catch {}

// Generators and the design migration finish before these final byte bindings
// are captured. A deployment snapshot retains its committed source dates.
if (hasGit) {
  const manifest = JSON.parse(readFileSync(new URL('../config/source-dates.json', import.meta.url), 'utf8'));
  if (manifest.schema !== 'canli.source-dates.v1') throw new Error('Unknown source-date manifest');
  for (const source of Object.keys(manifest.files)) {
    if (!gitCommitDate(root, source)) throw new Error(`Cannot bind source date: ${source}`);
  }
  writeSourceDates(root);
  console.log(`Final source-date bindings captured for ${Object.keys(manifest.files).length} sources`);
} else {
  console.log('Git metadata absent: retained committed source-date bindings');
}
