// Synthetic local fixtures only. Exercise the opt-in boundary and delivered-store link.
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { JOURNAL_DESCRIPTION, JOURNAL_JSON, JOURNAL_OUTPUT } from '../src/journal.mjs';
import { configuredJournalWrites } from '../src/journal-write.mjs';
import { createSession, registerTools, toolJournal } from '../src/server.mjs';
import { journalBindings } from '../src/core/js/trade-journal-export-core.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INIT = { action: 'initialize', operation_id: 'synthetic-init', ts: '2026-10-01T00:00:00.000Z', payload: {} };
const append = (head, id = 'synthetic-decision', payload = { decision_id: id }) =>
  ({ action: 'append', operation_id: id, ts: INIT.ts, expected_head: head, kind: 'decision', payload });
function fixture(t, withKey = true) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'canli-write-')));
  chmodSync(home, 0o700);
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const pem = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' });
  if (withKey) writeFileSync(join(home, 'journal.key'), pem, { mode: 0o600 });
  return { home, pem, session: createSession({ home, toolsets: ['journal'], journalWrites: true,
    now: () => new Date('2026-10-05T00:00:00.000Z') }) };
}
async function run(session, args) {
  const result = await toolJournal(session, args);
  assert.notEqual(result.isError, true, JSON.stringify(result));
  assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
  return result.structuredContent;
}
function child(source, home) {
  const p = spawnSync(process.execPath, ['--input-type=module', '-e', source, home],
    { cwd: ROOT, timeout: 10000, encoding: 'utf8', maxBuffer: 65536 });
  assert.equal(p.status, 0, p.stderr || String(p.error));
  return JSON.parse(p.stdout);
}

test('default write denial and registration leave the original journal schema unchanged', async t => {
  const { home } = fixture(t);
  const session = createSession({ home, toolsets: ['journal'], journalWrites: false });
  let definition;
  registerTools({ registerTool: (_name, metadata) => { definition = metadata; } }, session);
  assert.deepEqual(definition.inputSchema['~standard'].jsonSchema.input(), JOURNAL_JSON);
  assert.equal(definition.description, JOURNAL_DESCRIPTION);
  assert.equal(definition.outputSchema, JOURNAL_OUTPUT);
  await assert.rejects(toolJournal(session, INIT), /action.*disabled/);
  assert.deepEqual(readdirSync(home), ['journal.key']);
});

test('only exact explicit flag values enable writes; invalid configuration refuses', () => {
  for (const value of [undefined, '', '0']) assert.equal(configuredJournalWrites(value), false);
  assert.equal(configuredJournalWrites('1'), true);
  for (const value of ['true', 'yes', ' 1 ', '2']) assert.throws(() => configuredJournalWrites(value), /must be 0 or 1/);
  assert.throws(() => createSession({ journalWrites: '1' }), /must be boolean/);
  assert.throws(() => createSession({ journalWrites: null }), /must be boolean/);
});

test('initialize and append emit bound receipts without keys or raw payloads', async t => {
  const { home, pem, session } = fixture(t);
  const initial = await run(session, INIT);
  assert.deepEqual([initial.action, initial.entry_seq, initial.replayed], ['initialize', 0, false]);
  const written = await run(session, append(initial.entry_head, 'synthetic-secret', { decision_id: 'synthetic-secret', note: 'private fixture note' }));
  assert.equal(written.entry_seq, 1);
  assert.ok(written.journal_prefix_bytes > initial.journal_prefix_bytes);
  const verified = await run(session, { action: 'verify' });
  assert.deepEqual([verified.valid, verified.entries, verified.head], [true, 2, written.entry_head]);
  assert.doesNotMatch(JSON.stringify([initial, written]), /BEGIN PRIVATE KEY|private fixture note|journal_key/);
  assert.equal(readFileSync(join(home, 'journal.key'), 'utf8'), pem);
  assert.deepEqual(readdirSync(home).sort(), ['journal.jsonl', 'journal.key']);
});

test('exact retries retain the original prefix after a later append', async t => {
  const { home, session } = fixture(t);
  const initial = await run(session, INIT), args = append(initial.entry_head);
  const first = await run(session, args);
  await run(session, append(first.entry_head, 'later'));
  const before = readFileSync(join(home, 'journal.jsonl'));
  const replay = await run(session, args);
  assert.deepEqual(replay, { ...first, replayed: true });
  assert.ok(readFileSync(join(home, 'journal.jsonl')).equals(before));
  const genesisReplay = await run(session, INIT);
  assert.deepEqual(genesisReplay, { ...initial, replayed: true });
});

test('changed retry identity or expected head refuses without changing journal bytes', async t => {
  const { home, session } = fixture(t);
  const initial = await run(session, INIT), args = append(initial.entry_head);
  const first = await run(session, args), before = readFileSync(join(home, 'journal.jsonl'));
  for (const changed of [{ ...args, expected_head: first.entry_head }, { ...args, payload: { decision_id: 'changed' } },
    { ...args, operation_id: 'new', expected_head: 'sha256:' + '0'.repeat(64) }]) {
    const result = await toolJournal(session, changed);
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.error.code, 'JOURNAL_STORE_REFUSED');
    assert.equal(result.structuredContent.entry_head, undefined);
    assert.ok(readFileSync(join(home, 'journal.jsonl')).equals(before));
  }
});

test('write calls refuse arbitrary files, inline keys, missing fields and unsupported kinds', async t => {
  const { home, session } = fixture(t);
  for (const args of [{ ...INIT, file: '/other/journal' }, { ...INIT, private_key: 'synthetic' },
    { ...INIT, payload: undefined }, { ...INIT, operation_id: '../escape' },
    { ...INIT, ts: 'now' }, { ...append('sha256:' + '0'.repeat(64)), kind: 'unknown' }]) {
    await assert.rejects(toolJournal(session, args), /journal:/);
    assert.deepEqual(readdirSync(home), ['journal.key']);
  }
});

test('missing key and unsafe home refuse without generating keys or creating a journal', async t => {
  const { home, session } = fixture(t, false);
  await assert.rejects(toolJournal(session, INIT));
  assert.deepEqual(readdirSync(home), []);
  const f = fixture(t);
  chmodSync(f.home, 0o755);
  await assert.rejects(toolJournal(f.session, INIT), /mode0700/);
  assert.deepEqual(readdirSync(f.home), ['journal.key']);
  await assert.rejects(toolJournal(createSession({ home: 'relative', journalWrites: true }), INIT), /absolute local POSIX/);
});

test('unsafe key permissions and key symlinks refuse without persistence', async t => {
  const f = fixture(t);
  chmodSync(join(f.home, 'journal.key'), 0o644);
  await assert.rejects(toolJournal(f.session, INIT), /mode 0600/);
  assert.equal(existsSync(join(f.home, 'journal.jsonl')), false);
  const g = fixture(t, false), target = join(g.home, 'private-key');
  writeFileSync(target, g.pem, { mode: 0o600 });
  symlinkSync(target, join(g.home, 'journal.key'));
  await assert.rejects(toolJournal(g.session, INIT), /cannot be opened/);
  assert.equal(existsSync(join(g.home, 'journal.jsonl')), false);
});

test('reserved and accessor payloads refuse without invoking getters or creating journals', async t => {
  const { home, session } = fixture(t);
  let reads = 0;
  const accessor = Object.defineProperty({}, 'note', { enumerable: true, get: () => { reads++; return 'private'; } });
  for (const payload of [{ _canli_store: {} }, accessor, { note: 'x'.repeat(65537) }]) {
    const result = await toolJournal(session, { ...INIT, payload });
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.error.code, 'JOURNAL_STORE_REFUSED');
    assert.equal(existsSync(join(home, 'journal.jsonl')), false);
  }
  assert.equal(reads, 0);
});

test('a pending lock returns a typed error and is never automatically removed', async t => {
  const { home, session } = fixture(t);
  const marker = Buffer.from('synthetic pending evidence');
  writeFileSync(join(home, 'journal.append.lock'), marker, { mode: 0o600 });
  const result = await toolJournal(session, INIT);
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.error.code, 'JOURNAL_STORE_BUSY');
  assert.equal(result.structuredContent.entry_head, undefined);
  assert.ok(readFileSync(join(home, 'journal.append.lock')).equals(marker));
  assert.equal(existsSync(join(home, 'journal.jsonl')), false);
});

test('observed home replacement after key capture returns uncertainty without a receipt', t => {
  const { home } = fixture(t);
  const result = child(`
    import fs from 'node:fs'; import { syncBuiltinESMExports } from 'node:module';
    import { join } from 'node:path';
    const home=process.argv[1], previous=home+'-previous', other=home+'-other';
    fs.mkdirSync(other,{mode:0o700});
    const real=fs.openSync; let opens=0;
    fs.openSync=function(path,...rest) {
      if(path===home && ++opens===2) { fs.renameSync(home,previous); fs.renameSync(other,home); }
      return real.call(this,path,...rest);
    }; syncBuiltinESMExports();
    const {createSession,toolJournal}=await import('./src/server.mjs');
    try {
      const result=await toolJournal(createSession({home,journalWrites:true}),${JSON.stringify(INIT)});
      console.log(JSON.stringify({error:result.structuredContent.error,isError:result.isError,
        receipt:result.structuredContent.entry_head??null,foreignJournal:fs.existsSync(join(home,'journal.jsonl'))}));
    } finally { fs.rmSync(previous,{recursive:true,force:true}); fs.rmSync(other,{recursive:true,force:true}); }
  `, home);
  assert.equal(result.isError, true);
  assert.equal(result.error.code, 'JOURNAL_STORE_UNCERTAIN');
  assert.equal(result.error.journal_persistence_attempted, true);
  assert.equal(result.receipt, null);
  assert.equal(result.foreignJournal, true); // Retained, not advertised as a successful destination.
});

test('directory close failure before the writer is called never acknowledges or retries close', t => {
  const { home } = fixture(t);
  const result = child(`
    import fs from 'node:fs'; import {syncBuiltinESMExports} from 'node:module';
    import {join} from 'node:path';
    const home=process.argv[1],open=fs.openSync,close=fs.closeSync; let directory,closes=0;
    fs.openSync=function(path,...rest){const fd=open.call(this,path,...rest);if(path===home)directory=fd;return fd;};
    fs.closeSync=function(fd){close.call(this,fd);if(fd===directory){closes++;throw new Error('synthetic directory close failure');}};
    syncBuiltinESMExports();const {createSession,toolJournal}=await import('./src/server.mjs');
    let message=null;try{await toolJournal(createSession({home,journalWrites:true}),${JSON.stringify(INIT)});}catch(e){message=e.message;}
    console.log(JSON.stringify({message,closes,journal:fs.existsSync(join(home,'journal.jsonl')),lock:fs.existsSync(join(home,'journal.append.lock'))}));
  `, home);
  assert.match(result.message, /synthetic directory close failure/);
  assert.equal(result.closes, 1);
  assert.equal(result.journal, false);
  assert.equal(result.lock, false);
});

test('written synthetic account exports and verifies against the original journal', async t => {
  const { home, session } = fixture(t);
  const initial = await run(session, { ...INIT, payload: { account: { schema: 'canli.trade-journal.account.v0',
    strategy_id: 'synthetic-writer', session_id: 'label-only', venue: 'local_sim', currency: 'USD',
    initial_cash: 1000, initial_positions: [], frequency: 'IRREGULAR' } } });
  let head = initial.entry_head;
  for (let i = 1; i <= 3; i++) {
    const result = await run(session, { ...append(head, 'mark-' + i), kind: 'mark',
      ts: `2026-10-0${i + 1}T00:00:00.000Z`, payload: { marks: {}, source: 'synthetic no positions' } });
    head = result.entry_head;
  }
  const bytes = readFileSync(join(home, 'journal.jsonl'));
  const exported = await run(session, { action: 'export', sign: true });
  const bundle = exported.inline ? exported : JSON.parse(readFileSync(exported.record_file, 'utf8'));
  assert.equal(journalBindings(bundle.record, bytes, bundle.signature).all_match, true);
  assert.ok(readFileSync(join(home, 'journal.jsonl')).equals(bytes));
});

test('the actual opt-in stdio lists and invokes writes without exposing signing material', async t => {
  const { home, pem } = fixture(t);
  const client = new Client({ name: 'synthetic-journal-writer', version: '1' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(ROOT, 'src/server.mjs')],
    env: { ...process.env, CANLI_HOME: home, CANLI_EXEC_TOOLSETS: 'journal', CANLI_EXEC_JOURNAL_WRITE: '1' } }));
  try {
    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map(tool => tool.name), ['journal']);
    const actions = listed.tools[0].inputSchema.oneOf.slice(1).map(branch => branch.properties.action.const);
    assert.deepEqual(actions, ['initialize', 'append']);
    assert.equal(listed.tools[0].annotations.readOnlyHint, false);
    const init = await client.callTool({ name: 'journal', arguments: INIT });
    assert.notEqual(init.isError, true, JSON.stringify(init));
    const written = await client.callTool({ name: 'journal', arguments: append(init.structuredContent.entry_head) });
    assert.notEqual(written.isError, true, JSON.stringify(written));
    const verified = await client.callTool({ name: 'journal', arguments: { action: 'verify' } });
    assert.deepEqual([verified.structuredContent.valid, verified.structuredContent.entries], [true, 2]);
    assert.ok(!JSON.stringify([listed, init, written, verified]).includes(pem));
    const bad = await client.callTool({ name: 'journal', arguments: { ...INIT, private_key: pem } });
    assert.equal(bad.isError, true);
    assert.ok(!JSON.stringify(bad).includes(pem));
  } finally { await client.close(); }
});
