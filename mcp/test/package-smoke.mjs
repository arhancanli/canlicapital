// Install the actual tarball outside this checkout, then exercise its stdio entry.
// Dependency installation contacts npm; tool calls use only the local HTTP stub.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCAL_FILES } from "../scripts/sync-local.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporary = mkdtempSync(join(tmpdir(), 'canli-mcp-package-'));
const pkg = JSON.parse(readFileSync(join(root, 'package.json')));
try {
  const [packed] = JSON.parse(execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', temporary], { cwd: root, encoding: 'utf8' }));
  assert.equal(packed.name, pkg.name);
  assert.equal(packed.version, pkg.version);
  const expected = ['LICENSE', 'README.md', 'package.json', 'src/schemas.mjs', 'src/server.mjs', 'src/local.mjs', 'src/series-file.mjs', 'src/receipt-keys.json', ...LOCAL_FILES.map((f) => `src/local/${f}`)].sort();
  assert.deepEqual(packed.files.map(file => file.path).sort(), expected);
  assert.ok(packed.files.find(file => file.path === 'src/server.mjs').mode & 0o111, 'server entry must be executable');
  const install = join(temporary, 'consumer with spaces');
  execFileSync('npm', ['install', '--prefix', install, '--ignore-scripts', '--no-audit', '--no-fund', join(temporary, packed.filename)], { stdio: 'pipe' });
  const installedRoot = join(install, 'node_modules', pkg.name);
  const installed = JSON.parse(readFileSync(join(installedRoot, 'package.json')));
  assert.equal(installed.version, pkg.version);
  assert.deepEqual(installed.bin, pkg.bin);
  assert.equal(readFileSync(join(installedRoot, 'LICENSE'), 'utf8'), readFileSync(join(root, '../LICENSE'), 'utf8'));
  execFileSync(process.execPath, ['--test', join(root, 'test/stdio.test.mjs')], {
    cwd: install, env: { ...process.env, CANLI_TEST_PACKAGE_ROOT: installedRoot,
      CANLI_TEST_SERVER_ENTRY: join(install, 'node_modules/.bin/canlicapital-validation-mcp') }, stdio: 'inherit',
  });
  console.log(JSON.stringify({ package: packed.name, version: packed.version, files: packed.files.length,
    integrity: packed.integrity, result: 'PASS', scope: 'Isolated tarball install and local-stub stdio; not npm publication or production API verification' }));
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
