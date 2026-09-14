// Keep the original baseline and checker strict. Explain only the two intentional
// illustration-caption edits, and prove the rest of the homepage text is exact.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const raw = spawnSync(process.execPath, ['scripts/check-design-preservation.mjs'], { encoding: 'utf8' });
if (raw.error) throw raw.error;
const comparison = JSON.parse(raw.stdout);
const captions = [
  ['Original optical study / not trading hardware', 'Mechanism studies / not performance data'],
  ['Original 3D assembly / conceptual, not a system schematic', 'Research → Paper observations → Published record / conceptual sequence'],
];
let html = readFileSync('index.html', 'utf8');
for (const [before, after] of captions) {
  if (html.split(after).length !== 2) throw new Error(`Expected exactly one caption: ${after}`);
  html = html.replace(after, before);
}
const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1];
const text = main.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const baseline = JSON.parse(readFileSync('artifacts/qa/full-site-motion/content-before.json', 'utf8'));
const restoredHash = createHash('sha256').update(text).digest('hex');
const unexpected = comparison.failures.filter(f => f !== 'index.html: textHash changed');
if (restoredHash !== baseline['index.html'].textHash) unexpected.push('Homepage has additional unexplained text changes');
const report = { pages: comparison.pages, rawDifferences: comparison.failures,
  intentionalCaptions: captions.map(([before, after]) => ({ before, after })),
  homepageRestoredHashMatches: restoredHash === baseline['index.html'].textHash,
  unexpected, passed: unexpected.length === 0 };
mkdirSync('artifacts/qa/phase2-atlas', { recursive: true });
writeFileSync('artifacts/qa/phase2-atlas/preservation.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
