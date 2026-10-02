// Planning inputs are read-only snapshots. Nonblocking admission refuses FIFOs before reading.
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';

export const MAX_LIMITS_BYTES = 1024 * 1024;
export const MAX_ORDERS_FILE_BYTES = 16 * 1024 * 1024;

export function readLocalInput(path, { maxBytes } = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_ORDERS_FILE_BYTES) {
    throw new RangeError('local input byte limit must be between 1 and 16 MiB');
  }
  let fd;
  try { fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK); }
  catch (error) {
    if (error.code === 'ENOENT') throw error;
    throw new Error('local input cannot be opened', { cause: error });
  }
  try {
    const before = fstatSync(fd, { bigint: true });
    if (!before.isFile()) throw new RangeError('local input must be a regular file');
    if (before.size > BigInt(maxBytes)) throw new RangeError(`local input exceeds ${maxBytes} bytes`);
    const expected = Number(before.size), bytes = Buffer.alloc(expected + 1);
    let length = 0;
    while (length < bytes.length) {
      const count = readSync(fd, bytes, length, bytes.length - length, null);
      if (!count) break;
      length += count;
    }
    const after = fstatSync(fd, { bigint: true });
    if (length !== expected || before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) {
      throw new Error('local input changed while being read; use a stable snapshot');
    }
    return { bytes: bytes.subarray(0, length), mtime: before.mtime.toISOString() };
  } finally { closeSync(fd); }
}

export function decodeLocalJson(bytes) {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new RangeError('local input must contain valid UTF-8 JSON'); }
}
