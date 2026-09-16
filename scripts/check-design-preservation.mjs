import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const ignored = new Set(['node_modules', '.git', 'dist', 'artifacts', 'public', '.vercel', '.firecrawl']);
function pages(dir = '.') {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (ignored.has(entry.name) || entry.name.startsWith('.')) return [];
    const path = join(dir, entry.name);
    return entry.isDirectory() ? pages(path) : path.endsWith('.html') ? [path] : [];
  });
}
function inventory() {
  return Object.fromEntries(pages().flatMap(path => {
    const html = readFileSync(path, 'utf8');
    if (!html.includes('data-product-shell=')) return [];
    const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1];
    if (!main) throw new Error(`Missing main: ${path}`);
    const text = main.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return [[path, {
      textHash: createHash('sha256').update(text).digest('hex'),
      ids: [...main.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]).sort(),
      links: [...main.matchAll(/\bhref="([^"]+)"/g)].map(m => m[1]).sort(),
      controls: [...main.matchAll(/<(?:input|button|select|textarea)\b[^>]*>/g)].map(m => m[0]).sort(),
    }]];
  }));
}
const file = 'artifacts/qa/full-site-motion/content-before.json';
const current = inventory();
if (process.argv.includes('--snapshot')) {
  mkdirSync('artifacts/qa/full-site-motion', { recursive: true });
  // Refuse to overwrite the original reference on a later run.
  writeFileSync(file, JSON.stringify(current, null, 2), { flag: 'wx' });
  console.log(`Captured ${Object.keys(current).length} public pages.`);
} else {
  const before = JSON.parse(readFileSync(file, 'utf8'));
  const failures = Object.entries(before).flatMap(([path, data]) => {
    if (!current[path]) return [`${path}: page removed`];
    return Object.keys(data).filter(key => JSON.stringify(data[key]) !== JSON.stringify(current[path][key])).map(key => `${path}: ${key} changed`);
  });
  console.log(JSON.stringify({ pages: Object.keys(before).length, failures }, null, 2));
  if (failures.length) process.exitCode = 1;
}
