import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { gunzipSync } from 'node:zlib';
import { refreshCandidates } from './refresh-company-candidates.mjs';
import { reviewCandidates } from './review-company-candidates.mjs';
import { stageCompanyDelivery } from './stage-company-delivery.mjs';
import { captureNotFound } from './capture-company-not-found.mjs';

async function fixture(t) {
  const root = mkdtempSync(resolve(tmpdir(), 'canli-delivery-integrity-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const input = resolve(root, 'captures'), output = resolve(root, 'delivery');
  const record = JSON.parse(readFileSync('public/company-data/0000029534.json'));
  const raw = gunzipSync(readFileSync('public' + record.source_snapshot));
  await refreshCandidates({ ciks: [record.cik], output: input,
    fetcher: async () => new Response(raw), now: () => '2026-09-19T12:00:00Z', pause: async () => {} });
  writeFileSync(resolve(input, 'ciks.json'), JSON.stringify([record.cik]));
  const review = reviewCandidates(input);
  assert.equal(review.errors.length, 0);
  assert.equal(review.candidates.length, 1);
  stageCompanyDelivery(input, output);
  const prior = readFileSync(resolve(output, 'delivery.json'));
  const reportPath = resolve(root, 'external-review.json');
  writeFileSync(reportPath, JSON.stringify(review));
  const progress = JSON.parse(readFileSync(resolve(input, 'refresh.json')));
  return { input, output, prior, reportPath, progress, cik: record.cik };
}

test('stale external review cannot override a current HTTP failure or replace prior delivery', async t => {
  const { input, output, prior, reportPath, progress, cik } = await fixture(t);
  progress.results[0] = { cik, status: 'http_error', http_status: 500 };
  writeFileSync(resolve(input, 'refresh.json'), JSON.stringify(progress));
  assert.throws(() => stageCompanyDelivery(input, output, undefined, {
    allowReviewedExclusions: true, reviewReportPath: reportPath,
  }), /Complete reproduced capture cohort required/);
  assert.deepEqual(readFileSync(resolve(output, 'delivery.json')), prior);
});

test('external review cannot omit a failed company from the current capture queue', async t => {
  const { input, output, prior, reportPath, progress, cik } = await fixture(t);
  const failedCik = '0000000002';
  writeFileSync(resolve(input, 'ciks.json'), JSON.stringify([cik, failedCik]));
  progress.requested = 2;
  progress.results.push({ cik: failedCik, status: 'http_error', http_status: 500 });
  writeFileSync(resolve(input, 'refresh.json'), JSON.stringify(progress));
  const current = reviewCandidates(input);
  assert.equal(current.complete, true);
  assert.equal(current.errors.length, 0);
  assert.equal(current.candidates.length, 1);
  assert.equal(current.exclusions.length, 1);
  assert.equal(current.exclusions[0].cik, failedCik);
  assert.throws(() => stageCompanyDelivery(input, output, undefined, {
    allowReviewedExclusions: true, reviewReportPath: reportPath,
  }), /Complete reproduced capture cohort required/);
  assert.deepEqual(readFileSync(resolve(output, 'delivery.json')), prior);
});

test('staging retains confirmed 404 evidence and rejects a corrupted response without replacing the manifest', async t => {
  const { input, output, prior, progress, cik } = await fixture(t);
  const missingCik = '0000000002';
  writeFileSync(resolve(input, 'ciks.json'), JSON.stringify([cik, missingCik]));
  progress.requested = 2;
  progress.results.push({ cik: missingCik, status: 'http_error', http_status: 404 });
  writeFileSync(resolve(input, 'refresh.json'), JSON.stringify(progress));
  assert.throws(() => stageCompanyDelivery(input, output, undefined, {
    allowReviewedExclusions: true,
  }), /Complete reproduced capture cohort required/);
  assert.deepEqual(readFileSync(resolve(output, 'delivery.json')), prior);
  const receipts = await captureNotFound(input, {
    now: () => '2026-09-19T13:00:00Z', pause: async () => {},
    fetcher: async () => new Response('Not found', { status: 404 }),
  });
  const staged = stageCompanyDelivery(input, output, undefined, { allowReviewedExclusions: true });
  assert.equal(staged.files.length, 1);
  assert.equal(staged.publication_approved, false);
  assert.equal(staged.capture_review.exclusions.length, 1);
  const exclusion = staged.capture_review.exclusions[0];
  assert.equal(exclusion.status, 'source_not_found');
  assert.equal(exclusion.original_status, 'http_error');
  assert.equal(exclusion.response_verified, true);
  assert.equal(exclusion.receipt.receipt_sha256, receipts[0].receipt_sha256);
  const beforeCorruption = readFileSync(resolve(output, 'delivery.json'));
  writeFileSync(resolve(input, receipts[0].body_sha256 + '.http-body'), 'tampered');
  assert.throws(() => stageCompanyDelivery(input, output, undefined, {
    allowReviewedExclusions: true,
  }), /Complete reproduced capture cohort required/);
  assert.deepEqual(readFileSync(resolve(output, 'delivery.json')), beforeCorruption);
});
