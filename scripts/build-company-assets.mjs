import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildCompanyAssets } from './lib/company-assets.mjs';
const sample = 'companies/0000029534/Assets.html';
const manifest = buildCompanyAssets(readFileSync(sample, 'utf8'), readFileSync(resolve('dist', sample), 'utf8'));
for (const tag of manifest.built_tags) {
  const file = /\b(?:src|href)="(\/assets\/[A-Za-z0-9_.-]+)"/.exec(tag)[1];
  if (!existsSync(resolve('dist', file.slice(1)))) throw new Error(`Missing compiled company asset ${file}`);
}
writeFileSync('dist/company-page-assets.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(`Company runtime asset manifest: ${manifest.built_tags.length} compiled resource tags`);
