// Both real stdio packages: a private export artifact crosses the MCP boundary by path,
// not by dumping its observations into the agent's context. CI installs both packages.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { PEM, syntheticAccountJournal } from './helpers/journal-account.mjs';

async function connect(path, env) {
  const client = new Client({ name: 'journal-link-test', version: '1' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path], env: { ...process.env, ...env } }));
  await client.listTools(); return client;
}
test('two stdio servers link a signed private export to source-bound validation without receipts', async t => {
  const home = mkdtempSync(join(tmpdir(), 'canli-link-')); t.after(() => rmSync(home, { recursive: true, force: true }));
  const journal_file = join(home, 'journal.jsonl');
  writeFileSync(journal_file, syntheticAccountJournal(350)); writeFileSync(join(home, 'journal.key'), PEM, { mode: 0o600 });
  const execution = await connect(new URL('../src/server.mjs', import.meta.url).pathname, { CANLI_HOME: home, CANLI_EXEC_TOOLSETS: 'journal' });
  let validation;
  try {
    const exported = await execution.callTool({ name: 'journal', arguments: { action: 'export', sign: true } });
    assert.notEqual(exported.isError, true, JSON.stringify(exported.content));
    const { record_file, inline, signed } = exported.structuredContent;
    assert.equal(inline, false); assert.equal(signed, true); assert.ok(record_file);
    validation = await connect(new URL('../../mcp/src/server.mjs', import.meta.url).pathname, { CANLI_LOCAL: '1', CANLI_TOOLSETS: 'validate', CANLI_API_BASE: 'http://127.0.0.1:1', CANLI_KEY: '', CANLI_FULL_ENVELOPE: '1' });
    const verified = await validation.callTool({ name: 'validate_paper_evidence', arguments: { record_file, journal_file } });
    assert.notEqual(verified.isError, true, JSON.stringify(verified.content));
    const result = verified.structuredContent;
    assert.equal(result.computed, 'locally'); assert.equal(result.receipt, null);
    assert.equal(result.data.valid, true); assert.equal(result.data.bindings.all_match, true);
    assert.equal(result.data.bindings.record_signature_valid, true);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE KEY|synthetic no positions/);
  } finally { await execution.close(); if (validation) await validation.close(); }
});
