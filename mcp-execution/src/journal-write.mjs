// Explicit local adapter for the delivered private store. No key generation, broker or network.
import { closeSync, constants, fstatSync, lstatSync, openSync, realpathSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { z } from 'zod';

import { parseInput } from './check-orders.mjs';
import { readBoundedFile } from './core/js/journal-files.js';
import { KINDS } from './core/js/trade-journal-core.js';
import { JOURNAL_JSON, JOURNAL_LIMITS, JOURNAL_OUTPUT, journalInput } from './journal.mjs';
import { appendJournalStore, initializeJournalStore } from './journal-store.mjs';

const operationId = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/);
const timestamp = z.string().length(24).regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
// The store captures and bounds plain JSON without invoking payload getters/toJSON.
const payload = z.custom(value => value !== null && typeof value === 'object' && !Array.isArray(value));
const initializeInput = z.object({ action: z.literal('initialize'), operation_id: operationId, ts: timestamp, payload }).strict();
const appendInput = initializeInput.extend({ action: z.literal('append'),
  expected_head: z.string().regex(/^sha256:[0-9a-f]{64}$/), kind: z.enum(KINDS) }).strict();
export const journalWriteInput = z.discriminatedUnion('action', [initializeInput, appendInput]);
export const journalWritableInput = z.union([journalInput, journalWriteInput]);

const shared = { operation_id: { type: 'string', pattern: '^[A-Za-z0-9._:-]{1,128}$' },
  ts: { type: 'string', minLength: 24, maxLength: 24, pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$', description: 'Supplied UTC time; not a trusted clock' },
  payload: { type: 'object', description: 'Bounded plain JSON for this journal kind' } };
export const JOURNAL_WRITABLE_JSON = Object.freeze({ type: 'object', oneOf: [JOURNAL_JSON,
  { type: 'object', properties: { action: { const: 'initialize' }, ...shared },
    required: ['action', 'operation_id', 'ts', 'payload'], additionalProperties: false },
  { type: 'object', properties: { action: { const: 'append' }, ...shared,
    kind: { type: 'string', enum: KINDS },
    expected_head: { type: 'string', pattern: '^sha256:[0-9a-f]{64}$' } },
    required: ['action', 'operation_id', 'ts', 'payload', 'kind', 'expected_head'], additionalProperties: false },
] });
export const JOURNAL_WRITE_DESCRIPTION = 'head/verify/export; initialize/append local signed entries using journal.key. Exact retries keep their original head. No orders. Signing is self-attestation.';
const hash = z.string().regex(/^sha256:[0-9a-f]{64}$/);
export const JOURNAL_WRITABLE_OUTPUT = JOURNAL_OUTPUT.extend({
  operation_id: z.string().optional(), request_sha256: hash.optional(), entry_head: hash.optional(),
  entry_seq: z.number().int().nonnegative().optional(), journal_prefix_sha256: hash.optional(),
  journal_prefix_bytes: z.number().int().nonnegative().optional(), replayed: z.boolean().optional(),
  error: z.object({ code: z.enum(['JOURNAL_STORE_BUSY', 'JOURNAL_STORE_REFUSED', 'JOURNAL_STORE_UNCERTAIN']),
    message: z.string(), journal_persistence_attempted: z.boolean().optional() }).strict().optional(),
}).describe('Read/export results or local operation/entry/prefix receipts. Typed errors have no success receipt; persistence and signatures retain self-attestation limits.');
export const JOURNAL_WRITE_INSTRUCTIONS = 'Journal writes are explicitly enabled locally. initialize/append use only CANLI_HOME/journal.key; never send keys in tool arguments. Keep the operation ID, timestamp, payload and original expected_head unchanged for an exact retry. A pending lock or uncertain write needs manual review; never auto-resubmit or remove it.';

export function configuredJournalWrites(value) {
  if (value === undefined || value === '' || value === '0') return false;
  if (value === '1') return true;
  throw new Error('CANLI_EXEC_JOURNAL_WRITE must be 0 or 1; writes are disabled by default');
}
export const isJournalWrite = action => action === 'initialize' || action === 'append';
const sameDirectory = (a, b) => ['dev', 'ino', 'uid', 'gid', 'mode'].every(k => a[k] === b[k]);
function ownedHome(stat) {
  if (!stat.isDirectory() || stat.uid !== BigInt(process.getuid()) || (stat.mode & 0o7777n) !== 0o700n) {
    throw new Error('journal: writes require an existing owned mode0700 home');
  }
}
function uncertain(cause) {
  const error = new Error('journal: persistence is uncertain; retain original request, journal and any pending lock for manual review', { cause });
  error.code = 'JOURNAL_STORE_UNCERTAIN';
  error.journal_persistence_attempted = true;
  return error;
}

function signingContext(home) {
  if (typeof home !== 'string' || !isAbsolute(home) || !process.getuid ||
      !Number.isInteger(constants.O_NOFOLLOW) || !Number.isInteger(constants.O_DIRECTORY)) {
    throw new Error('journal: writes require an absolute local POSIX home');
  }
  let fd, key;
  try {
    fd = openSync(home, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    const initial = fstatSync(fd, { bigint: true }), path = realpathSync(home);
    ownedHome(initial);
    const check = () => {
      for (const stat of [lstatSync(home, { bigint: true }), lstatSync(path, { bigint: true })]) {
        ownedHome(stat);
        if (!sameDirectory(initial, stat)) throw new Error('journal: home identity changed during write');
      }
    };
    check();
    key = readBoundedFile(join(path, 'journal.key'), { maxBytes: 16 * 1024, privateFile: true });
    check();
    return { key, check };
  } catch (error) {
    key?.fill(0);
    throw error;
  } finally {
    // Close once before invoking the writer. A failed close cannot acknowledge a write.
    if (fd !== undefined) {
      try { closeSync(fd); } catch (error) { key?.fill(0); throw error; }
    }
  }
}

export function runJournalWrite(args, { home, enabled = false } = {}) {
  if (enabled !== true) throw new Error('journal: action initialize/append is disabled; enable CANLI_EXEC_JOURNAL_WRITE=1 locally');
  const input = parseInput(journalWriteInput, args, 'journal');
  const context = signingContext(home);
  try {
    context.check();
    const options = { home, privateKey: context.key, operationId: input.operation_id, ts: input.ts, payload: input.payload };
    const receipt = input.action === 'initialize' ? initializeJournalStore(options) :
      appendJournalStore({ ...options, expectedHead: input.expected_head, kind: input.kind });
    try { context.check(); } catch (error) { throw uncertain(error); }
    return { action: input.action, ...receipt, limits: JOURNAL_LIMITS };
  } finally { context.key.fill(0); }
}
