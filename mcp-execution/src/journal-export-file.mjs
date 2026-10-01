import { createHash, randomUUID } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const INLINE_EXPORT_BYTES = 16 * 1024;
export const exportDigest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

export function storeExport(home, bytes) {
  // Refuse unsafe existing locations rather than silently changing the owner's permissions.
  mkdirSync(home, { recursive: true, mode: 0o700 });
  if (lstatSync(home).isSymbolicLink()) throw new Error('journal export home must not be a symlink');
  const dir = join(realpathSync(home), 'exports');
  try { mkdirSync(dir, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  const stat = lstatSync(dir);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid())) throw new Error('journal exports directory must be private and owned by this user');
  const path = join(dir, `${exportDigest(bytes).slice(7)}-${randomUUID()}.json`);
  let fd, complete = false;
  try {
    fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    const file = fstatSync(fd);
    if (!file.isFile() || (file.mode & 0o777) !== 0o600) throw new Error('journal export file must be private');
    writeFileSync(fd, bytes);
    complete = true;
    return path;
  } finally {
    if (fd !== undefined) { closeSync(fd); if (!complete) unlinkSync(path); }
  }
}
