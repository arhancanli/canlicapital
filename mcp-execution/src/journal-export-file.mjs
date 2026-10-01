import { createHash, randomUUID } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const INLINE_EXPORT_BYTES = 16 * 1024;
export const exportDigest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const sameIdentity = (a, b) => a.dev === b.dev && a.ino === b.ino && a.uid === b.uid && a.mode === b.mode;
const owned = stat => !process.getuid || stat.uid === BigInt(process.getuid());
function privateDirectory(path, label = 'exports') {
  const stat = lstatSync(path, { bigint: true });
  if (!stat.isDirectory() || (stat.mode & 0o077n) !== 0n || !owned(stat)) throw new Error(`journal ${label} directory must be private and owned by this user`);
  return stat;
}

export function storeExport(home, bytes) {
  // Refuse unsafe existing locations rather than silently changing the owner's permissions.
  mkdirSync(home, { recursive: true, mode: 0o700 });
  if (lstatSync(home).isSymbolicLink()) throw new Error('journal export home must not be a symlink');
  const root = realpathSync(home), dir = join(root, 'exports');
  privateDirectory(root, 'home');
  try { mkdirSync(dir, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  const initialHome = privateDirectory(root, 'home'), initialDir = privateDirectory(dir);
  const checkDirectories = () => {
    let currentHome, currentDir;
    try { currentHome = privateDirectory(root, 'home'); currentDir = privateDirectory(dir); }
    catch { throw new Error('journal export directory changed during creation'); }
    if (!sameIdentity(initialHome, currentHome) || !sameIdentity(initialDir, currentDir) ||
      initialHome.mtimeNs !== currentHome.mtimeNs || initialHome.ctimeNs !== currentHome.ctimeNs) throw new Error('journal export directory changed during creation');
  };
  const path = join(dir, `${exportDigest(bytes).slice(7)}-${randomUUID()}.json`);
  let fd;
  try {
    checkDirectories();
    fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    const file = fstatSync(fd, { bigint: true });
    if (!file.isFile() || (file.mode & 0o777n) !== 0o600n || !owned(file)) throw new Error('journal export file must be private');
    const checkFile = () => {
      let current, named;
      try { current = fstatSync(fd, { bigint: true }); named = lstatSync(path, { bigint: true }); }
      catch { throw new Error('journal export file changed during creation'); }
      if (!named.isFile() || !sameIdentity(file, current) || !sameIdentity(current, named)) throw new Error('journal export file changed during creation');
      return current;
    };
    checkDirectories(); checkFile();
    writeFileSync(fd, bytes);
    checkDirectories();
    if (checkFile().size !== BigInt(bytes.length)) throw new Error('journal export file changed during creation');
    return path;
  } finally {
    // A failed pathname may now name another writer's file. Close the descriptor without
    // unlinking it; failed/partial files can remain and are never returned as valid exports.
    if (fd !== undefined) closeSync(fd);
  }
}
