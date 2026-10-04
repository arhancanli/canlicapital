// Render the existing browser data binders during the build. The same modules
// then refresh them in a browser. There is no second set of numeric formatters,
// no live network access, and no browser binary in the deploy environment.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { parseHTML } from 'linkedom';
import { build } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceBindings = entry => {
  const found = new Map();
  const visit = file => {
    if (found.has(file)) return;
    const bytes = readFileSync(resolve(root, file));
    found.set(file, createHash('sha256').update(bytes).digest('hex'));
    for (const match of bytes.toString().matchAll(/from ["'](\.[^"']+)["']/g)) {
      const next = relative(root, resolve(root, dirname(file), match[1]));
      if (next.startsWith('js/') && next.endsWith('.js')) visit(next);
    }
  };
  visit(entry);
  return Object.fromEntries(found);
};
const motionStub = `const noop=()=>{};export const ScrollTrigger={refresh:noop,create:noop};export default {registerPlugin:noop,set:noop,to:noop,from:noop,delayedCall:noop,utils:{toArray:(s)=>Array.from(document.querySelectorAll(s))}};`;

export async function renderStaticEvidence(html, entry, { readArtifact = path => readFileSync(path, 'utf8'), onComputed = () => {}, computedSelectors = [] } = {}) {
  const { window, document } = parseHTML(html);
  const warnings = [];
  const computed = new Set();
  const observer = new window.MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes ?? []) {
      const text = node.textContent?.trim();
      if (text) computed.add(text);
    }
  });
  observer.observe(document.querySelector('main'), { childList: true, characterData: true, subtree: true });
  window.matchMedia = query => ({ matches: query.includes('prefers-reduced-motion'), addEventListener() {}, removeEventListener() {} });
  const location = new URL('https://canlicapital.com/' + entry.replace('js/', '').replace('.js', ''));
  const history = { replaceState() {} };
  window.location = location;
  window.history = history;
  for (const form of document.querySelectorAll('form')) Object.defineProperty(form, 'elements', {value: { namedItem: name => form.querySelector(`[name="${name}"]`) }});
  window.innerWidth = 1440;
  window.innerHeight = 1000;
  window.devicePixelRatio = 1;
  window.requestAnimationFrame = () => 0;
  window.HTMLElement.prototype.getBoundingClientRect = () => ({ width: 1000, height: 300, top: 0, left: 0, right: 1000, bottom: 300 });
  window.HTMLCanvasElement.prototype.getContext = () => null;
  // A browser-only filter is an enhancement; the static library keeps every row.
  const pending = new Set();
  const fetch = async url => {
    if (typeof url !== 'string' || !url.startsWith('/') || url.includes('..')) throw new Error(`Static evidence refuses non-local artifact: ${url}`);
    const path = resolve(root, 'public', url.slice(1));
    const request = Promise.resolve().then(() => {
      const body = readArtifact(path);
      return { ok: true, status: 200, json: async () => JSON.parse(body), text: async () => body };
    });
    pending.add(request);
    try { return await request; } finally { pending.delete(request); }
  };
  const bundle = await build({
    root, configFile: false, logLevel: 'silent',
    plugins: [{ name: 'static-evidence-motion', enforce: 'pre', resolveId(id) { if (id === 'gsap' || id === 'gsap/ScrollTrigger') return '\0static-motion'; }, load(id) { if (id === '\0static-motion') return motionStub; } }],
    build: { write: false, minify: false, lib: { entry: resolve(root, entry), name: 'StaticEvidence', formats: ['iife'] } },
  });
  const code = (Array.isArray(bundle) ? bundle : [bundle]).flatMap(result => result.output).find(file => file.type === 'chunk').code;
  const context = createContext({ window, document, fetch, location, history, console: { error: (...args) => warnings.push(args.join(' ')), warn: (...args) => warnings.push(args.join(' ')), log() {} }, Intl, Date, URL, URLSearchParams, TextEncoder, TextDecoder, Event: window.Event, setTimeout, clearTimeout, requestAnimationFrame: window.requestAnimationFrame });
  runInContext(code, context, { timeout: 10000 });
  // A binder can start another local read after a previous promise resolves.
  // Let its complete async continuation settle, then fail closed on any error.
  for (let i = 0; i < 30; i++) { await Promise.allSettled([...pending]); await new Promise(resolve => setImmediate(resolve)); }
  observer.disconnect();
  if (warnings.length) throw new Error(`${entry}: ${warnings.join('; ')}`);
  // Linkedom does not report every tbody innerHTML mutation. These explicitly
  // declared outputs are populated by the binder, never copied from page prose.
  for (const selector of computedSelectors) {
    const node = document.querySelector(selector);
    if (!node?.textContent.trim()) throw new Error(`${entry}: missing computed output ${selector}`);
    const cells = [...node.querySelectorAll('th,td')];
    computed.add(cells.length ? cells.map(cell => cell.textContent.trim()).join(' | ') : node.textContent.trim());
  }
  onComputed([...computed]);
  const main = document.querySelector('main');
  if (!main) throw new Error(`${entry}: missing main`);
  // No-JavaScript readers see the expanded record. Interactive browser controls
  // can initialize their own collapsed state again after hydration.
  for (const node of main.querySelectorAll('.archive-search')) node.remove();
  const body = main.innerHTML;
  return html.replace(/(<main\b[^>]*>)[\s\S]*?(<\/main>)/, (_, open, close) => open + body + close);
}

async function run() {
  for (const [name, entry] of [['research', 'research'], ['open', 'open'], ['performance', 'performance'], ['tools/deflated-sharpe', 'dsr-tool'], ['tools/breadth', 'breadth-lab'], ['tools/execution', 'execution-lab'], ['tools/selection-risk', 'selection-risk-lab'], ['tools/trial-accounting', 'trial-accounting-tool'], ['tools/backtest-overfitting', 'backtest-overfitting-tool']]) {
    const path = resolve(root, `${name}.html`);
    const html = readFileSync(path, 'utf8');
    let texts = [];
    const computedSelectors = entry === 'execution-lab' ? ['#lab-classification'] : [];
    let next = await renderStaticEvidence(html, `js/${entry}.js`, { onComputed: values => { texts = values; }, computedSelectors });
    if (name.startsWith('tools/')) {
      const slug = name.slice(6);
      const source = `calculator-defaults/${slug}.json`;
      mkdirSync(resolve(root, 'public/glassbox/calculator-defaults'), { recursive: true });
      const sha256 = file => createHash('sha256').update(readFileSync(resolve(root, file))).digest('hex');
      const record = { schema: 'canli.calculator-defaults.v1', route: '/' + name,
        evidence_basis: 'Illustrative deterministic calculator defaults. Not ALPHAC performance, qualification or admission evidence.',
        renderer: { path: `js/${entry}.js`, sha256: sha256(`js/${entry}.js`) },
        source_bindings: sourceBindings(`js/${entry}.js`),
        computed_output_selectors: computedSelectors,
        computed_text: texts };
      writeFileSync(resolve(root, 'public/glassbox', source), JSON.stringify(record, null, 2) + '\n');
      next = next.replace(/(<meta name="canli:sources" content=")([^"]*)("[^>]*>)/, (_, open, sources, close) => {
        const originals = sources.split(/\s+/).filter(item => item && !item.startsWith('calculator-defaults/'));
        return open + [...originals, source].join(' ') + close;
      });
    }
    if (next !== html) writeFileSync(path, next);
  }
  console.log('Static evidence: research, open record, performance and six tools rendered from their existing source binders');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await run();
