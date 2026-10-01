// Bounded local snapshots. One descriptor avoids path substitution; metadata and byte-count
// checks detect ordinary concurrent edits. An open descriptor alone does not freeze a file.
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';

export const MAX_JOURNAL_BYTES = 256 * 1024 * 1024;
export const MAX_RECORD_BYTES = 64 * 1024 * 1024;
export function readBoundedFile(path, { maxBytes, privateFile = false } = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new RangeError('file byte limit must be a positive integer');
  let fd;
  try { fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK | (privateFile ? constants.O_NOFOLLOW : 0)); }
  catch (error) { if (error.code === 'ENOENT') throw error; throw new Error('local file cannot be opened'); }
  try {
    const before = fstatSync(fd, { bigint: true });
    if (!before.isFile()) throw new Error('local input must be a regular file');
    if (before.size > BigInt(maxBytes)) throw new Error(`local file exceeds ${maxBytes} bytes`);
    if (privateFile && ((before.mode & 0o777n) !== 0o600n || (process.getuid && before.uid !== BigInt(process.getuid())))) throw new Error('signing key must be owned by this user with mode 0600');
    const expected = Number(before.size), bytes = Buffer.alloc(expected + 1);
    let length = 0;
    while (length < bytes.length) {
      const n = readSync(fd, bytes, length, bytes.length - length, null);
      if (!n) break;
      length += n;
    }
    const after = fstatSync(fd, { bigint: true });
    if (length !== expected || before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) throw new Error('local file changed while being read; retry from a stable snapshot');
    return bytes.subarray(0, length);
  } finally { closeSync(fd); }
}

export function readRecordFile(path) {
  const bytes = readBoundedFile(path, { maxBytes: MAX_RECORD_BYTES });
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new Error('record file must contain valid UTF-8 JSON'); }
}
