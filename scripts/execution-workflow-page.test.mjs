import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, relative } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EXECUTION_ROUTE, EXECUTION_SOURCE_COMMIT, EXECUTION_SOURCE_PATHS, executionSource, validateExecutionSource } from './lib/execution-workflow.mjs';
import { buildMcpPages, directoryPage, executionPage, releasedCatalog, serverPage } from './build-mcp-pages.mjs';
import { inspectHtml } from './audit-live-seo.mjs';
import { jsonLdProblems } from './lib/jsonld-rules.mjs';
import { PAGE_SOURCES } from './lib/page-sources.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const record = () => JSON.parse(readFileSync(new URL('../config/execution-workflow-source.json', import.meta.url)));
const sourceBytes = () => new Map(EXECUTION_SOURCE_PATHS.map(path => [path, readFileSync(join(ROOT, path))]));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceReader = bytes => path => bytes.get(relative(ROOT, path));
const markup = () => executionPage(executionSource(), releasedCatalog());
const unescape = text => text.replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');

test('the execution guide binds delivered private source and its full local import closure', () => {
  const source = executionSource();
  assert.equal(source.source_commit, EXECUTION_SOURCE_COMMIT);
  assert.equal(source.source_commit, '6a040c9b927f621987f3aaa34cf3cab560040772');
  assert.equal(source.release_status, 'private_unreleased');
  assert.equal(source.hosted_endpoint, null);
  assert.equal(source.npm_install, null);
  assert.deepEqual(source.default_tools, ['size_position', 'check_orders', 'measure_shortfall', 'journal']);
  assert.deepEqual(validateExecutionSource(JSON.parse(JSON.stringify(source))), source);
  assert.equal(EXECUTION_SOURCE_PATHS.length, 76);
  for (const path of EXECUTION_SOURCE_PATHS) {
    const text = readFileSync(join(ROOT, path), 'utf8');
    if (!/\.(?:mjs|js)$/.test(path)) continue;
    for (const match of text.matchAll(/(?:\bfrom\s+|\bimport\s*\(\s*|\bnew URL\s*\(\s*)['"](\.[^'"]+)['"]/g)) {
      const imported = relative(ROOT, fileURLToPath(new URL(match[1], new URL(path, new URL('../', import.meta.url)))));
      assert.ok(EXECUTION_SOURCE_PATHS.includes(imported), `${path}: ${match[1]}`);
    }
  }
});

test('a future release, hosted endpoint or changed example policy cannot retain this guide source claim', () => {
  for (const edit of [r => { r.source_commit = '0'.repeat(40); }, r => { r.release_status = 'released'; }, r => { r.hosted_endpoint = '/mcp/execution'; }, r => { r.npm_install = 'canli-execution-mcp'; }, r => { r.example.default_write = true; }, r => { r.example.max_tool_calls = 12; }, r => { r.local_validation.required_env = ''; }]) {
    const input = record(); edit(input);
    assert.throws(() => validateExecutionSource(input));
  }
});

test('missing, added or wrongly typed source pins refuse instead of reducing the closure', () => {
  for (const edit of [r => { delete r.source_sha256[EXECUTION_SOURCE_PATHS[0]]; }, r => { r.source_sha256['mcp-execution/unreviewed.mjs'] = '0'.repeat(64); }, r => { r.source_sha256[EXECUTION_SOURCE_PATHS[0]] = [r.source_sha256[EXECUTION_SOURCE_PATHS[0]]]; }]) {
    const input = record(); edit(input);
    assert.throws(() => validateExecutionSource(input));
  }
});

test('each of the 76 bound source mutations is independently refused from the captured bytes', () => {
  const originals = sourceBytes();
  for (const changed of EXECUTION_SOURCE_PATHS) {
    const reader = path => {
      const name = relative(ROOT, path), bytes = originals.get(name);
      return name === changed ? Buffer.concat([bytes, Buffer.from('\nchanged source\n')]) : bytes;
    };
    assert.throws(() => validateExecutionSource(record(), { root: ROOT, readFile: reader }), /source pin differs/, changed);
  }
});

test('rehashing changed source in the editable config cannot bless it under the old reviewed commit', () => {
  const bytes = sourceBytes(), input = record(), changed = 'mcp-execution/src/local-input.mjs';
  bytes.set(changed, Buffer.concat([bytes.get(changed), Buffer.from('\n// changed\n')]));
  input.source_sha256[changed] = sha(bytes.get(changed));
  let reads = 0;
  assert.throws(() => validateExecutionSource(input, { readFile: path => { reads++; return sourceReader(bytes)(path); } }), /record differs from the reviewed commit/);
  assert.equal(reads, 0);
});

test('source inspection snapshots each read once even if a later reader mutates an earlier buffer', () => {
  const bytes = sourceBytes(), counts = new Map(), packagePath = 'mcp-execution/package.json';
  const reader = path => {
    const name = relative(ROOT, path);
    counts.set(name, (counts.get(name) ?? 0) + 1);
    if (name === 'mcp-execution/src/server.mjs') bytes.get(packagePath).fill(0);
    return bytes.get(name);
  };
  const source = validateExecutionSource(record(), { root: ROOT, readFile: reader });
  assert.equal(source.package, 'canli-execution-mcp');
  assert.equal(counts.size, EXECUTION_SOURCE_PATHS.length);
  assert.ok([...counts.values()].every(count => count === 1));
});

test('a real source-pin refusal precedes every MCP generator write or directory creation', () => {
  const bytes = sourceBytes();
  bytes.set('mcp/src/local/js/trade-journal-export-core.js', Buffer.from('changed replay source'));
  let effects = 0;
  assert.throws(() => buildMcpPages({ loadExecution: () => validateExecutionSource(record(), { readFile: sourceReader(bytes) }), write: () => { effects++; }, makeDir: () => { effects++; } }), /source pin differs/);
  assert.equal(effects, 0);
});

test('the execution answer has unique indexable metadata, a self canonical and truthful source markup', () => {
  const catalog = releasedCatalog();
  const pages = [directoryPage(catalog), ...catalog.map(server => serverPage(server, catalog)), markup()];
  const parsed = pages.map((html, i) => inspectHtml(html, 'https://canlicapital.com' + (i === pages.length - 1 ? EXECUTION_ROUTE : i === 0 ? '/mcp-servers' : catalog[i - 1].route)));
  const meta = parsed.at(-1);
  assert.equal(meta.canonical, `https://canlicapital.com${EXECUTION_ROUTE}`);
  assert.equal(meta.h1.length, 1);
  assert.match(meta.robots, /^index, follow/);
  assert.ok(meta.description.length >= 140 && meta.description.length <= 160);
  assert.equal(new Set(parsed.map(page => page.title)).size, pages.length);
  assert.equal(new Set(parsed.map(page => page.description)).size, pages.length);
  const html = pages.at(-1);
  assert.deepEqual(jsonLdProblems(html), []);
  const data = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const software = data.find(node => node['@type'] === 'SoftwareSourceCode');
  assert.ok(software);
  assert.equal(software.codeRepository, `https://github.com/arhancanli/canlicapital/tree/${EXECUTION_SOURCE_COMMIT}/mcp-execution`);
  assert.equal(software.license, 'https://opensource.org/licenses/MIT');
  assert.equal(software.offers, undefined);
  assert.doesNotMatch(html, /aggregateRating|reviewRating|https:\/\/canlicapital\.com\/mcp\/execution|npx[^<]*canli-execution-mcp/);
});

test('default launch settings keep writes disabled and the example uses the actual delivered arguments', () => {
  const html = markup();
  const blocks = [...html.matchAll(/<pre[^>]*aria-label="([^"]+)"[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)];
  const launch = JSON.parse(unescape(blocks.find(row => row[1] === 'Local stdio client launch settings')[2]));
  assert.deepEqual(launch.env, { CANLI_HOME: '/absolute/private-paper-home' });
  assert.ok(html.includes('CANLI_EXEC_JOURNAL_WRITE=1'));
  assert.ok(html.includes('node mcp-execution/examples/paper-journal.mjs --home /absolute/private/example-home'));
  assert.ok(html.includes('npm ci --prefix mcp-execution'));
  assert.ok(html.includes('<code>--write</code>'));
  assert.ok(html.includes('writes_disabled'));
  assert.ok(html.includes('at most 11 tool calls'));
  assert.ok(html.includes('cooperative'));
  assert.ok(html.includes('process interruption'));
});

test('source-bound validation requires local mode and preserves the complete export companions', () => {
  const html = markup();
  const blocks = [...html.matchAll(/<pre[^>]*aria-label="([^"]+)"[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)];
  const launch = JSON.parse(unescape(blocks.find(row => row[1] === 'Local validation stdio launch settings')[2]));
  assert.deepEqual(launch.env, { CANLI_LOCAL: '1' });
  const args = JSON.parse(unescape(blocks.find(row => row[1] === 'Source-bound paper evidence tool arguments')[2]));
  assert.deepEqual(Object.keys(args).sort(), ['journal_file', 'record_file']);
  assert.ok(html.includes('full-bundle companion checks'));
  assert.ok(html.includes('bindings.all_match'));
  assert.ok(html.includes('structural conformance leaves source facts and signatures unchecked'));
});

test('the new page retains the existing skip, focusable table and correctly named code groups', () => {
  const html = markup();
  assert.ok(html.includes('class="dev-skip skip-link" href="#content"'));
  assert.ok(html.includes('<main id="content" tabindex="-1">'));
  assert.ok(html.includes('<table class="dev-table" tabindex="0">'));
  const pres = [...html.matchAll(/<pre\b([^>]*)>/g)];
  assert.equal(pres.length, 4);
  for (const [, attrs] of pres) {
    assert.match(attrs, /role="group"/);
    assert.match(attrs, /tabindex="0"/);
    assert.match(attrs, /aria-label="[^"]+"/);
  }
});

test('every source link and source-date input is bound and crawlable discovery reaches the canonical route', () => {
  const html = markup(), expected = `https://github.com/arhancanli/canlicapital/blob/${EXECUTION_SOURCE_COMMIT}/`;
  for (const [, href] of html.matchAll(/href="(https:\/\/github\.com\/arhancanli\/canlicapital\/blob\/[^"#]+)(?:#[^"]*)?"/g)) {
    assert.ok(href.startsWith(expected), href);
    assert.ok(EXECUTION_SOURCE_PATHS.includes(href.slice(expected.length)), href);
  }
  for (const path of EXECUTION_SOURCE_PATHS) assert.ok(PAGE_SOURCES[EXECUTION_ROUTE].includes(path), path);
  assert.ok(directoryPage(releasedCatalog()).includes(`href="${EXECUTION_ROUTE}"`));
  for (const file of ['scripts/build-standards-and-developers.mjs', 'scripts/build-llms-txt.mjs', 'scripts/build-papers.mjs']) assert.ok(readFileSync(join(ROOT, file), 'utf8').includes(EXECUTION_ROUTE));
  assert.ok(PAGE_SOURCES['/standards/paper-evidence'].includes('scripts/build-standards-and-developers.mjs'));
  for (const file of ['scripts/build-papers.mjs', 'vite.config.js']) assert.match(readFileSync(join(ROOT, file), 'utf8'), /'validation', 'fundamentals', 'research', 'execution'/);
  const intents = JSON.parse(readFileSync(join(ROOT, 'config/search-intents.json')));
  const rows = (intents.intents ?? intents.pages).filter(row => row.path === EXECUTION_ROUTE);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].queries, ['paper trading mcp workflow', 'canli execution mcp', 'signed trade journal mcp']);
});

test('the full build starts with the source check before any generator command', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json')));
  assert.ok(pkg.scripts.prebuild.startsWith('node scripts/lib/execution-workflow.mjs --check && '));
  assert.ok(pkg.scripts.verify.includes('scripts/execution-workflow-page.test.mjs'));
});

test('the deploy filter retains every pinned documentation input while excluding unrelated package fixtures', () => {
  function ignored(paths) {
    try {
      return execFileSync('git', ['-c', `core.excludesFile=${join(ROOT, '.vercelignore')}`, 'check-ignore', '--no-index', '--stdin'], { cwd: ROOT, input: paths.join('\n'), encoding: 'utf8' }).split('\n').filter(Boolean);
    } catch (error) {
      if (error.status === 1) return [];
      throw error;
    }
  }
  assert.deepEqual(ignored(EXECUTION_SOURCE_PATHS), []);
  assert.deepEqual(ignored(['mcp-execution/test/tools.test.mjs', 'mcp-execution/test/fixtures/example.json']), ['mcp-execution/test/tools.test.mjs', 'mcp-execution/test/fixtures/example.json']);
});

test('the actual source-check entry works through a path alias and refuses unrelated CLI actions', t => {
  const helper = fileURLToPath(new URL('./lib/execution-workflow.mjs', import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), 'canli-source-entry-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const alias = join(dir, basename(helper)); symlinkSync(helper, alias);
  const checked = spawnSync(process.execPath, [alias, '--check'], { cwd: ROOT, encoding: 'utf8', timeout: 5000 });
  assert.equal(checked.status, 0, checked.stderr);
  assert.equal(JSON.parse(checked.stdout).source_files, 76);
  assert.equal(JSON.parse(checked.stdout).source_commit, EXECUTION_SOURCE_COMMIT);
  const refused = spawnSync(process.execPath, [helper, '--publish'], { cwd: ROOT, encoding: 'utf8', timeout: 5000 });
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /Usage:/);
});
