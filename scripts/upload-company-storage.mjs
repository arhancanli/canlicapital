import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { catalogHash } from '../api/_lib/company-catalog.js';

const HASH = /^[a-f0-9]{64}$/;
const KEY = /^(catalog|delivery)\/objects\/([a-f0-9]{64})\.json(?:\.gz)?$/;
const LIMIT = 16 * 1024 * 1024;

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

export function createSupabaseStorage({ projectUrl, bucket, serviceKey, fetcher = fetch,
  readAttempts = 1, retryBudget = 10, pause = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  if (!Number.isInteger(readAttempts) || readAttempts < 1 || readAttempts > 3 ||
      !Number.isInteger(retryBudget) || retryBudget < 0 || retryBudget > 200) throw new Error('Invalid bounded read retry policy');
  let retries = 0;
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
    try { return await fetcher(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(60_000) }); }
    catch (error) { throw transportFailure(error); }
  }
  const adapter = {
    destination: publicBase,
    readRetryPolicy: { attempts: readAttempts, budget: retryBudget },
    async readOnce(file) {
      if (!KEY.test(file.key)) throw new Error('Invalid object key');
      const response = await request(publicBase + file.key, { headers: { 'Accept-Encoding': 'identity' } });
      if (!response.ok) {
        if ([401, 403, 429].includes(response.status)) {
          await response.body?.cancel().catch(() => {});
          throw new Error(`Storage read rejected (${response.status})`);
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
        error.ambiguousWrite = [409, 502, 503, 504].includes(response.status);
        throw error;
      }
    },
  };
  return { ...adapter, async read(file, { onRetry = () => {} } = {}) {
    for (let attempt = 1; ; attempt++) {
      try { return await adapter.readOnce(file); }
      catch (error) {
        if (error.retryableRead === undefined && (error?.cause?.code || ['TimeoutError', 'AbortError'].includes(error?.name))) error = transportFailure(error);
        if (!error.retryableRead || attempt >= readAttempts || retries >= retryBudget) throw error;
        retries++;
        onRetry({ attempt, error: error.message, delay_ms: attempt * 1000, global_retry_number: retries });
        await pause(attempt * 1000);
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
    retry_policy: { read: storage.readRetryPolicy, write: { attempts: writeAttempts, budget: writeRetryBudget }, concurrency },
    complete: false, files: [], failures: [], read_retries: [], write_recovery: [], scope: 'Runtime transfer only; not capture backup, editorial admission or production activation.' };
  record(receipt);
  const read = file => storage.read(file, { onRetry: event => {
    receipt.read_retries.push({ key: file.key, ...event }); record(receipt);
  } });
  let cursor = 0, failure, writeRetries = 0;
  async function createVerified(file, raw) {
    for (let attempt = 1; ; attempt++) {
      try { await storage.create(file, raw); }
      catch (error) {
        if (!error.ambiguousWrite) throw error;
        const event = { key: file.key, attempt, error: error.message, reconciliation: 'pending' };
        receipt.write_recovery.push(event); record(receipt);
        const found = await read(file);
        event.reconciliation = found === null ? 'absent' : 'verified_existing'; record(receipt);
        if (found !== null) return 'verified_after_create_error';
        if (attempt >= writeAttempts || writeRetries >= writeRetryBudget) throw error;
        event.retry_number = ++writeRetries; record(receipt);
        await pause(1000);
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
        receipt.failures.push({ key: file.key, error: error.message });
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
  const [planPath, planHash, projectUrl, bucket, output, concurrency = '1', readAttempts = '1', writeAttempts = '1', readRetryBudget = '10', writeRetryBudget = '10'] = process.argv.slice(2);
  if (!output) throw new Error('Usage: node scripts/upload-company-storage.mjs PLAN SHA256 PROJECT_URL BUCKET NEW_RECEIPT [CONCURRENCY_1_TO_4] [READ_ATTEMPTS_1_TO_3] [WRITE_ATTEMPTS_1_TO_2] [READ_RETRY_BUDGET_0_TO_200] [WRITE_RETRY_BUDGET_0_TO_50]');
  if (existsSync(output) || existsSync(output + '.pending')) throw new Error('Receipt already exists; preserve it and use a new path');
  const storage = createSupabaseStorage({ projectUrl, bucket, serviceKey: process.env.COMPANY_STORAGE_SERVICE_KEY, readAttempts: Number(readAttempts), retryBudget: Number(readRetryBudget) });
  await uploadCompanyStorage({ planBytes: readFileSync(planPath), planHash, storage, concurrency: Number(concurrency), writeAttempts: Number(writeAttempts), writeRetryBudget: Number(writeRetryBudget), record: receipt => {
    writeFileSync(output + '.pending', JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
    renameSync(output + '.pending', output);
  } });
  console.log('Runtime objects uploaded and remotely verified; production activation unchanged.');
}
