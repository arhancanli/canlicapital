import test from 'node:test';
import assert from 'node:assert/strict';
import fs, { chmodSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readBoundedFile, readRecordFile } from './journal-files.js';

test('local snapshots bound bytes, refuse devices/FIFOs and protect private keys', t => {
  const dir = mkdtempSync(join(tmpdir(), 'canli-file-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'record'); writeFileSync(file, '12345', { mode: 0o600 });
  assert.equal(readBoundedFile(file, { maxBytes: 5 }).toString(), '12345');
  assert.throws(() => readBoundedFile(file, { maxBytes: 4 }), /exceeds/);
  assert.throws(() => readBoundedFile(dir, { maxBytes: 5 }), /regular file/);
  assert.throws(() => readBoundedFile('/dev/null', { maxBytes: 5 }), /regular file/);
  execFileSync('mkfifo', [join(dir, 'pipe')]);
  assert.throws(() => readBoundedFile(join(dir, 'pipe'), { maxBytes: 5 }), /regular file/);
  symlinkSync(file, join(dir, 'link'));
  assert.throws(() => readBoundedFile(join(dir, 'link'), { maxBytes: 5, privateFile: true }), /cannot be opened/);
  chmodSync(file, 0o644);
  assert.throws(() => readBoundedFile(file, { maxBytes: 5, privateFile: true }), /0600/);
  chmodSync(file, 0o600);
  assert.equal(readBoundedFile(file, { maxBytes: 5, privateFile: true }).length, 5);
});

test('malformed JSON and invalid encoding errors do not echo file contents', t => {
  const dir = mkdtempSync(join(tmpdir(), 'canli-record-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'record');
  for (const bytes of [Buffer.from('private-secret-not-json'), Buffer.from([0xff, 0xfe])]) {
    writeFileSync(file, bytes);
    assert.throws(() => readRecordFile(file), { message: 'record file must contain valid UTF-8 JSON' });
  }
});

test('growth and same-size edits during a read refuse a mixed snapshot', t => {
  const dir = mkdtempSync(join(tmpdir(), 'canli-race-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'record'), nativeRead = fs.readSync;
  for (const replacement of ['123456', '67890']) {
    writeFileSync(file, '12345'); let changed = false;
    t.mock.method(fs, 'readSync', (...args) => {
      const n = nativeRead(...args);
      if (!changed) {
        changed = true; writeFileSync(file, replacement);
        const later = new Date(Date.now() + 1000); utimesSync(file, later, later);
      }
      return n;
    });
    syncBuiltinESMExports();
    try { assert.throws(() => readBoundedFile(file, { maxBytes: 6 }), /changed while being read/); }
    finally { t.mock.restoreAll(); syncBuiltinESMExports(); }
  }
});
