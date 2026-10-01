// Private local persistence for a supplied journal key. Not registered as an MCP tool.
// Cooperating writers use an exclusive lock; interrupted operations are never auto-recovered.
import { createHash, createPrivateKey, KeyObject } from 'node:crypto';
import { closeSync, constants, fstatSync, fsyncSync, lstatSync, openSync, readSync,
  realpathSync, unlinkSync, writeSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

import { genesisLine, nextLine, publicKeyBase64, verifyJournal } from './core/js/trade-journal-core.js';
import { canonicalJson } from './core/scripts/canonical-json.mjs';

export const STORE_SCHEMA = 'canli.trade-journal.operation.v1';
export const MAX_STORE_BYTES = 8 * 1024 * 1024;
export const MAX_APPEND_BYTES = 64 * 1024;
const META = '_canli_store';
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const ID = /^[A-Za-z0-9._:-]{1,128}$/;
const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
// Directory link counts can change with ordinary child creation on supported systems.
const sameIdentity = (a, b) => ['dev', 'ino', 'uid', 'gid', 'mode'].every(k => a[k] === b[k]);
const sameFileIdentity = (a, b) => sameIdentity(a, b) && a.nlink === b.nlink;
const sameSnapshot = (a, b) => sameFileIdentity(a, b) &&
  ['size', 'mtimeNs', 'ctimeNs'].every(k => a[k] === b[k]);

function refused(message) {
  const error = new Error(`journal store: ${message}`);
  error.code = 'JOURNAL_STORE_REFUSED';
  return error;
}
function uncertain(persistenceStarted, cause) {
  const error = new Error('journal store: persistence is uncertain; retain the journal and pending lock for explicit recovery review', { cause });
  error.code = 'JOURNAL_STORE_UNCERTAIN';
  error.journal_persistence_attempted = persistenceStarted;
  return error;
}
function owned(stat) { return stat.uid === BigInt(process.getuid()); }
function privateFile(stat) {
  if (!stat.isFile() || !owned(stat) || (stat.mode & 0o7777n) !== 0o600n || stat.nlink !== 1n) {
    throw refused('files must be regular, singly linked, owned and mode0600');
  }
}
function privateDirectory(stat) {
  if (!stat.isDirectory() || !owned(stat) || (stat.mode & 0o7777n) !== 0o700n) {
    throw refused('home must be an existing owned mode0700 directory');
  }
}

// Capture plain JSON before filesystem effects, without invoking getters/toJSON or dropping values.
function snapshotPayload(payload) {
  let nodes = 0, bytes = 0;
  const ancestors = new Set();
  const budget = length => {
    bytes += length;
    if (bytes > MAX_APPEND_BYTES) throw refused('payload exceeds aggregate canonical JSON byte limit');
  };
  const scalar = value => {
    let rendered;
    try { rendered = canonicalJson(value); } catch { throw refused('payload value has no supported canonical JSON form'); }
    budget(Buffer.byteLength(rendered));
    return value;
  };
  function copy(value, depth) {
    if (++nodes > MAX_APPEND_BYTES || depth > 40) throw refused('payload exceeds JSON bounds');
    if (value === null || typeof value === 'boolean') return scalar(value);
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || Math.abs(value) >= 1e15) throw refused('payload number is outside journal bounds');
      return scalar(value);
    }
    if (typeof value === 'string') {
      if (Buffer.byteLength(value) > MAX_APPEND_BYTES) throw refused('payload string exceeds append bounds');
      return scalar(value);
    }
    if (!value || typeof value !== 'object' || ancestors.has(value)) throw refused('payload must be acyclic plain JSON');
    const array = Array.isArray(value);
    if (!array && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw refused('payload must be plain JSON');
    if (array && value.length > MAX_APPEND_BYTES) throw refused('payload arrays exceed JSON bounds');
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Object.keys(value);
    if (Object.getOwnPropertySymbols(value).length || keys.length > MAX_APPEND_BYTES ||
        Object.getOwnPropertyNames(value).length !== keys.length + (array ? 1 : 0)) throw refused('payload has non-JSON members');
    if (array && (value.length > MAX_APPEND_BYTES || keys.length !== value.length ||
        keys.some((key, i) => key !== String(i)))) throw refused('payload arrays must be dense');
    ancestors.add(value);
    budget(2); // Braces or brackets.
    const out = array ? [] : Object.create(null);
    let index = 0;
    for (const key of keys) {
      const field = descriptors[key];
      if (!Object.hasOwn(field, 'value') || !field.enumerable || key.length > MAX_APPEND_BYTES ||
          !/^[\x00-\x7f]*$/.test(key)) throw refused('payload members must be bounded ASCII JSON data');
      if (index++) budget(1); // Comma.
      if (!array) { scalar(key); budget(1); } // Member name and colon.
      out[key] = copy(field.value, depth + 1);
    }
    ancestors.delete(value);
    return out;
  }
  const result = copy(payload, 0);
  if (!result || Array.isArray(result) || typeof result !== 'object' || Object.hasOwn(result, META)) {
    throw refused(`payload must be an object without reserved ${META}`);
  }
  return result;
}

function request(input, initialize) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw refused('options must be an object');
  const allowed = ['home', 'privateKey', 'operationId', 'ts', 'payload', ...(initialize ? [] : ['kind', 'expectedHead'])];
  if (Object.keys(input).some(k => !allowed.includes(k)) || typeof input.home !== 'string' ||
      !isAbsolute(input.home) || typeof input.operationId !== 'string' || !ID.test(input.operationId)) throw refused('invalid options or operation ID');
  const expectedHead = initialize ? null : input.expectedHead;
  if (!initialize && (typeof expectedHead !== 'string' || !DIGEST.test(expectedHead))) throw refused('an append requires its expected journal head');
  let key;
  try {
    key = input.privateKey instanceof KeyObject ? input.privateKey : createPrivateKey(input.privateKey);
    if (key.type !== 'private') throw new Error();
    if (key.asymmetricKeyType !== 'ed25519') throw new Error();
  } catch { throw refused('a supplied Ed25519 private signing key is required'); }
  const kind = initialize ? 'config' : input.kind;
  const payload = snapshotPayload(input.payload);
  if (initialize && Object.hasOwn(payload, 'journal_key')) throw refused('genesis signing key is supplied separately');
  const body = { kind, payload, ts: input.ts, expected_head: expectedHead };
  let requestHash;
  try { requestHash = digest(canonicalJson(body)); } catch { throw refused('request must contain valid JSON fields'); }
  return { home: input.home, key, id: input.operationId, ...body, requestHash };
}

function openHome(home) {
  if (!process.getuid || !Number.isInteger(constants.O_NOFOLLOW) || !Number.isInteger(constants.O_DIRECTORY)) {
    throw refused('private journal storage requires POSIX descriptor and ownership support');
  }
  // Open without following the final component, then validate the actual directory descriptor.
  const fd = openSync(home, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    const path = realpathSync(home);
    const initial = fstatSync(fd, { bigint: true });
    privateDirectory(initial);
    const check = () => {
      for (const stat of [fstatSync(fd, { bigint: true }), lstatSync(path, { bigint: true }), lstatSync(home, { bigint: true })]) {
        privateDirectory(stat);
        if (!sameIdentity(initial, stat)) throw refused('home directory identity changed');
      }
    };
    check();
    return { path, fd, check };
  } catch (error) {
    // Opening the directory made no journal mutation; keep the validation error.
    try { closeSync(fd); } catch { /* Never retry an ambiguously closed descriptor. */ }
    throw error;
  }
}

function fileGuard(home, path, fd) {
  const initial = fstatSync(fd, { bigint: true });
  privateFile(initial);
  return () => {
    home.check();
    const current = fstatSync(fd, { bigint: true }), named = lstatSync(path, { bigint: true });
    privateFile(current); privateFile(named);
    if (!sameFileIdentity(initial, current) || !sameFileIdentity(current, named)) throw refused('file identity changed');
    return current;
  };
}
function snapshot(fd, check, maxBytes) {
  const before = check();
  if (before.size > BigInt(maxBytes)) throw refused('file exceeds storage byte limit');
  const bytes = Buffer.alloc(Number(before.size) + 1);
  let length = 0;
  while (length < bytes.length) {
    const n = readSync(fd, bytes, length, bytes.length - length, length);
    if (!n) break;
    length += n;
  }
  const after = check();
  if (length !== Number(before.size) || !sameSnapshot(before, after)) throw refused('file changed during snapshot');
  return { bytes: bytes.subarray(0, length), stat: after };
}
function writeAll(fd, bytes) {
  for (let offset = 0; offset < bytes.length;) {
    const n = writeSync(fd, bytes, offset, bytes.length - offset, null);
    if (!Number.isSafeInteger(n) || n <= 0 || n > bytes.length - offset) throw refused('incomplete file write');
    offset += n;
  }
}

function operationIndex(bytes, req) {
  const valid = verifyJournal(bytes);
  if (!valid.valid) throw refused(`journal chain is invalid at line${valid.first_bad_line}: ${valid.reason}`);
  const lines = bytes.toString('utf8').slice(0, -1).split('\n');
  const records = lines.map(line => JSON.parse(line));
  if (records[0].entry.payload.journal_key !== publicKeyBase64(req.key)) throw refused('signing key does not match journal genesis');
  const seen = new Set();
  let existing = null, prefixBytes = 0;
  for (let i = 0; i < records.length; i++) {
    const entry = records[i].entry;
    prefixBytes += Buffer.byteLength(lines[i]) + 1;
    if (!Object.hasOwn(entry.payload, META)) continue;
    const meta = entry.payload[META];
    const plain = Object.fromEntries(Object.entries(entry.payload).filter(([k]) => k !== META && !(i === 0 && k === 'journal_key')));
    const hash = digest(canonicalJson({ kind: entry.kind, payload: plain, ts: entry.ts, expected_head: entry.prev }));
    if (!meta || Object.keys(meta).sort().join() !== 'id,request_sha256,schema' ||
        meta.schema !== STORE_SCHEMA || typeof meta.id !== 'string' || !ID.test(meta.id) ||
        meta.request_sha256 !== hash || seen.has(meta.id)) throw refused('signed operation metadata is inconsistent or duplicated');
    seen.add(meta.id);
    if (meta.id === req.id) {
      if (hash !== req.requestHash) throw refused('operation ID was already used for a different request');
      existing = receipt(req, lines[i], i, bytes.subarray(0, prefixBytes));
    }
  }
  return { valid, lines, existing };
}
function receipt(req, line, seq, bytes) {
  return { operation_id: req.id, request_sha256: req.requestHash, entry_seq: seq,
    entry_head: digest(line), journal_prefix_sha256: digest(bytes), journal_prefix_bytes: bytes.length };
}

function persist(input, initialize) {
  const req = request(input, initialize), home = openHome(req.home);
  const lockPath = join(home.path, 'journal.append.lock'), path = join(home.path, 'journal.jsonl');
  const marker = Buffer.from(JSON.stringify({ schema: 'canli.trade-journal.pending.v1',
    operation_id: req.id, request_sha256: req.requestHash, expected_head: req.expected_head }) + '\n');
  let lockFd, journalFd, checkLock, lockReady = false, persistenceStarted = false, lockReleased = false;
  const release = () => {
    if (!snapshot(lockFd, checkLock, 4096).bytes.equals(marker)) throw refused('pending lock contents changed');
    home.check();
    unlinkSync(lockPath);
    lockReleased = true;
    fsyncSync(home.fd);
    home.check();
  };
  try {
    home.check();
    try { lockFd = openSync(lockPath, constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); }
    catch (error) {
      if (error.code === 'EEXIST') {
        const busy = refused('writer lock exists; never auto-break a pending or stale lock');
        busy.code = 'JOURNAL_STORE_BUSY';
        throw busy;
      }
      throw error;
    }
    checkLock = fileGuard(home, lockPath, lockFd);
    checkLock(); writeAll(lockFd, marker); fsyncSync(lockFd); fsyncSync(home.fd);
    if (!snapshot(lockFd, checkLock, 4096).bytes.equals(marker)) throw refused('pending lock contents changed');
    lockReady = true;
    home.check();
    let exists = true;
    try { journalFd = openSync(path, constants.O_RDWR | constants.O_APPEND | constants.O_NONBLOCK | constants.O_NOFOLLOW); }
    catch (error) { if (error.code !== 'ENOENT' || !initialize) throw error; exists = false; }
    let checkJournal, before, line, result, replayed = false;
    const payload = { ...req.payload, [META]: { schema: STORE_SCHEMA, id: req.id, request_sha256: req.requestHash } };
    if (exists) {
      checkJournal = fileGuard(home, path, journalFd);
      before = snapshot(journalFd, checkJournal, MAX_STORE_BYTES);
      const index = operationIndex(before.bytes, req);
      if (index.existing) { result = index.existing; replayed = true; }
      else {
        if (initialize) throw refused('initialization cannot overwrite an existing journal');
        if (index.valid.head !== req.expected_head) throw refused('expected journal head differs from the verified current head');
        line = nextLine({ last: index.lines.at(-1), kind: req.kind, payload, ts: req.ts, privateKey: req.key });
      }
    } else {
      line = genesisLine({ privateKey: req.key, ts: req.ts, payload });
      before = { bytes: Buffer.alloc(0) };
    }
    if (!replayed) {
      const addition = Buffer.from(line + '\n');
      if (addition.length > MAX_APPEND_BYTES || before.bytes.length + addition.length > MAX_STORE_BYTES) throw refused('append exceeds storage byte bounds');
      const target = Buffer.concat([before.bytes, addition]);
      const verified = verifyJournal(target);
      if (!verified.valid) throw refused(`new entry is invalid: ${verified.reason}`);
      if (!exists) {
        home.check();
        persistenceStarted = true; // Exclusive creation itself may persist even before entry bytes.
        journalFd = openSync(path, constants.O_RDWR | constants.O_APPEND | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
        checkJournal = fileGuard(home, path, journalFd);
        before.stat = checkJournal();
      }
      if (!sameSnapshot(before.stat, checkJournal())) throw refused('journal changed before append');
      if (!snapshot(lockFd, checkLock, 4096).bytes.equals(marker)) throw refused('pending lock contents changed');
      persistenceStarted = true;
      writeAll(journalFd, addition);
      fsyncSync(journalFd);
      const readback = snapshot(journalFd, checkJournal, MAX_STORE_BYTES);
      if (!readback.bytes.equals(target)) throw refused('journal readback differs from the persisted append');
      fsyncSync(home.fd);
      if (!sameSnapshot(readback.stat, checkJournal())) throw refused('journal changed after readback');
      result = receipt(req, line, verified.entries - 1, target);
    } else {
      // A retry acknowledges no new append and requests persistence again before success.
      persistenceStarted = true;
      fsyncSync(journalFd);
      const readback = snapshot(journalFd, checkJournal, MAX_STORE_BYTES);
      if (!readback.bytes.equals(before.bytes)) throw refused('journal changed during retry');
      fsyncSync(home.fd);
      if (!sameSnapshot(readback.stat, checkJournal())) throw refused('journal changed after retry readback');
    }
    // A failed close may already have released/reused the descriptor. Attempt it once.
    const closingJournal = journalFd; journalFd = undefined;
    closeSync(closingJournal);
    release();
    return { ...result, replayed };
  } catch (error) {
    if (lockFd !== undefined && !lockReleased) {
      if (!persistenceStarted && lockReady) {
        try { release(); } catch (releaseError) { throw uncertain(false, releaseError); }
      } else { throw uncertain(persistenceStarted, error); }
    }
    if (persistenceStarted) throw uncertain(true, error);
    throw error;
  } finally {
    // Never unlink a journal on failure or a replaced lock pathname.
    let closeFailed = false, closeError;
    for (const fd of [journalFd, lockFd, home.fd]) {
      if (fd !== undefined) {
        try { closeSync(fd); } catch (error) { closeFailed = true; closeError ??= error; }
      }
    }
    if (closeFailed) throw uncertain(persistenceStarted, closeError);
  }
}

export const initializeJournalStore = input => persist(input, true);
export const appendJournalStore = input => persist(input, false);
