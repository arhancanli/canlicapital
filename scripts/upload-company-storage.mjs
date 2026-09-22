import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { catalogHash } from '../api/_lib/company-catalog.js';

const HASH = /^[a-f0-9]{64}$/;
const KEY = /^(catalog|delivery)\/objects\/([a-f0-9]{64})\.json(?:\.gz)?$/;
const LIMIT = 16 * 1024 * 1024;

function responseFailureMetadata(response) {
  const raw = response.headers.get('retry-after') ?? '';
  let retryAfter;
  if (/^\d{1,10}$/.test(raw)) retryAfter = { seconds: Number(raw) };
  else if (/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(raw) && Number.isFinite(Date.parse(raw))) {
    retryAfter = { at: new Date(raw).toISOString() };
  }
  return { httpStatus: response.status, ...(retryAfter ? { retryAfter } : {}) };
}

function localBytes(file) {
  const raw = readFileSync(file.local_path);
  if (raw.length !== file.bytes || catalogHash(raw) !== file.sha256) throw new Error('Local object binding mismatch');
  return raw;
}

export function validateStoragePlan(raw, expectedHash) {
  if (!HASH.test(expectedHash) || catalogHash(raw) !== expectedHash) throw new Error('Storage plan hash mismatch');
  const plan = JSON.parse(raw);
  if (plan.schema !== 'canli.company-storage-plan.v1' || plan.publication_approved !== false ||
      !HASH.test(plan.release_hash) || !Array.isArray(plan.files) || !plan.files.length ||
      plan.files.length !== plan.objects) throw new Error('Invalid storage plan');
  const keys = new Set();
  for (const file of plan.files) {
    const match = KEY.exec(file.key);
    if (!match || match[2] !== file.sha256 || keys.has(file.key) ||
        !Number.isSafeInteger(file.bytes) || file.bytes < 1 || file.bytes > LIMIT ||
        file.content_type !== (file.key.endsWith('.gz') ? 'application/gzip' : 'application/json') ||
        file.content_encoding !== undefined || file.cache_control !== 'public, max-age=31536000, immutable') {
      throw new Error('Invalid storage object');
    }
    keys.add(file.key);
    localBytes(file); // Complete preflight before any network writes.
  }
  if (plan.bytes !== plan.files.reduce((n, f) => n + f.bytes, 0) ||
      !keys.has(`delivery/objects/${plan.release_hash}.json`)) throw new Error('Incomplete storage plan');
  return plan;
}

// A 429 is the service asking for a pause, not a verdict on the object. With
// rateLimitWaits > 0 the adapter holds every worker for the Retry-After period
// (or an escalating fallback), then repeats the same request; the number of
// holds per run is bounded and each is recorded. 401 and 403 are never retried.
const RATE_LIMIT_MAX_DELAY_MS = 300_000;
export function rateLimitDelay(error, wait, now = Date.now()) {
  const seconds = error?.retryAfter?.seconds;
  if (Number.isInteger(seconds)) return Math.min(Math.max(seconds, 1) * 1000, RATE_LIMIT_MAX_DELAY_MS);
  const at = error?.retryAfter?.at ? Date.parse(error.retryAfter.at) - now : NaN;
  if (Number.isFinite(at)) return Math.min(Math.max(at, 1000), RATE_LIMIT_MAX_DELAY_MS);
  return Math.min(15_000 * wait, 120_000);
}

export function createSupabaseStorage({ projectUrl, bucket, serviceKey, fetcher = fetch,
  readAttempts = 1, retryBudget = 10, minIntervalMs = 0, rateLimitWaits = 0, now = () => Date.now(),
  pause = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  if (!Number.isInteger(readAttempts) || readAttempts < 1 || readAttempts > 3 ||
      !Number.isInteger(retryBudget) || retryBudget < 0 || retryBudget > 200) throw new Error('Invalid bounded read retry policy');
  if (!Number.isInteger(minIntervalMs) || minIntervalMs < 0 || minIntervalMs > 10000) throw new Error('Invalid request pacing');
  if (!Number.isInteger(rateLimitWaits) || rateLimitWaits < 0 || rateLimitWaits > 100) throw new Error('Invalid bounded rate-limit wait policy');
  let retries = 0, waits = 0;
  let gate = Promise.resolve(), lastStarted = -Infinity, holdUntil = -Infinity;
  const base = new URL(projectUrl);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash ||
      base.pathname !== '/' || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(bucket) || !serviceKey) throw new Error('Invalid storage destination');
  const publicBase = `${base.origin}/storage/v1/object/public/${bucket}/`;
  const auth = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  function transportFailure(error) {
      const code = ['TimeoutError', 'AbortError'].includes(error?.name) ? error.name : (error?.cause?.code ?? error?.code ?? error?.name);
      const safe = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET', 'TimeoutError', 'AbortError'].includes(code) ? code : 'UNKNOWN_TRANSPORT';
      // Preserve machine error categories, never upstream messages, URLs or stacks.
      const labels = [error?.name, error?.cause?.name, error?.cause?.code, error?.code]
        .filter(value => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value));
      const failure = new Error(`Storage request failed (${safe}; ${[...new Set(labels)].join(',')})`);
      failure.retryableRead = safe !== 'UNKNOWN_TRANSPORT';
      return failure;
  }
  async function request(url, options) {
    // Serialize permission to start, not the response body. Spacing is based on
    // actual starts so delayed timers cannot release a burst of reserved slots.
    const start = gate.then(async () => {
      // A rate-limit hold delays every worker's next start, not only the one that saw the 429.
      const wait = Math.max(0, lastStarted + minIntervalMs - now(), holdUntil - now());
      if (wait) await pause(wait);
      lastStarted = now();
    });
    gate = start.catch(() => {});
    await start;
    try { return await fetcher(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(60_000) }); }
    catch (error) { throw transportFailure(error); }
  }
  // Returns true after holding for a rate-limited request that may be repeated; false when
  // the run's wait budget is spent (the caller then fails with the original error).
  async function waitForRateLimit(error, onWait = () => {}) {
    if (!error?.rateLimited || waits >= rateLimitWaits) return false;
    waits++;
    const delay = rateLimitDelay(error, waits, now());
    holdUntil = Math.max(holdUntil, now() + delay);
    onWait({ delay_ms: delay, ...(error.retryAfter ? { retry_after: error.retryAfter } : {}), global_wait_number: waits });
    await pause(delay);
    return true;
  }
  const adapter = {
    destination: publicBase,
    readRetryPolicy: { attempts: readAttempts, budget: retryBudget },
    requestPacingPolicy: { minimum_interval_ms: minIntervalMs },
    rateLimitPolicy: { waits: rateLimitWaits, max_delay_ms: RATE_LIMIT_MAX_DELAY_MS },
    waitForRateLimit,
    async readOnce(file) {
      if (!KEY.test(file.key)) throw new Error('Invalid object key');
      const response = await request(publicBase + file.key, { headers: { 'Accept-Encoding': 'identity' } });
      if (!response.ok) {
        if ([401, 403, 429].includes(response.status)) {
          await response.body?.cancel().catch(() => {});
          throw Object.assign(new Error(`Storage read rejected (${response.status})`), responseFailureMetadata(response), response.status === 429 ? { rateLimited: true } : {});
        }
        // Supabase returns HTTP400 with an embedded404 for absent objects. Never
        // treat authorization, throttling or arbitrary HTTP400 as absence.
        const parts = []; let size = 0;
        try { for await (const chunk of response.body) {
          size += chunk.length;
          if (size > 4096) throw new Error('Storage error response exceeds bound');
          parts.push(chunk);
        } } catch (error) {
          if (!error?.cause?.code && !['AbortError', 'TimeoutError'].includes(error?.name)) throw error;
          const failure = transportFailure(error);
          failure.retryableRead = [502, 503, 504].includes(response.status);
          throw failure;
        }
        const body = Buffer.concat(parts).toString('utf8');
        let error; try { error = JSON.parse(body); } catch { /* fail closed */ }
        if ((response.status === 400 || response.status === 404) &&
            String(error?.statusCode) === '404' && error?.error === 'not_found') return null;
        const failure = new Error(`Storage read rejected (${response.status})`);
        Object.assign(failure, responseFailureMetadata(response));
        failure.retryableRead = [502, 503, 504].includes(response.status);
        throw failure;
      }
      const encoding = response.headers.get('content-encoding');
      const cache = (response.headers.get('cache-control') ?? '').toLowerCase().split(',').map(s => s.trim());
      if ((encoding && encoding !== 'identity') ||
          response.headers.get('content-type')?.split(';')[0].trim() !== file.content_type ||
          !['public', 'max-age=31536000', 'immutable'].every(value => cache.includes(value)) ||
          cache.some(value => ['private', 'no-store', 'no-cache'].includes(value))) {
        await response.body?.cancel().catch(() => {}); throw new Error('Storage representation changed');
      }
      const chunks = []; let length = 0;
      for await (const chunk of response.body) {
        length += chunk.length;
        if (length > file.bytes) { throw new Error('Remote object exceeds expected size'); }
        chunks.push(chunk);
      }
      const raw = Buffer.concat(chunks);
      if (length !== file.bytes || catalogHash(raw) !== file.sha256) throw new Error('Remote object binding mismatch');
      return raw;
    },
    async create(file, raw) {
      if (!KEY.test(file.key)) throw new Error('Invalid object key');
      let response;
      try { response = await request(`${base.origin}/storage/v1/object/${bucket}/${file.key}`, {
        method: 'POST', headers: { ...auth, 'Content-Type': file.content_type,
          'Cache-Control': file.cache_control, 'x-upsert': 'false' }, body: raw,
      }); } catch (error) { error.ambiguousWrite = true; throw error; }
      await response.body?.cancel().catch(() => {});
      if (!response.ok) {
        const error = new Error(`Storage create rejected (${response.status}); no overwrite`);
        Object.assign(error, responseFailureMetadata(response));
        error.ambiguousWrite = [409, 502, 503, 504].includes(response.status);
        error.rateLimited = response.status === 429; // nothing was written; the same create may be repeated after the hold
        throw error;
      }
    },
  };
  return { ...adapter, async read(file, { onRetry = () => {}, onRateLimit = () => {} } = {}) {
    let attempt = 1;
    while (true) {
      try { return await adapter.readOnce(file); }
      catch (error) {
        if (error.retryableRead === undefined && (error?.cause?.code || ['TimeoutError', 'AbortError'].includes(error?.name))) error = transportFailure(error);
        // A rate-limit hold repeats the same attempt; it does not spend the transport retry budget.
        if (error.rateLimited && await waitForRateLimit(error, event => onRateLimit({ attempt, ...event }))) continue;
        if (!error.retryableRead || attempt >= readAttempts || retries >= retryBudget) throw error;
        retries++;
        onRetry({ attempt, error: error.message, delay_ms: attempt * 1000, global_retry_number: retries });
        await pause(attempt * 1000);
        attempt++;
      }
    }
  } };
}

export async function uploadCompanyStorage({ planBytes, planHash, storage, record = () => {}, concurrency = 1,
  writeAttempts = 1, writeRetryBudget = 10, pause = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) throw new Error('Concurrency must be between 1 and 4');
  if (!Number.isInteger(writeAttempts) || writeAttempts < 1 || writeAttempts > 2) throw new Error('Write attempts must be 1 or 2');
  if (!Number.isInteger(writeRetryBudget) || writeRetryBudget < 0 || writeRetryBudget > 50) throw new Error('Invalid bounded write retry budget');
  const plan = validateStoragePlan(planBytes, planHash);
  const receipt = { schema: 'canli.company-storage-transfer.v1', plan_sha256: planHash,
    code_sha256: catalogHash(readFileSync(new URL(import.meta.url))),
    release_hash: plan.release_hash, destination: storage.destination, publication_approved: false,
    retry_policy: { read: storage.readRetryPolicy, write: { attempts: writeAttempts, budget: writeRetryBudget }, concurrency,
      request_pacing: storage.requestPacingPolicy, ...(storage.rateLimitPolicy ? { rate_limit: storage.rateLimitPolicy } : {}) },
    complete: false, files: [], failures: [], read_retries: [], write_recovery: [], rate_limit_waits: [], scope: 'Runtime transfer only; not capture backup, editorial admission or production activation.' };
  record(receipt);
  const read = file => storage.read(file, {
    onRetry: event => { receipt.read_retries.push({ key: file.key, ...event }); record(receipt); },
    onRateLimit: event => { receipt.rate_limit_waits.push({ key: file.key, method: 'GET', ...event }); record(receipt); },
  });
  let cursor = 0, failure, writeRetries = 0;
  async function createVerified(file, raw) {
    let attempt = 1;
    while (true) {
      try { await storage.create(file, raw); }
      catch (error) {
        // A rate-limited create wrote nothing: hold, then repeat the same attempt without a reconciliation read.
        if (error.rateLimited && storage.waitForRateLimit && await storage.waitForRateLimit(error, event => { receipt.rate_limit_waits.push({ key: file.key, method: 'POST', attempt, ...event }); record(receipt); })) continue;
        if (!error.ambiguousWrite) throw error;
        const event = { key: file.key, attempt, error: error.message, reconciliation: 'pending' };
        receipt.write_recovery.push(event); record(receipt);
        const found = await read(file);
        event.reconciliation = found === null ? 'absent' : 'verified_existing'; record(receipt);
        if (found !== null) return 'verified_after_create_error';
        if (attempt >= writeAttempts || writeRetries >= writeRetryBudget) throw error;
        event.retry_number = ++writeRetries; record(receipt);
        await pause(1000);
        attempt++;
        continue; // Explicitly enabled, bounded create-only attempt after verified absence.
      }
      if (await read(file) === null) throw new Error('Created object is not publicly retrievable');
      return 'created_and_verified';
    }
  }
  async function worker() {
    while (!failure && cursor < plan.files.length) {
      const file = plan.files[cursor++];
      try {
        const raw = localBytes(file);
        let action = 'verified_existing';
        if (await read(file) === null) {
          action = await createVerified(file, raw);
        }
        receipt.files.push({ key: file.key, sha256: file.sha256, bytes: file.bytes, action });
        record(receipt);
      } catch (error) {
        failure ??= error;
        receipt.failures.push({ key: file.key, error: error.message,
          ...(Number.isInteger(error.httpStatus) ? { http_status: error.httpStatus } : {}),
          ...(error.retryAfter ? { retry_after: error.retryAfter } : {}) });
        record(receipt);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  if (failure) throw failure; // All in-flight requests settled; retain partial receipt.
  receipt.complete = true;
  record(receipt);
  return receipt;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [planPath, planHash, projectUrl, bucket, output, concurrency = '1', readAttempts = '1', writeAttempts = '1', readRetryBudget = '10', writeRetryBudget = '10', minIntervalMs = '0', rateLimitWaits = '0'] = process.argv.slice(2);
  if (!output) throw new Error('Usage: node scripts/upload-company-storage.mjs PLAN SHA256 PROJECT_URL BUCKET NEW_RECEIPT [CONCURRENCY_1_TO_4] [READ_ATTEMPTS_1_TO_3] [WRITE_ATTEMPTS_1_TO_2] [READ_RETRY_BUDGET_0_TO_200] [WRITE_RETRY_BUDGET_0_TO_50] [MIN_REQUEST_INTERVAL_MS_0_TO_10000] [RATE_LIMIT_WAITS_0_TO_100]');
  if (existsSync(output) || existsSync(output + '.pending')) throw new Error('Receipt already exists; preserve it and use a new path');
  const storage = createSupabaseStorage({ projectUrl, bucket, serviceKey: process.env.COMPANY_STORAGE_SERVICE_KEY, readAttempts: Number(readAttempts), retryBudget: Number(readRetryBudget), minIntervalMs: Number(minIntervalMs), rateLimitWaits: Number(rateLimitWaits) });
  await uploadCompanyStorage({ planBytes: readFileSync(planPath), planHash, storage, concurrency: Number(concurrency), writeAttempts: Number(writeAttempts), writeRetryBudget: Number(writeRetryBudget), record: receipt => {
    writeFileSync(output + '.pending', JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
    renameSync(output + '.pending', output);
  } });
  console.log('Runtime objects uploaded and remotely verified; production activation unchanged.');
}
