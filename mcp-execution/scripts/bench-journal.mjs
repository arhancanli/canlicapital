// Single-machine synthetic stdio measurement, not broker latency or external review.
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, cpus } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { PEM, syntheticAccountJournal } from '../test/helpers/journal-account.mjs';

const sha = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const home = mkdtempSync(join(tmpdir(), 'canli-journal-bench-'));
const journal_file = join(home, 'journal.jsonl'), input = syntheticAccountJournal(350);
writeFileSync(journal_file, input); writeFileSync(join(home, 'journal.key'), PEM, { mode: 0o600 });
let execution, validation;
async function connect(path, env) {
  const client = new Client({ name: 'journal-bench', version: '1' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path], env: { ...process.env, ...env } }));
  await client.listTools(); return client;
}
function timing(rows) {
  const sorted = [...rows].sort((a, b) => a - b);
  return { runs: rows.length, median_ms: sorted[Math.floor(rows.length / 2)], p95_ms: sorted[Math.ceil(rows.length * 0.95) - 1] };
}
try {
  execution = await connect(new URL('../src/server.mjs', import.meta.url).pathname, { CANLI_HOME: home, CANLI_EXEC_TOOLSETS: 'journal' });
  validation = await connect(new URL('../../mcp/src/server.mjs', import.meta.url).pathname, { CANLI_LOCAL: '1', CANLI_TOOLSETS: 'validate', CANLI_KEY: '', CANLI_API_BASE: 'http://127.0.0.1:1', CANLI_FULL_ENVELOPE: '1' });
  const exportTimes = [], validationTimes = []; let exported, verified, artifact;
  for (let i = 0; i < 25; i++) {
    let start = performance.now();
    const result = await execution.callTool({ name: 'journal', arguments: { action: 'export', sign: true } });
    const exportMs = performance.now() - start;
    if (result.isError || result.structuredContent?.inline !== false) throw new Error('synthetic export failed');
    exported = result.structuredContent;
    start = performance.now();
    const checked = await validation.callTool({ name: 'validate_paper_evidence', arguments: { record_file: exported.record_file, journal_file } });
    const validateMs = performance.now() - start;
    if (checked.isError || checked.structuredContent?.data?.bindings?.all_match !== true) throw new Error('synthetic source validation failed');
    verified = checked.structuredContent; artifact = readFileSync(exported.record_file);
    if (i >= 5) { exportTimes.push(exportMs); validationTimes.push(validateMs); }
  }
  const reference = new URL('../test/fixtures/journal-export-python.json.gz', import.meta.url);
  console.log(JSON.stringify({ schema: 'canli.journal-export-benchmark.v1', measured_at: new Date().toISOString(), scope: 'synthetic 350-mark local stdio; 5 warmups + 20 measured runs; no broker/model API or paid workload', node: process.version, platform: process.platform, arch: process.arch, cpu: cpus()[0].model, observation_count: 350, journal_bytes: input.length, journal_sha256: sha(input), export: { ...timing(exportTimes), artifact_bytes: artifact.length, summary_bytes: Buffer.byteLength(JSON.stringify(exported)) }, validation: { ...timing(validationTimes), response_bytes: Buffer.byteLength(JSON.stringify(verified)), source_bound: true, stored_receipt: false }, python_reference_sha256: sha(readFileSync(reference)) }, null, 2));
} finally {
  if (execution) await execution.close(); if (validation) await validation.close();
  rmSync(home, { recursive: true, force: true });
}
