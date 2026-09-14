import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Design-system HTML specimens are components, not public routes.
const ignored = new Set(['node_modules', '.git', 'dist', 'artifacts', 'public', 'ds-bundle']);
function walk(dir = '.') {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (entry.name.startsWith('.') || ignored.has(entry.name)) return [];
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : path.endsWith('.html') ? [path] : [];
  });
}
const routes = walk().sort().map(file => {
  const source = readFileSync(file, 'utf8');
  return {
    file,
    route: file === 'index.html' ? '/' : '/' + file.replace(/\.html$/, ''),
    family: file.includes('/') ? file.split('/')[0] : 'top-level',
    title: source.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? null,
    sections: [...source.matchAll(/<section\b[^>]*\bid="([^"]+)"/g)].map(m => m[1]),
    status: 'inventoried-not-reviewed',
  };
});
const protectedDocuments = walk('public').sort().map(file => ({
  file,
  route: '/' + file.replace(/^public\//, ''),
  status: 'preserve-original-document',
  reason: 'Original publication artifact; improve its wrapper, not its published bytes.',
}));
mkdirSync('artifacts/qa/redesign-scope', { recursive: true });
writeFileSync('artifacts/qa/redesign-scope/inventory.json', JSON.stringify({
  note: 'Source inventory only. Not a visual review or proof that routes are deployed. Regeneration does not track completion; record batch evidence in the roadmap.',
  routes,
  protectedDocuments,
}, null, 2) + '\n');
console.log(JSON.stringify({ total: routes.length, protectedDocuments: protectedDocuments.length, families: routes.reduce((counts, r) => {
  counts[r.family] = (counts[r.family] ?? 0) + 1; return counts;
}, {}) }, null, 2));
