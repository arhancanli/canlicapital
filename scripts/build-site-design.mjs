import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderContributorChapter } from './lib/contributors.mjs';
import { buildContributors } from './build-contributors.mjs';
import { captureSourceDates } from './capture-source-dates.mjs';
import { applyHero } from './lib/site-hero.mjs';
import { computedTrail, declaredTrail, pageLabel, visibleNav } from './lib/breadcrumbs.mjs';

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
export function applySiteDesign(html, path, { labels = null } = {}) {
  if (!html.includes('data-product-shell="v3"')) return html;
  // Company documents share this renderer with hosted routes. It already emits
  // the design stylesheet and accessible table regions; preserve exact parity.
  if (family(path) === 'reference' && html.includes('data-design="reference"')) return html;
  let next = html.replace(/\sdata-design="[^"]*"/g, '');
  next = next.replace(/\sdata-film-scene="[^"]*"/g, '');
  next = next.replace('<html ', `<html data-design="${family(path)}" `);
  next = next.replace(/<!-- evidence-film:start -->[\s\S]*?<!-- evidence-film:end -->\s*/g, '');
  next = next.replace(/<!-- contributor-chapter:start -->[\s\S]*?<!-- contributor-chapter:end -->\s*/g, '');
  if (family(path) === 'home') {
    next = next.replace(/(<section class="home-next")/, `<!-- contributor-chapter:start -->${renderContributorChapter()}<!-- contributor-chapter:end -->$1`);
    next = next.replace(/(<section\b[^>]*class="hero cinema-hero")/, '$1 data-film-scene="0"');
    next = next.replace(/(<section\b[^>]*id="vision")/, '$1 data-film-scene="1"');
    next = next.replace(/(<section\b[^>]*id="introduction")/, '$1 data-film-scene="2"');
  }
  if (path === 'developers.html') {
    next = next.replace(/<!-- developer-contributors:start -->[\s\S]*?<!-- developer-contributors:end -->\s*/g, '');
    next = next.replace('</main>', `<!-- developer-contributors:start --><section class="developer-contributors" aria-labelledby="developer-contributors-title"><p class="eyebrow">Contribute</p><h2 id="developer-contributors-title">Improve the tools you use.</h2><p>Reproduce a result, fix a tool or improve its documentation. Contributor rewards include higher hosted API quotas and early access to new MCP tools; the program is in development.</p><a href="/contributors">Explore contribution routes and reward status ↗</a></section><!-- developer-contributors:end --></main>`);
  }
  next = next.replace(/\n?<!-- site-design:start -->[\s\S]*?<!-- site-design:end -->\n?/g, '\n');
  next = next.replace(/<link\b[^>]*href="(?:\/?(?:\.\.\/|\.\/)*css\/)[^"]+"[^>]*>\s*/g, '');
  next = next.replace(/<noscript>\s*<link\b[^>]*href="https:\/\/fonts\.googleapis\.com[^>]*>\s*<\/noscript>\s*/g, '');
  next = next.replace(/<link\b[^>]*href="https:\/\/fonts\.googleapis\.com[^>]*>\s*/g, '');
  let beforeStyleRemoval;
  do {
    beforeStyleRemoval = next;
    next = next.replace(/<style\b[^>]*>[\s\S]*?<\/style>\s*/gi, '');
  } while (next !== beforeStyleRemoval);
  // The legacy release pass inserts its theme just before </head>. Remove the
  // whole retired region, including insertion whitespace, so a full rebuild
  // preserves the bytes used by the deployment source-date manifest.
  next = next.replace(/\s*<!-- release-style:start -->[\s\S]*?<!-- release-style:end -->\s*/g, '\n');
  // Calculator introductions stay compact; the published preset remains a
  // native disclosure beside the heading, so the working controls arrive early.
  next = next.replace(/(<section\b[^>]*class="[^"]*\b(?:dsr|ec|ta|lab|chain|union)-hero\b[^>]*>)([\s\S]*?)(<\/section>)/g, (_, open, body, close) => {
    if (body.includes('class="workbench-source"')) return open + body + close;
    const compact = body.replace(/<aside\b([^>]*)>([\s\S]*?)<\/aside>/g, (all) => `<details class="workbench-source"><summary>Published preset and source boundary</summary>${all}</details>`);
    return open + compact + close;
  });
  const questions = {
    'tools/deflated-sharpe.html': 'How much of your Sharpe ratio survives after you count the full search?',
    'tools/evidence-chain.html': 'Does this published record still match its signed chain?',
    'tools/trial-accounting.html': 'Which trials belong in your search, including the work that failed?',
    'tools/selection-risk.html': 'How often does a convincing result appear in data with no edge?',
    'tools/execution.html': 'What changes when you charge for fills, delay and market impact?',
    'tools/breadth.html': 'How much do strategies diversify when they move together?',
    'tools/backtest-overfitting.html': 'How likely is the best backtest overfit across the variants you tried?',
  };
  if (questions[path] && !next.includes('class="workbench-explanation"')) {
    next = next.replace(/(<p\b[^>]*class="[^"]*(?:lead|lede|dek|description)[^"]*"[^>]*>)([\s\S]*?)(<\/p>)/, (_, open, copy, close) => `<p class="workbench-question">${questions[path]}</p><details class="workbench-explanation"><summary>How this tool works</summary>${open}${copy}${close}</details>`);
  }
  // Every page but the homepage opens with the same cinematic header (scripts/lib/site-hero.mjs): its trail,
  // label, title, summary line and actions over a still from the homepage film.
  if (family(path) !== 'home') {
    const route = '/' + path.replace(/\.html$/, '');
    const trail = declaredTrail(next) ?? (labels ? computedTrail(route, labels) : null);
    next = applyHero(next, path, { trailNav: trail && trail.length > 1 ? visibleNav(trail) : null });
  }
  next = next.replace(/<pre\b([^>]*)>/g, (all, attrs) => /\btabindex=/.test(attrs) ? all : `<pre${attrs} tabindex="0">`);
  const head = '<!-- site-design:start -->\n<link rel="stylesheet" href="/css/product-shell.css" />\n<!-- site-design:end -->\n';
  next = next.replace(/\s*<\/head>/, `\n${head}</head>`);
  // Tables remain complete and horizontally operable, without making the whole
  // page scroll sideways. Pre-existing wrappers are left alone on subsequent runs.
  next = next.replace(/<!-- design-table:start -->([\s\S]*?)<!-- design-table:end -->/g, (_, table) => table.replace(/^<div[^>]*>/, '').replace(/<\/div>$/, ''));
  if (family(path) !== 'home') next = next.replace(/<table\b[^>]*>[\s\S]*?<\/table>/g, table => `<!-- design-table:start --><div class="cc-table-scroll" role="region" aria-label="Scrollable data table" tabindex="0">${table}</div><!-- design-table:end -->`);
  return next.replace(/[ \t]+$/gm, '');
}

function run() {
  buildContributors();
  const files = readdirSync(root).filter(n => n.endsWith('.html')).map(n => resolve(root, n));
  const visit = dir => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, {withFileTypes:true})) {
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (path.endsWith('.html')) files.push(path);
    }
  };
  for (const dir of ['research','measurements','companies','publication','notes','trials','tools','standards','mcp-servers','datasets','benchmarks']) visit(resolve(root,dir));
  const routes = [];
  // every page's name, for the breadcrumb trails the headers carry
  const labels = new Map();
  for (const path of files) {
    const file = relative(root,path).replaceAll('\\','/');
    const label = pageLabel(readFileSync(path,'utf8'));
    if (label) labels.set(file === 'index.html' ? '/' : '/' + file.replace(/\.html$/, ''), label);
  }
  for (const path of files.sort()) {
    const file = relative(root,path).replaceAll('\\','/');
    const original = readFileSync(path,'utf8');
    if (!original.includes('data-product-shell="v3"')) continue;
    const next = applySiteDesign(original,file,{labels});
    if (next !== original) writeFileSync(path,next);
    routes.push({file,route:file==='index.html'?'/':'/'+file.replace(/\.html$/,''),family:family(file),indexable:!/name="robots"[^>]*content="noindex/i.test(next)});
  }
  mkdirSync(resolve(root,'docs/redesign'),{recursive:true});
  writeFileSync(resolve(root,'docs/redesign/routes.json'),JSON.stringify({schema:'canli.design-routes.v1',routes},null,2)+'\n');
  console.log(`Shared design: ${routes.length} editable routes across ${new Set(routes.map(r=>r.family)).size} families`);
  captureSourceDates();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run();
