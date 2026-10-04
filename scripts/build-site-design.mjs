import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const family = path => path === 'index.html' ? 'home'
  : path.startsWith('tools/') || path === 'annotate.html' ? 'workbench'
  : path.startsWith('companies/') || path === 'companies.html' ? 'reference'
  : path.startsWith('mcp-servers') || path === 'developers.html' ? 'developer'
  : /^(research|measurements|notes|trials|publication)\//.test(path) ? 'reader'
  : 'chapter';

// Runs after the source generators. Only the site's editable route documents are
// migrated; immutable papers, releases and evidence files under public stay exact.
// A second run must be byte-identical. This is also the route inventory for QA.
export function applySiteDesign(html, path) {
  if (!html.includes('data-product-shell="v3"')) return html;
  // Company documents share this renderer with hosted routes. It already emits
  // the design stylesheet and accessible table regions; preserve exact parity.
  if (family(path) === 'reference' && html.includes('data-design="reference"')) return html;
  let next = html.replace(/\sdata-design="[^"]*"/g, '');
  next = next.replace('<html ', `<html data-design="${family(path)}" `);
  next = next.replace(/\n?<!-- site-design:start -->[\s\S]*?<!-- site-design:end -->\n?/g, '\n');
  next = next.replace(/<link\b[^>]*href="(?:\/?(?:\.\.\/|\.\/)*css\/)[^"]+"[^>]*>\s*/g, '');
  next = next.replace(/<noscript>\s*<link\b[^>]*href="https:\/\/fonts\.googleapis\.com[^>]*>\s*<\/noscript>\s*/g, '');
  next = next.replace(/<link\b[^>]*href="https:\/\/fonts\.googleapis\.com[^>]*>\s*/g, '');
  next = next.replace(/<style\b[^>]*>[\s\S]*?<\/style>\s*/g, '');
  // The legacy release pass inserts its theme just before </head>. Remove the
  // whole retired region, including insertion whitespace, so a full rebuild
  // preserves the bytes used by the deployment source-date manifest.
  next = next.replace(/\s*<!-- release-style:start -->[\s\S]*?<!-- release-style:end -->\s*/g, '\n');
  // Calculator introductions stay compact; the published preset remains a
  // native disclosure beside the heading, so the working controls arrive early.
  next = next.replace(/(<section\b[^>]*class="(?:dsr|ec|ta|lab|chain|union)-hero[^>]*>)([\s\S]*?)(<\/section>)/g, (_, open, body, close) => {
    if (body.includes('class="workbench-source"')) return open + body + close;
    const compact = body.replace(/<aside\b([^>]*)>([\s\S]*?)<\/aside>/g, (all) => `<details class="workbench-source"><summary>Published preset and source boundary</summary>${all}</details>`);
    return open + compact + close;
  });
  const head = '<!-- site-design:start -->\n<link rel="stylesheet" href="/css/product-shell.css" />\n<!-- site-design:end -->\n';
  next = next.replace(/\s*<\/head>/, `\n${head}</head>`);
  // Tables remain complete and horizontally operable, without making the whole
  // page scroll sideways. Pre-existing wrappers are left alone on subsequent runs.
  next = next.replace(/<!-- design-table:start -->([\s\S]*?)<!-- design-table:end -->/g, (_, table) => table.replace(/^<div[^>]*>/, '').replace(/<\/div>$/, ''));
  if (family(path) !== 'home') next = next.replace(/<table\b[^>]*>[\s\S]*?<\/table>/g, table => `<!-- design-table:start --><div class="cc-table-scroll" role="region" aria-label="Scrollable data table" tabindex="0">${table}</div><!-- design-table:end -->`);
  return next.replace(/[ \t]+$/gm, '');
}

function run() {
  const files = readdirSync(root).filter(n => n.endsWith('.html')).map(n => resolve(root, n));
  const visit = dir => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, {withFileTypes:true})) {
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (path.endsWith('.html')) files.push(path);
    }
  };
  for (const dir of ['research','measurements','companies','publication','notes','trials','tools','standards','mcp-servers','datasets']) visit(resolve(root,dir));
  const routes = [];
  for (const path of files.sort()) {
    const file = relative(root,path).replaceAll('\\','/');
    const original = readFileSync(path,'utf8');
    if (!original.includes('data-product-shell="v3"')) continue;
    const next = applySiteDesign(original,file);
    if (next !== original) writeFileSync(path,next);
    routes.push({file,route:file==='index.html'?'/':'/'+file.replace(/\.html$/,''),family:family(file),indexable:!/name="robots"[^>]*content="noindex/i.test(next)});
  }
  mkdirSync(resolve(root,'docs/redesign'),{recursive:true});
  writeFileSync(resolve(root,'docs/redesign/routes.json'),JSON.stringify({schema:'canli.design-routes.v1',routes},null,2)+'\n');
  console.log(`Shared design: ${routes.length} editable routes across ${new Set(routes.map(r=>r.family)).size} families`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run();
