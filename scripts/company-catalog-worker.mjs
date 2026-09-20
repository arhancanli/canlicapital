// One request/response at a time: the bulk importer never holds the whole corpus in memory.
import { createInterface } from 'node:readline';
import { companyReference, CompanyReferenceError } from './lib/company-reference.mjs';
for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
  const input = JSON.parse(line);
  const diagnostics = {};
  let result;
  try {
    const record = companyReference(input.raw, { expectedCik: input.cik, fetchedAt: input.fetchedAt ?? input.observedBy, diagnostics });
    if (!input.fetchedAt) {
      record.fetched_at = null;
      record.observed_no_later_than = input.observedBy;
      record.capture_time_basis = 'COLLECTION_RECEIPT_UPPER_BOUND';
    }
    result = { status: 'ELIGIBLE_FOR_REVIEW', record, diagnostics };
  } catch (error) {
    if (!(error instanceof CompanyReferenceError) && !(error instanceof SyntaxError)) throw error;
    result = { status: 'EXCLUDED', reason: error.code ?? 'INVALID_JSON', detail: error.message, diagnostics };
  }
  process.stdout.write(JSON.stringify(result) + '\n');
}
