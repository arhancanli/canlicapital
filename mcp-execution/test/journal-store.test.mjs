import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { appendJournalStore, initializeJournalStore, MAX_APPEND_BYTES, MAX_STORE_BYTES } from '../src/journal-store.mjs';
import { signLine, verifyJournal } from '../src/core/js/trade-journal-core.js';

const KEY = generateKeyPairSync('ed25519').privateKey;
const WRONG = generateKeyPairSync('ed25519').privateKey;
const TS = '2026-10-01T00:00:00.000Z';
function read(path) {
  const fd = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(fd, { bigint: true });
    assert.ok(stat.isFile());
    return { bytes: fs.readFileSync(fd), stat };
  } finally { fs.closeSync(fd); }
}
function home(t) {
  const dir = fs.mkdtempSync(join(tmpdir(), 'canli-journal-store-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return fs.realpathSync(dir);
}
function setup(t) {
  const dir = home(t);
  const init = { home: dir, privateKey: KEY, operationId: 'init', ts: TS, payload: {} };
  const first = initializeJournalStore(init);
  const args = { home: dir, privateKey: KEY, operationId: 'decision-1', ts: TS,
    kind: 'decision', payload: { decision_id: 'synthetic-only' }, expectedHead: first.entry_head };
  return { dir, init, first, args, file: join(dir, 'journal.jsonl'), lock: join(dir, 'journal.append.lock') };
}
function patch(changes, fn) {
  const originals = Object.fromEntries(Object.keys(changes).map(key => [key, fs[key]]));
  try {
    for (const [key, factory] of Object.entries(changes)) fs[key] = factory(originals[key]);
    syncBuiltinESMExports();
    return fn();
  } finally {
    Object.assign(fs, originals); syncBuiltinESMExports();
  }
}
const isUncertain = error => error.code === 'JOURNAL_STORE_UNCERTAIN';

test('exclusive initialization, private bytes and signed stable retry receipts', t => {
  const { dir, init, first, file, lock } = setup(t);
  const before = read(file);
  assert.equal(before.stat.mode & 0o7777n, 0o600n);
  assert.equal(verifyJournal(before.bytes).valid, true);
  assert.deepEqual(initializeJournalStore(init), { ...first, replayed: true });
  assert.deepEqual(read(file).bytes, before.bytes);
  assert.throws(() => initializeJournalStore({ ...init, operationId: 'another-init' }), /cannot overwrite/);
  assert.deepEqual(fs.readdirSync(dir), ['journal.jsonl']);
  assert.equal(fs.existsSync(lock), false);
});

test('an identical append retries once even after another append', t => {
  const { args, file } = setup(t);
  const first = appendJournalStore(args);
  const bytes = read(file).bytes;
  assert.deepEqual(appendJournalStore(args), { ...first, replayed: true });
  assert.deepEqual(read(file).bytes, bytes);
  appendJournalStore({ ...args, operationId: 'decision-2', payload: { decision_id: 'another-synthetic' }, expectedHead: first.entry_head });
  assert.deepEqual(appendJournalStore(args), { ...first, replayed: true });
  const verified = verifyJournal(read(file).bytes);
  assert.equal(verified.valid, true); assert.equal(verified.entries, 3);
});

test('changed identity, stale head, wrong signer and backwards time refuse without append', t => {
  const { args, file, lock } = setup(t);
  appendJournalStore(args);
  const before = read(file).bytes;
  for (const update of [{ payload: { decision_id: 'changed' } }, { ts: '2026-10-01T00:00:01.000Z' },
    { expectedHead: `sha256:${'1'.repeat(64)}` }, { privateKey: WRONG }]) {
    assert.throws(() => appendJournalStore({ ...args, ...update }));
    assert.deepEqual(read(file).bytes, before); assert.equal(fs.existsSync(lock), false);
  }
  assert.throws(() => appendJournalStore({ ...args, operationId: 'new', expectedHead: args.expectedHead }), /expected journal head/);
  const current = appendJournalStore(args).entry_head;
  assert.throws(() => appendJournalStore({ ...args, operationId: 'new', expectedHead: current,
    ts: '2026-09-30T23:59:59.999Z' }), /backwards/);
  assert.deepEqual(read(file).bytes, before);
});

test('invalid chains and sparse oversize files are never extended', t => {
  const s = setup(t);
  const original = read(s.file).bytes;
  fs.writeFileSync(s.file, Buffer.concat([original, Buffer.from('not-a-journal\n')]));
  const invalid = read(s.file).bytes;
  assert.throws(() => appendJournalStore(s.args), /journal chain is invalid/);
  assert.deepEqual(read(s.file).bytes, invalid); assert.equal(fs.existsSync(s.lock), false);
  fs.truncateSync(s.file, MAX_STORE_BYTES + 1);
  assert.throws(() => appendJournalStore(s.args), /byte limit/);
  assert.equal(fs.existsSync(s.lock), false);
});

test('unsafe JSON, invalid entries and append bounds leave journals unchanged', t => {
  const s = setup(t), before = read(s.file).bytes;
  const cyclic = {}; cyclic.x = cyclic;
  const getter = Object.defineProperty({}, 'secret', { enumerable: true, get() { throw new Error('getter ran'); } });
  for (const payload of [cyclic, getter, { n: NaN }, { n: 1e15 }, { x: undefined },
    { x: new Date() }, { x: Array(2) }, { _canli_store: {} }, { decision_id: 'bounded', x: 'x'.repeat(MAX_APPEND_BYTES) }]) {
    assert.throws(() => appendJournalStore({ ...s.args, payload }));
    assert.deepEqual(read(s.file).bytes, before); assert.equal(fs.existsSync(s.lock), false);
  }
  assert.throws(() => appendJournalStore({ ...s.args, kind: 'not-a-kind' }), /new entry is invalid/);
  assert.throws(() => appendJournalStore({ ...s.args, ts: '2026-10-32T00:00:00.000Z' }), /new entry is invalid/);
  assert.deepEqual(read(s.file).bytes, before);
});

test('private ownership, final symlinks and hardlinks are refused', t => {
  const s = setup(t), before = read(s.file).bytes;
  fs.chmodSync(s.dir, 0o755);
  assert.throws(() => appendJournalStore(s.args), /mode0700/);
  fs.chmodSync(s.dir, 0o700); fs.chmodSync(s.file, 0o644);
  assert.throws(() => appendJournalStore(s.args), /mode0600/);
  fs.chmodSync(s.file, 0o600);
  const other = join(s.dir, 'hardlink'); fs.linkSync(s.file, other);
  assert.throws(() => appendJournalStore(s.args), /singly linked/);
  fs.unlinkSync(other);
  const alias = join(s.dir, 'home-link'); fs.symlinkSync(s.dir, alias);
  assert.throws(() => appendJournalStore({ ...s.args, home: alias }));
  fs.renameSync(s.file, other); fs.symlinkSync(other, s.file);
  assert.throws(() => appendJournalStore(s.args));
  assert.deepEqual(read(other).bytes, before);
});

test('a held lock refuses another process request and is never automatically removed', t => {
  const s = setup(t), before = read(s.file).bytes;
  const marker = Buffer.from('stale synthetic pending writer\n');
  fs.writeFileSync(s.lock, marker, { flag: 'wx', mode: 0o600 });
  assert.throws(() => appendJournalStore(s.args), error => error.code === 'JOURNAL_STORE_BUSY');
  assert.deepEqual(read(s.lock).bytes, marker); assert.deepEqual(read(s.file).bytes, before);
});

test('inconsistent or duplicate signed operation metadata refuses even with a valid chain', t => {
  const s = setup(t), initial = read(s.file).bytes;
  const first = JSON.parse(initial.toString().trim());
  first.entry.payload._canli_store.request_sha256 = `sha256:${'0'.repeat(64)}`;
  const inconsistent = Buffer.from(signLine(first.entry, KEY) + '\n');
  fs.writeFileSync(s.file, inconsistent);
  assert.equal(verifyJournal(inconsistent).valid, true);
  assert.throws(() => appendJournalStore(s.args), /operation metadata/);
  assert.deepEqual(read(s.file).bytes, inconsistent);
  fs.writeFileSync(s.file, initial);
  appendJournalStore(s.args);
  const lines = read(s.file).bytes.toString().trimEnd().split('\n');
  const second = JSON.parse(lines[1]); second.entry.payload._canli_store.id = 'init';
  const duplicated = Buffer.from(lines[0] + '\n' + signLine(second.entry, KEY) + '\n');
  fs.writeFileSync(s.file, duplicated);
  assert.equal(verifyJournal(duplicated).valid, true);
  assert.throws(() => appendJournalStore(s.args), /operation metadata/);
  assert.deepEqual(read(s.file).bytes, duplicated); assert.equal(fs.existsSync(s.lock), false);
});

test('actual short writes complete and a simultaneous child writer sees the exclusive lock', t => {
  const s = setup(t), ino = read(s.file).stat.ino;
  let chunks = 0, child;
  const result = patch({ writeSync: original => (fd, bytes, offset, length, position) => {
    if (fs.fstatSync(fd, { bigint: true }).ino !== ino) return original(fd, bytes, offset, length, position);
    if (!child) {
      child = spawnSync(process.execPath, [new URL('./helpers/journal-store-child.mjs', import.meta.url).pathname], {
        input: JSON.stringify({ ...s.args, privateKey: KEY.export({ type: 'pkcs8', format: 'pem' }) }),
        encoding: 'utf8', timeout: 5000,
      });
      assert.equal(child.status, 0, child.stderr);
      assert.equal(JSON.parse(child.stdout).code, 'JOURNAL_STORE_BUSY');
    }
    chunks++;
    return original(fd, bytes, offset, Math.min(length, 7), position);
  } }, () => appendJournalStore(s.args));
  assert.ok(chunks > 2); assert.equal(result.entry_seq, 1);
  assert.equal(verifyJournal(read(s.file).bytes).entries, 2);
  assert.equal(fs.existsSync(s.lock), false);
});

test('zero and partial failed writes return uncertainty, retain the lock and never auto-retry', t => {
  for (const partial of [false, true]) {
    const s = setup(t), initial = read(s.file), ino = initial.stat.ino;
    let calls = 0;
    patch({ writeSync: original => (fd, bytes, offset, length, position) => {
      if (fs.fstatSync(fd, { bigint: true }).ino !== ino) return original(fd, bytes, offset, length, position);
      if (!partial) return 0;
      if (++calls === 1) return original(fd, bytes, offset, Math.min(13, length), position);
      throw Object.assign(new Error('synthetic write failure'), { code: 'EIO' });
    } }, () => assert.throws(() => appendJournalStore(s.args), isUncertain));
    const after = read(s.file).bytes;
    assert.deepEqual(after.subarray(0, initial.bytes.length), initial.bytes);
    assert.equal(after.length, initial.bytes.length + (partial ? 13 : 0));
    assert.equal(fs.existsSync(s.lock), true);
    assert.throws(() => appendJournalStore(s.args), error => error.code === 'JOURNAL_STORE_BUSY');
    assert.deepEqual(read(s.file).bytes, after);
  }
});

test('a journal fsync failure cannot acknowledge even a complete signed append', t => {
  const s = setup(t), ino = read(s.file).stat.ino;
  patch({ fsyncSync: original => fd => {
    if (fs.fstatSync(fd, { bigint: true }).ino === ino) throw new Error('synthetic journal fsync failure');
    return original(fd);
  } }, () => assert.throws(() => appendJournalStore(s.args), isUncertain));
  assert.equal(verifyJournal(read(s.file).bytes).entries, 2);
  assert.equal(fs.existsSync(s.lock), true);
  assert.throws(() => appendJournalStore(s.args), error => error.code === 'JOURNAL_STORE_BUSY');
});

test('directory persistence failures before append, after append and after unlock return no success', t => {
  for (const stage of [1, 2, 3]) {
    const s = setup(t), before = read(s.file).bytes;
    let directories = 0;
    patch({ fsyncSync: original => fd => {
      if (fs.fstatSync(fd).isDirectory() && ++directories === stage) throw new Error('synthetic directory fsync failure');
      return original(fd);
    } }, () => assert.throws(() => appendJournalStore(s.args), isUncertain));
    assert.equal(verifyJournal(read(s.file).bytes).entries, stage === 1 ? 1 : 2);
    assert.equal(fs.existsSync(s.lock), stage !== 3);
    if (stage === 1) assert.deepEqual(read(s.file).bytes, before);
    if (stage === 3) {
      const retry = appendJournalStore(s.args);
      assert.equal(retry.replayed, true); assert.equal(retry.entry_seq, 1);
      assert.equal(verifyJournal(read(s.file).bytes).entries, 2);
    }
  }
});

test('a directory rename/symlink swap before journal open refuses without a foreign append', t => {
  const s = setup(t), foreign = home(t), previous = s.dir + '-retained';
  t.after(() => fs.rmSync(previous, { recursive: true, force: true }));
  const before = read(s.file).bytes;
  fs.writeFileSync(join(foreign, 'journal.jsonl'), before, { flag: 'wx', mode: 0o600 });
  let swapped = false;
  patch({ openSync: original => (path, flags, mode) => {
    if (String(path) === s.file && !swapped) {
      swapped = true; fs.renameSync(s.dir, previous); fs.symlinkSync(foreign, s.dir);
    }
    return original(path, flags, mode);
  } }, () => assert.throws(() => appendJournalStore(s.args), isUncertain));
  assert.equal(swapped, true);
  assert.deepEqual(read(join(previous, 'journal.jsonl')).bytes, before);
  assert.deepEqual(read(join(foreign, 'journal.jsonl')).bytes, before);
});

test('failure and pathname replacement never unlink an unrelated lock or journal', t => {
  for (const target of ['lock', 'journal']) {
    const s = setup(t), ino = read(s.file).stat.ino;
    const path = target === 'lock' ? s.lock : s.file;
    const unrelated = Buffer.from('unrelated synthetic replacement\n');
    let swapped = false;
    patch({ writeSync: original => (fd, ...args) => {
      if (fs.fstatSync(fd, { bigint: true }).ino !== ino) return original(fd, ...args);
      swapped = true;
      fs.renameSync(path, path + '.retained');
      fs.writeFileSync(path, unrelated, { flag: 'wx', mode: 0o600 });
      throw new Error('synthetic failure after pathname replacement');
    } }, () => assert.throws(() => appendJournalStore(s.args), isUncertain));
    assert.equal(swapped, true); assert.deepEqual(read(path).bytes, unrelated);
  }
});

test('exclusive genesis creation interrupted after the syscall retains explicit uncertainty', t => {
  const dir = home(t), file = join(dir, 'journal.jsonl');
  let fd;
  patch({ openSync: original => (path, flags, mode) => {
    const opened = original(path, flags, mode);
    if (String(path) === file && (flags & fs.constants.O_CREAT)) {
      fd = opened; throw new Error('synthetic creation completed but caller received failure');
    }
    return opened;
  } }, () => assert.throws(() => initializeJournalStore({ home: dir, privateKey: KEY,
    operationId: 'init-failure', ts: TS, payload: {} }), isUncertain));
  if (fd !== undefined) fs.closeSync(fd);
  assert.equal(read(file).bytes.length, 0);
  assert.equal(fs.existsSync(join(dir, 'journal.append.lock')), true);
});

test('descriptor close errors preserve uncertainty and never retry an ambiguous descriptor', t => {
  for (const target of ['journal', 'lock', 'directory', 'validation']) {
    const s = setup(t), before = read(s.file), calls = new Map();
    let closedFd;
    patch({ closeSync: original => fd => {
      calls.set(fd, (calls.get(fd) ?? 0) + 1);
      const stat = fs.fstatSync(fd, { bigint: true });
      const chosen = target === 'directory' ? stat.isDirectory() : target === 'lock' ?
        stat.isFile() && stat.ino !== before.stat.ino : stat.ino === before.stat.ino;
      original(fd);
      if (chosen && closedFd === undefined) {
        closedFd = fd;
        throw new Error('synthetic close completed but reported failure');
      }
    } }, () => assert.throws(() => appendJournalStore(target === 'validation' ?
      { ...s.args, expectedHead: `sha256:${'0'.repeat(64)}` } : s.args), error =>
      isUncertain(error) && error.journal_persistence_attempted === (target !== 'validation')));
    assert.notEqual(closedFd, undefined);
    assert.equal(calls.get(closedFd), 1);
    assert.equal(verifyJournal(read(s.file).bytes).entries, target === 'validation' ? 1 : 2);
    assert.equal(fs.existsSync(s.lock), target === 'journal');
    if (target === 'validation') assert.deepEqual(read(s.file).bytes, before.bytes);
  }
});
