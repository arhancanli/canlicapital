// Reviewed repository source for the local paper guide, separate from hosted releases.
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const EXECUTION_ROUTE = '/mcp-servers/execution';
export const EXECUTION_SOURCE_COMMIT = '826c25966c6fb9212930c82fc864516cdd26368f';
export const EXECUTION_SOURCE_PATHS = Object.freeze([
  'mcp-execution/EXAMPLES.md',
  'mcp-execution/JOURNAL_STORAGE.md',
  'mcp-execution/LICENSE',
  'mcp-execution/README.md',
  'mcp-execution/examples/paper-journal.mjs',
  'mcp-execution/package-lock.json',
  'mcp-execution/package.json',
  'mcp-execution/src/check-orders.mjs',
  'mcp-execution/src/core/js/dsr-core.js',
  'mcp-execution/src/core/js/exec-cost-core.js',
  'mcp-execution/src/core/js/journal-files.js',
  'mcp-execution/src/core/js/moments-core.js',
  'mcp-execution/src/core/js/pretrade-core.js',
  'mcp-execution/src/core/js/shortfall-core.js',
  'mcp-execution/src/core/js/sizing-core.js',
  'mcp-execution/src/core/js/trade-journal-core.js',
  'mcp-execution/src/core/js/trade-journal-export-core.js',
  'mcp-execution/src/core/scripts/canonical-json.mjs',
  'mcp-execution/src/info.mjs',
  'mcp-execution/src/journal-export-file.mjs',
  'mcp-execution/src/journal-store.mjs',
  'mcp-execution/src/journal-write.mjs',
  'mcp-execution/src/journal.mjs',
  'mcp-execution/src/local-input.mjs',
  'mcp-execution/src/measure-shortfall.mjs',
  'mcp-execution/src/server.mjs',
  'mcp-execution/src/size-position.mjs',
  'mcp-execution/test/paper-journal-example.test.mjs',
  'mcp/LICENSE',
  'mcp/package-lock.json',
  'mcp/package.json',
  'mcp/src/journal-evidence.mjs',
  'mcp/src/lab-schemas.mjs',
  'mcp/src/lab.mjs',
  'mcp/src/local.mjs',
  'mcp/src/local/api/_lib/limits.js',
  'mcp/src/local/js/audit-core.js',
  'mcp/src/local/js/backtest-core.js',
  'mcp/src/local/js/breadth-core.js',
  'mcp/src/local/js/dsr-core.js',
  'mcp/src/local/js/feasibility-core.js',
  'mcp/src/local/js/haircut-core.js',
  'mcp/src/local/js/journal-files.js',
  'mcp/src/local/js/leakage-core.js',
  'mcp/src/local/js/luck-core.js',
  'mcp/src/local/js/moments-core.js',
  'mcp/src/local/js/null-zoo-v1-sizes.js',
  'mcp/src/local/js/paper-evidence-core.js',
  'mcp/src/local/js/pbo-core.js',
  'mcp/src/local/js/placebo-core.js',
  'mcp/src/local/js/receipt-statement.js',
  'mcp/src/local/js/selection-risk-core.js',
  'mcp/src/local/js/series-summary-core.js',
  'mcp/src/local/js/snooping-core.js',
  'mcp/src/local/js/stress-core.js',
  'mcp/src/local/js/student-t.js',
  'mcp/src/local/js/trade-journal-core.js',
  'mcp/src/local/js/trade-journal-export-core.js',
  'mcp/src/local/js/validate/backtest-length.js',
  'mcp/src/local/js/validate/breadth.js',
  'mcp/src/local/js/validate/deflated-sharpe.js',
  'mcp/src/local/js/validate/haircut-sharpe.js',
  'mcp/src/local/js/validate/luck-trials.js',
  'mcp/src/local/js/validate/overfitting.js',
  'mcp/src/local/js/validate/paper-evidence.js',
  'mcp/src/local/js/validate/reality-check.js',
  'mcp/src/local/js/validate/track-record.js',
  'mcp/src/local/scripts/canonical-json.mjs',
  'mcp/src/local/standards/paper-evidence/schema.json',
  'mcp/src/receipt-keys.json',
  'mcp/src/schemas.mjs',
  'mcp/src/series-file.mjs',
  'mcp/src/server.mjs',
  'standards/trade-journal/EXPORT.md',
]);
// A changed file plus a rehashed editable config cannot retain the old source claim.
const REVIEWED_HASH_PAIRS = 'c53c0c783b7a1c9909e23543a6bdc1aa5aef58394fe758b5c76d7d678f6601e9';
const names = ['size_position', 'check_orders', 'measure_shortfall', 'journal'];
const recordSchema = z.object({
  schema: z.literal('canli.execution-workflow-source.v1'),
  route: z.literal(EXECUTION_ROUTE),
  source_commit: z.literal(EXECUTION_SOURCE_COMMIT),
  package: z.literal('canli-execution-mcp'),
  release_status: z.literal('private_unreleased'),
  transport: z.literal('local_stdio'),
  hosted_endpoint: z.null(),
  npm_install: z.null(),
  default_tools: z.tuple(names.map(name => z.literal(name))),
  write_opt_in: z.literal('CANLI_EXEC_JOURNAL_WRITE=1'),
  example: z.object({
    path: z.literal('mcp-execution/examples/paper-journal.mjs'),
    default_write: z.literal(false), write_flag: z.literal('--write'),
    max_tool_calls: z.literal(11), nominal_stdio_window_ms: z.literal(30_000),
    shutdown_reserve_ms: z.literal(5_000),
  }).strict(),
  local_validation: z.object({
    path: z.literal('mcp/src/server.mjs'), required_env: z.literal('CANLI_LOCAL=1'),
    full_bundle_parameter: z.literal('record_file'), source_parameter: z.literal('journal_file'),
  }).strict(),
  source_sha256: z.record(z.string(), z.string().regex(/^[0-9a-f]{64}$/)),
}).strict();

export function validateExecutionSource(record, { root = ROOT, readFile = readFileSync } = {}) {
  const parsed = recordSchema.parse(record);
  if (JSON.stringify(Object.keys(parsed.source_sha256).sort()) !== JSON.stringify([...EXECUTION_SOURCE_PATHS].sort())) {
    throw new Error('Execution workflow requires the complete reviewed source-pin set');
  }
  const pairs = EXECUTION_SOURCE_PATHS.map(path => [path, parsed.source_sha256[path]]);
  if (createHash('sha256').update(JSON.stringify(pairs)).digest('hex') !== REVIEWED_HASH_PAIRS) {
    throw new Error('Execution workflow source record differs from the reviewed commit');
  }
  // Inspect the same captured bytes that were hashed, not a second pathname read.
  const captured = new Map();
  for (const path of EXECUTION_SOURCE_PATHS) {
    const bytes = Buffer.from(readFile(resolve(root, path)));
    if (createHash('sha256').update(bytes).digest('hex') !== parsed.source_sha256[path]) {
      throw new Error(`Execution workflow source pin differs: ${path}`);
    }
    captured.set(path, bytes);
  }
  const pkg = JSON.parse(captured.get('mcp-execution/package.json').toString('utf8'));
  if (pkg.name !== parsed.package || pkg.private !== true) throw new Error('Execution workflow must describe private repository source');
  const registered = [...captured.get('mcp-execution/src/server.mjs').toString('utf8').matchAll(/\bserver\.registerTool\("([a-z_]+)"/g)].map(match => match[1]);
  if (JSON.stringify(registered) !== JSON.stringify(names)) throw new Error('Execution workflow tool set differs from the reviewed source');
  return parsed;
}

export function executionSource(root = ROOT, { readFile = readFileSync } = {}) {
  const record = JSON.parse(Buffer.from(readFile(resolve(root, 'config/execution-workflow-source.json'))).toString('utf8'));
  return validateExecutionSource(record, { root, readFile });
}

export const executionSourceHref = (source, path) => `https://github.com/arhancanli/canlicapital/blob/${source.source_commit}/${path}`;

let isEntry = false;
try { isEntry = !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { /* Imported by another entry point. */ }
if (isEntry) {
  if (process.argv.length !== 3 || process.argv[2] !== '--check') {
    console.error('Usage: node scripts/lib/execution-workflow.mjs --check');
    process.exitCode = 1;
  } else {
    try {
      const source = executionSource();
      console.log(JSON.stringify({ source_commit: source.source_commit, source_files: EXECUTION_SOURCE_PATHS.length, release_status: source.release_status }));
    } catch (error) {
      console.error(`Execution source check refused: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
