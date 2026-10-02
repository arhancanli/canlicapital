import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, symlinkSync, truncateSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { checkOrdersInput, hostedCheckOrdersInput } from '../src/check-orders.mjs';
import { MAX_LIMITS_BYTES, MAX_ORDERS_FILE_BYTES, readLocalInput } from '../src/local-input.mjs';
import { createSession, readLimitsFile, toolCheckOrders, toolShortfall } from '../src/server.mjs';

const CHECK = { asset_class: 'us_equity', orders: [{ symbol: 'TEST', side: 'buy', qty: 1 }],
  market: { TEST: { price: 100, bid: 99, ask: 101, adv_usd: 1e8, daily_vol: 0.01 } }, as_of: '2026-10-01T00:00:00.000Z' };
const SIZE = { side: 'buy', asset_class: 'us_equity', equity: 1e6, price: 100, vol: { daily: 0.02 },
  lot_size: 1, budget: { method: 'fixed_fraction', fraction: 0.1 }, caps: { max_position_frac: 0.25 } };
const SHORTFALL = { fill_source: 'self_reported', orders: [{ id: 'fixture', side: 'buy', qty: 100,
  decision_price: 100, decision_ts: '2026-10-01T12:00:00Z', arrival_mid: 101, horizon_price: 104,
  fills: [{ qty: 60, price: 102, fee: 6, ts: '2026-10-01T12:01:00Z' }] }] };
const serverUrl = new URL('../src/server.mjs', import.meta.url).href;
const inputUrl = new URL('../src/local-input.mjs', import.meta.url).href;
function fixture(t) {
  const home = mkdtempSync(join(tmpdir(), 'canli-local-input-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  return { home, session: createSession({ home, toolsets: ['plan'], journalWrites: false }) };
}
function child(script, args) {
  // The parent supplies the kill deadline; a blocked child's event loop cannot disable it.
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script, ...args],
    { timeout: 4000, killSignal: 'SIGKILL', maxBuffer: 16 * 1024, encoding: 'utf8' });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('regular planning snapshots keep captured bytes and mtime from one descriptor', t => {
  const { home } = fixture(t), file = join(home, 'input.json');
  const bytes = Buffer.from('{"max_order_notional":1000}');
  const time = new Date('2026-10-01T00:00:00.000Z');
  writeFileSync(file, bytes); utimesSync(file, time, time);
  const snapshot = readLocalInput(file, { maxBytes: MAX_LIMITS_BYTES });
  assert.deepEqual(snapshot.bytes, bytes); assert.equal(snapshot.mtime, time.toISOString());
});

test('absent limits stay absent and stable limits retain their supplied fields', t => {
  const { home, session } = fixture(t);
  assert.deepEqual(readLimitsFile(session), { path: null, limits: {} });
  writeFileSync(join(home, 'limits.json'), '{"max_order_notional":1000}');
  const captured = readLimitsFile(session);
  assert.equal(captured.path, join(home, 'limits.json'));
  assert.deepEqual(captured.limits, { max_order_notional: 1000 });
  assert.match(captured.mtime, /^\d{4}-\d{2}-\d{2}T/);
});

test('the finite limits cap admits the maximum escaped symbol allowlist', t => {
  const { home, session } = fixture(t);
  const limits = { allowed_symbols: Array(5000).fill('\0'.repeat(32)) };
  const bytes = Buffer.from(JSON.stringify(limits));
  assert.ok(bytes.length < MAX_LIMITS_BYTES);
  writeFileSync(join(home, 'limits.json'), bytes);
  assert.deepEqual(readLimitsFile(session).limits, limits);
});

test('oversized limits refuse instead of falling back to an empty policy', t => {
  const { home, session } = fixture(t);
  writeFileSync(join(home, 'limits.json'), '');
  truncateSync(join(home, 'limits.json'), MAX_LIMITS_BYTES + 1);
  assert.throws(() => readLimitsFile(session), /exceeds.*checks refuse rather than run without it/);
});

test('oversized orders refuse before decoding or scoring', async t => {
  const { home } = fixture(t), file = join(home, 'orders.json');
  writeFileSync(file, ''); truncateSync(file, MAX_ORDERS_FILE_BYTES + 1);
  await assert.rejects(toolShortfall({ fill_source: 'self_reported', orders_file: file }), /at most 16 MiB/);
});

test('stable orders preserve inline arithmetic and exact-byte provenance', async t => {
  const { home } = fixture(t), file = join(home, 'orders.json');
  const bytes = Buffer.from(JSON.stringify(SHORTFALL.orders)); writeFileSync(file, bytes);
  const inline = (await toolShortfall(SHORTFALL)).structuredContent;
  const fromFile = (await toolShortfall({ fill_source: 'self_reported', orders_file: file })).structuredContent;
  assert.deepEqual(fromFile.aggregate, inline.aggregate);
  assert.deepEqual(fromFile.rows, inline.rows);
  assert.deepEqual(fromFile.input_source, { kind: 'local_json', bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex') });
});

test('ordinary symlink aliases still read a stable regular target', { skip: process.platform === 'win32' }, t => {
  const { home } = fixture(t), target = join(home, 'target.json'), alias = join(home, 'alias.json');
  const bytes = Buffer.from('{}'); writeFileSync(target, bytes); symlinkSync(target, alias);
  assert.deepEqual(readLocalInput(alias, { maxBytes: MAX_LIMITS_BYTES }).bytes, bytes);
});

test('directory and device inputs refuse as non-regular files', { skip: process.platform === 'win32' }, t => {
  const { home } = fixture(t);
  assert.throws(() => readLocalInput(home, { maxBytes: MAX_LIMITS_BYTES }), /regular file/);
  assert.throws(() => readLocalInput('/dev/null', { maxBytes: MAX_LIMITS_BYTES }), /regular file/);
});

for (const consumer of ['shortfall', 'limits', 'check_orders', 'size_position', 'limits-resource']) {
  test(`FIFO without a writer refuses under an external child deadline: ${consumer}`, { skip: process.platform === 'win32' }, t => {
    const { home } = fixture(t), file = join(home, consumer === 'shortfall' ? 'orders.json' : 'limits.json');
    const made = spawnSync('mkfifo', [file], { timeout: 2000, killSignal: 'SIGKILL', encoding: 'utf8' });
    assert.ifError(made.error); assert.equal(made.status, 0, made.stderr);
    const result = child(`
      const api = await import(${JSON.stringify(serverUrl)});
      const [home, consumer, file] = process.argv.slice(1);
      const session = api.createSession({ home, toolsets: ['plan'], journalWrites: false });
      try {
        if (consumer === 'shortfall') await api.toolShortfall({ fill_source: 'self_reported', orders_file: file });
        else if (consumer === 'check_orders') await api.toolCheckOrders(session, ${JSON.stringify(CHECK)});
        else if (consumer === 'size_position') await api.toolSizePosition(session, ${JSON.stringify(SIZE)});
        else if (consumer === 'limits-resource') {
          const handlers = new Map();
          api.registerResources({ registerResource(name, uri, options, handler) { handlers.set(name, handler); } }, session);
          await handlers.get('limits')(new URL('execution://limits'));
        } else api.readLimitsFile(session);
        throw new Error('non-regular file was accepted');
      } catch (error) { process.stdout.write(JSON.stringify({ refused: /regular/.test(error.message), message: error.message })); }
    `, [home, consumer, file]);
    assert.equal(result.refused, true, result.message);
  });
}

for (const change of ['short-read', 'grow', 'shrink', 'same-length-edit', 'read-error']) {
  test(`unstable input refuses and closes its descriptor once: ${change}`, t => {
    const { home } = fixture(t), file = join(home, 'input.json'); writeFileSync(file, '{}');
    const result = child(`
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      const [file, change] = process.argv.slice(1);
      // Load the implementation before injecting faults; module-source reads are not test inputs.
      const { readLocalInput } = await import(${JSON.stringify(inputUrl)});
      const read = fs.readSync, close = fs.closeSync, open = fs.openSync;
      let reads = 0, closes = 0, readerFd;
      fs.openSync = (path, ...args) => {
        const fd = open(path, ...args);
        if (path === file && readerFd === undefined) readerFd = fd;
        return fd;
      };
      fs.closeSync = fd => { if (fd === readerFd) closes++; return close(fd); };
      fs.readSync = (fd, buffer, offset, length, position) => {
        if (fd !== readerFd) return read(fd, buffer, offset, length, position);
        reads++;
        if (change === 'read-error') throw new Error('injected read refusal');
        if (change === 'short-read') return reads === 1 ? read(fd, buffer, offset, 1, position) : 0;
        const count = read(fd, buffer, offset, length, position);
        if (reads === 1 && change === 'grow') fs.appendFileSync(file, ' ');
        if (reads === 1 && change === 'shrink') fs.truncateSync(file, 1);
        if (reads === 1 && change === 'same-length-edit') {
          fs.writeFileSync(file, '[]'); fs.utimesSync(file, 1790812800, 1790812800);
        }
        return count;
      };
      syncBuiltinESMExports();
      let refused = false;
      try { readLocalInput(file, { maxBytes: 1024 }); }
      catch (error) { refused = /changed while being read|injected read refusal/.test(error.message); }
      process.stdout.write(JSON.stringify({ refused, closes, reads }));
    `, [file, change]);
    assert.ok(result.reads > 0); assert.equal(result.refused, true); assert.equal(result.closes, 1);
  });
}

test('invalid UTF-8 refuses and parser diagnostics do not echo private file content', async t => {
  const { home, session } = fixture(t);
  writeFileSync(join(home, 'limits.json'), Buffer.concat([Buffer.from('{"allowed_symbols":["'), Buffer.from([0xff]), Buffer.from('"]}') ]));
  assert.throws(() => readLimitsFile(session), /valid UTF-8 JSON/);
  const file = join(home, 'orders.json');
  writeFileSync(file, Buffer.concat([Buffer.from('[{"id":"'), Buffer.from([0xff]), Buffer.from('"}]')]));
  await assert.rejects(toolShortfall({ fill_source: 'self_reported', orders_file: file }), /valid JSON array/);
  writeFileSync(join(home, 'limits.json'), '{ private-fixture-content');
  assert.throws(() => readLimitsFile(session), error => /checks refuse/.test(error.message) && !error.message.includes('private-fixture-content'));
});

test('metadata-only fees refuse in both local and hosted input contracts', async t => {
  const { session } = fixture(t);
  for (const fees of [{ as_of: '2026-10-01' }, { as_of: '2026-10-01', source_url: 'https://example.test/fees' }]) {
    for (const schema of [checkOrdersInput, hostedCheckOrdersInput]) assert.equal(schema.safeParse({ ...CHECK, fees }).success, false);
    await assert.rejects(toolCheckOrders(session, { ...CHECK, fees }), /at least one monetary schedule field/);
  }
});

test('omitted commission stays unknown while an explicit zero is measured as zero', async t => {
  const { session } = fixture(t);
  const missing = (await toolCheckOrders(session, CHECK)).structuredContent;
  assert.equal(missing.rows[0][missing.columns.indexOf('commission_bps')], null);
  assert.ok(missing.not_modelled.some(reason => /commission/.test(reason)));
  const supplied = { ...CHECK, fees: { commission_bps: 0, as_of: '2026-10-01' } };
  assert.equal(hostedCheckOrdersInput.safeParse(supplied).success, true);
  const zero = (await toolCheckOrders(session, supplied)).structuredContent;
  assert.equal(zero.rows[0][zero.columns.indexOf('commission_bps')], 0);
  assert.ok(!zero.not_modelled.some(reason => /commission/.test(reason)));
});

test('a stated sell-only fee retains zero buy commission and the supplied sell charge', async t => {
  const { session } = fixture(t);
  const args = { ...CHECK, orders: [...CHECK.orders, { symbol: 'TEST', side: 'sell', qty: 1 }],
    fees: { sell_fee_rate: 0.0001, as_of: '2026-10-01' } };
  assert.equal(hostedCheckOrdersInput.safeParse(args).success, true);
  const result = (await toolCheckOrders(session, args)).structuredContent;
  const index = result.columns.indexOf('commission_bps');
  assert.equal(result.rows[0][index], 0); assert.equal(result.rows[1][index], 1);
});
