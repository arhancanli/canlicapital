import { resolve } from 'node:path';
import { computeLocally } from './local.mjs';
import { MAX_JOURNAL_BYTES, readBoundedFile, readRecordFile } from './local/js/journal-files.js';
import { journalBindings } from './local/js/trade-journal-export-core.js';

export function validateLocalJournalEvidence(input) {
  let record = input.record, signature = input.signature, bundle;
  if (input.record_file) {
    const file = readRecordFile(resolve(input.record_file));
    if (file && typeof file === 'object' && Object.hasOwn(file, 'record')) {
      record = file.record;
      // A {record,signature} envelope is also accepted. Full exports advertise their
      // financial companion fields and those must be recomputed, not ignored.
      if (Object.keys(file).some(k => !['record', 'signature'].includes(k))) bundle = file;
      if (signature !== undefined && file.signature !== undefined) throw new Error('send a detached signature inline or in the record file, not both');
      signature ??= file.signature;
    } else record = file;
    if (!record || typeof record !== 'object' || Array.isArray(record) || record.schema !== 'canli.paper-evidence.v0') throw new Error('record file must contain a canli.paper-evidence.v0 record or export bundle');
  }
  const result = computeLocally('validate_paper_evidence', { record });
  if (result.failed) return result;
  const data = result.envelope.data;
  const unchecked = { checked: false, all_match: null, reason: 'No source journal checked; conformance covers structure and field relationships only.' };
  // Conformance first prevents malformed record members from reaching the financial verifier.
  const bindings = input.journal_file && data.valid
    ? journalBindings(record, readBoundedFile(resolve(input.journal_file), { maxBytes: MAX_JOURNAL_BYTES }), signature, bundle)
    : input.journal_file ? { checked: false, all_match: false, reason: 'Source verification requires a conforming record.' } : unchecked;
  data.bindings = bindings;
  data.conformance_valid = data.valid;
  if (input.journal_file) {
    data.valid = data.valid && bindings.all_match === true;
    data.plain_reading = data.valid ? 'The record conforms and its reconstructable claims match the supplied signed journal and selected range. Key possession is self-attestation; broker authenticity, completeness and trusted time are not established.' : 'Conformance or source-bound recomputation failed; this record has not passed journal verification.';
  } else data.plain_reading += ' No source journal or record signature was checked.';
  return result;
}
