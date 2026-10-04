#!/usr/bin/env node
// Packaged opt-in consumer: supplied synthetic data and local MCP calls only. No broker.
import { createHash, createPublicKey, verify } from 'node:crypto';
import { lstatSync, realpathSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import { COLUMNS, CHECK_ORDERS_JSON, checkOrdersInput } from './check-orders.mjs';
import { SIZE_POSITION_JSON, sizePositionInput } from './size-position.mjs';
import { JOURNAL_WRITABLE_JSON } from './journal-write.mjs';
import { canonicalJson } from './core/scripts/canonical-json.mjs';

export const PAPER_LIMITS = Object.freeze({ maxCalls: 11, deadlineMs: 30_000,
  shutdownReserveMs: 5_000, inputBytes: 32_768, replyBytes: 131_072, outputBytes: 196_608,
  planningBytes: 16_384, exportBytes: 32_768, requestsBytes: 16_384,
  controlsBytes: 49_152, outputReserveBytes: 16_384 });
const HASH = /^sha256:[0-9a-f]{64}$/;
const isHash = value => typeof value === 'string' && HASH.test(value);
const ID = /^[A-Za-z0-9._:-]{1,96}$/;
const SYMBOL = /^[A-Z0-9][A-Z0-9.:-]{0,31}$/;
const sha = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const finite = v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e15;
const positive = v => finite(v) && v > 0;
const own = (o, k) => Object.hasOwn(o, k);
const requireThat = (ok, code) => { if (!ok) throw new Stop(code); };
class Stop extends Error { constructor(code) { super(code); this.code = code; } }
function freeze(value) {
  if (value && typeof value === 'object') { for (const v of Object.values(value)) freeze(v); Object.freeze(value); }
  return value;
}

// These values are a fixture, not observed prices, an order recommendation or broker fills.
export const SYNTHETIC_SCENARIO = freeze({
  schema: 'canli.paper-journal.example.v1', purpose: 'synthetic-only', operation_prefix: 'synthetic-paper-v1',
  symbol: 'SYNTH',
  account: { schema: 'canli.trade-journal.account.v0', strategy_id: 'synthetic-paper-example',
    session_id: 'fixture-label-only', venue: 'local_sim', currency: 'USD', initial_cash: 10_000,
    initial_positions: [], frequency: 'IRREGULAR' },
  sizing: { side: 'buy', asset_class: 'us_equity', equity: 10_000, price: 100,
    vol: { daily: 0.02 }, budget: { method: 'fixed_fraction', fraction: 0.1 },
    caps: { max_position_frac: 0.2, max_gross: 1, max_net: 1, max_adv_frac: 0.01 },
    book: { gross_usd: 0, net_usd: 0, current_qty: 0 }, adv_usd: 1_000_000, lot_size: 1 },
  check: { asset_class: 'us_equity', market: { SYNTH: { price: 100, bid: 99.9, ask: 100.1,
    adv_usd: 1_000_000, daily_vol: 0.02, as_of: '2025-01-01T00:00:02.000Z' } },
    account: { equity: 10_000, positions: {}, notional_traded_today: 0 },
    fees: { commission_bps: 1, as_of: '2025-01-01T00:00:00.000Z' },
    limits: { max_position_frac: 0.2, max_gross: 1, max_net: 1, max_adv_frac: 0.01,
      max_order_notional: 2_000, allowed_symbols: ['SYNTH'], allowed_types: ['market'], require_market_state: true },
    market_state: { SYNTH: 'open' }, as_of: '2025-01-01T00:00:02.000Z' },
  fill: { qty: 10, price: 100.25, fee: 1, fill_id: 'synthetic-fill-v1' },
  mark: { marks: { SYNTH: 101 }, source: 'supplied synthetic fixture', observed_at: '2025-01-01T00:00:05.000Z' },
  ts: { initialize: '2025-01-01T00:00:00.000Z', decision: '2025-01-01T00:00:01.000Z',
    check: '2025-01-01T00:00:02.000Z', order: '2025-01-01T00:00:03.000Z',
    fill: '2025-01-01T00:00:04.000Z', mark: '2025-01-01T00:00:05.000Z' },
});

// Capture plain bounded JSON without calling accessors/toJSON or retaining mutable inputs.
function capture(value, maxBytes) {
  let bytes = 0, nodes = 0;
  const charge = n => { bytes += n; requireThat(bytes <= maxBytes, 'JSON_BOUND'); };
  const string = s => {
    requireThat(s.length <= maxBytes, 'JSON_BOUND');
    requireThat(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(s), 'JSON_STRING');
    charge(Buffer.byteLength(JSON.stringify(s))); return s;
  };
  function visit(v, depth) {
    requireThat(++nodes <= 4_096 && depth <= 16, 'JSON_BOUND');
    if (v === null || typeof v === 'boolean') { charge(v === null ? 4 : v ? 4 : 5); return v; }
    if (typeof v === 'string') return string(v);
    if (typeof v === 'number') { requireThat(finite(v), 'JSON_NUMBER'); charge(String(v).length); return v; }
    requireThat(v && typeof v === 'object', 'JSON_SHAPE');
    const array = Array.isArray(v), proto = Object.getPrototypeOf(v);
    requireThat(array ? proto === Array.prototype : proto === Object.prototype || proto === null, 'JSON_SHAPE');
    const descriptors = Object.getOwnPropertyDescriptors(v), keys = Reflect.ownKeys(descriptors);
    requireThat(keys.every(k => typeof k === 'string'), 'JSON_SHAPE');
    const names = keys.filter(k => !(array && k === 'length'));
    requireThat(!array || (v.length <= 512 && names.length === v.length && names.every((k, i) => k === String(i))), 'JSON_SHAPE');
    const out = array ? [] : Object.create(null); charge(2);
    for (let i = 0; i < names.length; i++) {
      const k = names[i], d = descriptors[k];
      requireThat(d.enumerable && own(d, 'value') && /^[\x00-\x7f]*$/.test(k), 'JSON_SHAPE');
      if (i) charge(1);
      if (!array) { string(k); charge(1); }
      Object.defineProperty(out, k, { value: visit(d.value, depth + 1), enumerable: true, writable: true, configurable: true });
    }
    return out;
  }
  return visit(value, 0);
}
const exactKeys = (v, keys) => object(v) && Object.keys(v).sort().join() === [...keys].sort().join();
function scenarioInput(value) {
  const s = capture(value, PAPER_LIMITS.inputBytes);
  requireThat(exactKeys(s, ['schema', 'purpose', 'operation_prefix', 'symbol', 'account', 'sizing', 'check', 'fill', 'mark', 'ts']) &&
    s.schema === SYNTHETIC_SCENARIO.schema && s.purpose === 'synthetic-only' && typeof s.operation_prefix === 'string' &&
    ID.test(s.operation_prefix) && typeof s.symbol === 'string' && SYMBOL.test(s.symbol), 'SCENARIO');
  requireThat(exactKeys(s.account, ['schema', 'strategy_id', 'session_id', 'venue', 'currency', 'initial_cash', 'initial_positions', 'frequency']) &&
    s.account.schema === 'canli.trade-journal.account.v0' && s.account.venue === 'local_sim' && s.account.currency === 'USD' &&
    s.account.frequency === 'IRREGULAR' && positive(s.account.initial_cash) && Array.isArray(s.account.initial_positions) && !s.account.initial_positions.length &&
    [s.account.strategy_id, s.account.session_id].every(v => typeof v === 'string' && v.length > 0 && v.length <= 128), 'ACCOUNT');
  requireThat(sizePositionInput.safeParse(s.sizing).success && s.sizing.side === 'buy' && s.sizing.asset_class === 'us_equity' &&
    s.sizing.equity === s.account.initial_cash && exactKeys(s.sizing.book, ['gross_usd', 'net_usd', 'current_qty']) &&
    Object.values(s.sizing.book).every(v => v === 0), 'SIZING_INPUT');
  requireThat(!own(s.check, 'orders') && s.check.asset_class === s.sizing.asset_class &&
    (s.check.execution === undefined || s.check.execution === 'immediate') && s.check.as_of === s.ts?.check &&
    s.check.account?.equity === s.account.initial_cash && exactKeys(s.check.account.positions, []) &&
    exactKeys(s.check.market, [s.symbol]) && s.check.market[s.symbol]?.price === s.sizing.price, 'CHECK_INPUT');
  // A schedule date is not a supplied commission amount. Explicit zero is valid.
  requireThat(!s.check.fees || ['commission_bps', 'per_share_usd'].some(k => own(s.check.fees, k)), 'MISSING_FEE_SCHEDULE');
  requireThat(checkOrdersInput.safeParse({ ...s.check, orders: [{ symbol: s.symbol, side: 'buy', qty: 1, type: 'market' }] }).success, 'CHECK_INPUT');
  requireThat(object(s.fill) && Object.keys(s.fill).every(k => ['qty', 'price', 'fee', 'fill_id'].includes(k)) && positive(s.fill.qty) &&
    positive(s.fill.price) && typeof s.fill.fill_id === 'string' && ID.test(s.fill.fill_id) &&
    (!own(s.fill, 'fee') || s.fill.fee === null || finite(s.fill.fee)), 'FILL_INPUT');
  requireThat(exactKeys(s.mark, ['marks', 'source', 'observed_at']) && exactKeys(s.mark.marks, [s.symbol]) && positive(s.mark.marks[s.symbol]) &&
    typeof s.mark.source === 'string' && s.mark.source.length > 0 && s.mark.source.length <= 256, 'MARK_INPUT');
  const kinds = ['initialize', 'decision', 'check', 'order', 'fill', 'mark'];
  requireThat(exactKeys(s.ts, kinds), 'TIMESTAMPS');
  for (let i = 0; i < kinds.length; i++) {
    const ts = s.ts[kinds[i]];
    requireThat(typeof ts === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(ts) &&
      !ts.startsWith('0000') && Number.isFinite(Date.parse(ts)) && new Date(ts).toISOString() === ts &&
      (!i || ts >= s.ts[kinds[i - 1]]), 'TIMESTAMPS');
  }
  requireThat(s.mark.observed_at === s.ts.mark && s.ts.mark > s.ts.initialize, 'TIMESTAMPS');
  return freeze(s);
}

function boundary({ signal, now = () => performance.now(), deadlineMs = PAPER_LIMITS.deadlineMs, maxCalls = PAPER_LIMITS.maxCalls } = {}) {
  requireThat(typeof now === 'function' && Number.isInteger(deadlineMs) && deadlineMs >= 0 && deadlineMs <= PAPER_LIMITS.deadlineMs &&
    Number.isInteger(maxCalls) && maxCalls >= 0 && maxCalls <= PAPER_LIMITS.maxCalls && (signal === undefined || signal instanceof AbortSignal), 'POLICY');
  const controller = new AbortController();
  let last = -Infinity, code = null, calls = 0, started;
  const abort = value => { if (!code) { code = value; controller.abort(); } };
  const external = () => abort('CANCELLED');
  signal?.addEventListener('abort', external, { once: true });
  if (signal?.aborted) external();
  const sample = () => {
    const t = now();
    requireThat(finite(t) && t >= 0 && t >= last, 'CLOCK');
    last = t;
    // A caller clock can itself deliver an abort; recheck after observing it.
    if (signal?.aborted) external();
    requireThat(!code, code);
    return t;
  };
  try { started = sample(); } catch (e) { signal?.removeEventListener('abort', external); throw e; }
  const timer = setTimeout(() => abort('DEADLINE'), deadlineMs);
  const guard = () => { requireThat(!code, code); const t = sample(); requireThat(t - started < deadlineMs, 'DEADLINE'); return t; };
  const bounded = task => {
    guard();
    return new Promise((resolve, reject) => {
      let settled = false;
      const clean = () => controller.signal.removeEventListener('abort', stop);
      const stop = () => { if (!settled) { settled = true; clean(); reject(new Stop(code || 'CANCELLED')); } };
      controller.signal.addEventListener('abort', stop, { once: true });
      Promise.resolve().then(() => { requireThat(!settled, code || 'CANCELLED'); guard(); requireThat(!settled, code || 'CANCELLED'); return task(); }).then(value => {
        if (settled) return;
        try { guard(); settled = true; clean(); resolve(value); }
        catch (e) { settled = true; clean(); reject(e); }
      }, error => { if (!settled) { settled = true; clean(); reject(error); } });
    });
  };
  return { guard, bounded, signal: controller.signal, get calls() { return calls; },
    remaining: () => Math.max(0, deadlineMs - (guard() - started)),
    dispatch: () => { guard(); requireThat(calls < maxCalls, 'CALL_LIMIT'); calls++; },
    dispose: () => { clearTimeout(timer); signal?.removeEventListener('abort', external); } };
}

function replyValue(reply) {
  const r = capture(reply, PAPER_LIMITS.replyBytes);
  requireThat(object(r) && (!own(r, 'isError') || typeof r.isError === 'boolean') && object(r.structuredContent) &&
    Array.isArray(r.content) && r.content.length === 1 && r.content[0]?.type === 'text' &&
    r.content[0].text === JSON.stringify(r.structuredContent), 'MALFORMED_REPLY');
  if (r.isError === true || own(r.structuredContent, 'error')) {
    const code = r.structuredContent.error?.code;
    const error = new Stop(['JOURNAL_STORE_UNCERTAIN', 'JOURNAL_STORE_BUSY', 'JOURNAL_STORE_REFUSED'].includes(code) ? code : 'TOOL_ERROR');
    if (code === 'JOURNAL_STORE_UNCERTAIN') error.persistenceAttempted =
      typeof r.structuredContent.error.journal_persistence_attempted === 'boolean' ? r.structuredContent.error.journal_persistence_attempted : null;
    throw error;
  }
  return r.structuredContent;
}
const requestHash = req => sha(canonicalJson({ kind: req.action === 'initialize' ? 'config' : req.kind,
  payload: req.payload, ts: req.ts, expected_head: req.expected_head ?? null }));
function writeReceipt(data, req, seq, previous) {
  requireThat(data.action === req.action && data.operation_id === req.operation_id && data.request_sha256 === requestHash(req) &&
    data.entry_seq === seq && isHash(data.entry_head) && isHash(data.journal_prefix_sha256) &&
    Number.isSafeInteger(data.journal_prefix_bytes) && data.journal_prefix_bytes > (previous?.journal_prefix_bytes ?? 0) &&
    data.journal_prefix_bytes <= 8 * 1024 * 1024 && typeof data.replayed === 'boolean', 'MALFORMED_RECEIPT');
  requireThat(data.replayed === false, 'EXISTING_OPERATION');
  requireThat(!previous || data.entry_head !== previous.entry_head, 'HEAD_MISMATCH');
  return Object.fromEntries(['operation_id', 'request_sha256', 'entry_seq', 'entry_head', 'journal_prefix_sha256', 'journal_prefix_bytes', 'replayed'].map(k => [k, data[k]]));
}
function exportReceipt(data, previous, scenario) {
  requireThat(data.action === 'export' && data.exists === true && data.inline === true, 'EXPORT_NOT_INLINE');
  const fields = ['record', 'journal_sha256', 'head', 'entry_range', 'metrics', 'series', 'journal_public_key', 'signature'];
  const bundle = Object.fromEntries(fields.map(k => [k, data[k]]));
  requireThat(fields.every(k => own(data, k)) && bundle.head === previous.entry_head && bundle.journal_sha256 === previous.journal_prefix_sha256 &&
    exactKeys(bundle.entry_range, ['from', 'to']) && bundle.entry_range.from === 0 && bundle.entry_range.to === previous.entry_seq, 'HEAD_MISMATCH');
  const record = bundle.record, signature = bundle.signature;
  requireThat(record?.schema === 'canli.paper-evidence.v0' && record.identity?.name === scenario.account.strategy_id &&
    record.capital?.kind === 'SIMULATED' && record.capital.venue === 'local_sim' && record.capital.execution === 'LOCAL_SIMULATED_FILLS' &&
    record.provenance?.signed === true && record.provenance.independently_verifiable === false && record.selection?.trials_counted === false &&
    record.returns?.sharpe_annualised === null && record.returns.sharpe_reportable === false &&
    Array.isArray(record.claim_maturity?.does_not_establish) && record.claim_maturity.does_not_establish.length > 0, 'MALFORMED_EXPORT');
  const bindings = record.provenance.source_bindings;
  requireThat(Array.isArray(bindings) && bindings.length === 2 && bindings[0].path === 'journal' && bindings[0].sha256 === bundle.journal_sha256 &&
    bindings[1].path === `journal/range/0/${previous.entry_seq}` && bindings[1].sha256 === bundle.head &&
    bundle.metrics?.fill_count === 1 && bundle.metrics.fees_usd === scenario.fill.fee, 'MALFORMED_EXPORT');
  // Companion observations are not covered by the record signature. Bind their
  // metadata to the signed record and this sole supplied mark, not just a rehash.
  const m = bundle.metrics, observations = bundle.series;
  requireThat(exactKeys(m, ['opening_equity', 'closing_equity', 'fees_usd', 'traded_notional_usd', 'fill_count',
    'cumulative_return', 'max_drawdown', 'turnover_annualised', 'undefined_returns', 'min_track_record']) &&
    m.opening_equity === scenario.account.initial_cash && finite(m.closing_equity) && positive(m.traded_notional_usd) &&
    m.turnover_annualised === null && m.min_track_record === null && m.undefined_returns === 0 &&
    Array.isArray(observations) && observations.length === 1 &&
    exactKeys(observations[0], ['seq', 'ts', 'equity', 'return', 'turnover']), 'MALFORMED_EXPORT');
  const observation = observations[0];
  requireThat(observation.seq === previous.entry_seq && observation.ts === scenario.mark.observed_at &&
    observation.equity === m.closing_equity && observation.return === m.cumulative_return &&
    observation.turnover === m.traded_notional_usd / m.opening_equity &&
    m.cumulative_return === record.returns.cumulative && m.cumulative_return === m.closing_equity / m.opening_equity - 1 &&
    m.max_drawdown === record.risk?.max_drawdown_realised &&
    m.max_drawdown === Math.max(0, 1 - m.closing_equity / Math.max(m.opening_equity, m.closing_equity)) &&
    record.period?.frequency === 'IRREGULAR' && record.period.observation_count === 1 &&
    record.period.first_observation === scenario.mark.observed_at.slice(0, 10) &&
    record.period.last_observation === scenario.mark.observed_at.slice(0, 10), 'MALFORMED_EXPORT');
  const suppliedNotional = scenario.fill.qty * scenario.fill.price;
  requireThat(positive(suppliedNotional) && Math.abs(m.traded_notional_usd - suppliedNotional) <=
    4 * Number.EPSILON * Math.max(1, Math.abs(suppliedNotional)), 'MALFORMED_EXPORT');
  const key = Buffer.from(bundle.journal_public_key ?? '', 'base64'), sig = Buffer.from(signature?.signature ?? '', 'base64');
  requireThat(key.length === 32 && key.toString('base64') === bundle.journal_public_key && sig.length === 64 &&
    sig.toString('base64') === signature.signature && signature.scheme === 'Ed25519' && signature.public_key === bundle.journal_public_key, 'MALFORMED_EXPORT');
  requireThat(verify(null, Buffer.from(canonicalJson(record)), createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), key]), type: 'spki', format: 'der' }), sig), 'EXPORT_SIGNATURE');
  const artifact = Buffer.from(JSON.stringify(bundle) + '\n');
  requireThat(data.artifact_bytes === artifact.length && data.artifact_sha256 === sha(artifact), 'EXPORT_DIGEST');
  return capture({ artifact_bytes: data.artifact_bytes, artifact_sha256: data.artifact_sha256, ...bundle }, PAPER_LIMITS.exportBytes);
}

function emptyReport() {
  return { schema: 'canli.paper-journal.example-receipt.v1', purpose: 'synthetic-only', status: 'stopped',
    call_count: 0, scenario_sha256: null, planning: null, requests: [], receipts: [], pending_request: null, export: null,
    pending_export: null, unknowns: ['provider/broker authenticity', 'full execution costs', 'trusted clock', 'independent review', 'forward performance'],
    stop: null };
}
function stopped(report, error) {
  report.status = 'stopped';
  if (error instanceof Stop && error.code === 'MISSING_FEE_SCHEDULE') report.unknowns.push('supplied fee schedule amounts');
  report.stop = { code: error instanceof Stop ? error.code : 'CALL_FAILED',
    ...(error instanceof Stop && error.code === 'JOURNAL_STORE_UNCERTAIN' ? { journal_persistence_attempted: error.persistenceAttempted ?? null } : {}),
    persistence: report.pending_request?.dispatched || report.pending_export?.dispatched ?
      'unknown; retain original request and files for manual review' : 'no unacknowledged write dispatched by this run' };
  // Do not echo thrown/tool error messages: they can contain local paths or signing material.
  return report;
}
async function workflow(callTool, value, write, control, report) {
  try {
    requireThat(typeof callTool === 'function' && typeof write === 'boolean', 'INTERFACE');
    const scenario = scenarioInput(value);
    report.scenario_sha256 = sha(canonicalJson(scenario)); control.guard();
    const call = async (name, args, pending = null) => {
      const request = freeze(capture({ name, arguments: args }, PAPER_LIMITS.inputBytes));
      const raw = await control.bounded(() => {
        // Admit retained output before a callback, leaving room for its bounded controls.
        capture(report, PAPER_LIMITS.outputBytes - PAPER_LIMITS.outputReserveBytes);
        const timeoutMs = Math.ceil(control.remaining());
        control.dispatch(); if (pending) pending.dispatched = true;
        return callTool(request, { signal: control.signal, timeoutMs }); });
      const result = replyValue(raw); control.guard(); return result;
    };
    const sizing = await call('size_position', scenario.sizing);
    requireThat(Array.isArray(sizing.orders) && sizing.orders.length === 1 && sizing.orders[0]?.side === 'buy' &&
      positive(sizing.orders[0].qty) && sizing.position_qty === sizing.orders[0].qty && isHash(sizing.limits_digest) &&
      (sizing.binding_constraint === null || ['position_cap', 'gross_cap', 'net_cap', 'adv_participation', 'budget', 'drawdown_flat'].includes(sizing.binding_constraint)), 'MALFORMED_SIZING');
    const order = freeze({ symbol: scenario.symbol, side: 'buy', qty: sizing.orders[0].qty, type: 'market' });
    const checked = await call('check_orders', { ...scenario.check, orders: [order] });
    requireThat(JSON.stringify(checked.columns) === JSON.stringify(COLUMNS) && checked.asset_class === scenario.check.asset_class &&
      checked.as_of === scenario.check.as_of && Array.isArray(checked.rows) &&
      checked.rows.length === 1 && Array.isArray(checked.rows[0]) && checked.rows[0].length === checked.columns.length && isHash(checked.limits_digest) &&
      Array.isArray(checked.checks_skipped) && Array.isArray(checked.not_modelled), 'MALFORMED_CHECK');
    const row = Object.fromEntries(checked.columns.map((k, i) => [k, checked.rows[0][i]]));
    requireThat(row.symbol === order.symbol && row.side === order.side && row.qty === order.qty && typeof row.accepted === 'boolean' &&
      Array.isArray(row.reasons) && ['clear', 'engaged'].includes(checked.kill_switch) && typeof checked.systemic_breach === 'boolean', 'MALFORMED_CHECK');
    report.planning = capture({ sizing: { position_qty: sizing.position_qty, binding_constraint: sizing.binding_constraint,
      limits_digest: sizing.limits_digest, orders: [order] }, check: { accepted: checked.accepted, rejected: checked.rejected, row,
      limits_digest: checked.limits_digest, kill_switch: checked.kill_switch, checks_skipped: checked.checks_skipped, not_modelled: checked.not_modelled } }, PAPER_LIMITS.planningBytes);
    if (row.accepted !== true || row.reasons.length || checked.kill_switch !== 'clear' || checked.systemic_breach ||
      checked.accepted !== 1 || checked.rejected !== 0 || checked.checks_skipped.length) {
      report.status = 'declined'; report.stop = { code: 'PRETRADE_DECLINED', persistence: 'no journal write dispatched' }; return report;
    }
    if (!finite(scenario.fill.fee)) {
      report.unknowns.push('supplied fill fee'); throw new Stop('MISSING_FEE');
    }
    requireThat(scenario.fill.qty <= order.qty, 'FILL_EXCEEDS_ORDER');
    if (!write) { report.status = 'writes_disabled'; return report; }
    const head = await call('journal', { action: 'head' });
    requireThat(head.action === 'head' && typeof head.exists === 'boolean', 'MALFORMED_HEAD');
    requireThat(head.exists === false, 'EXISTING_JOURNAL');
    const append = async (kind, payload) => {
      const previous = report.receipts.at(-1), action = kind === 'initialize' ? 'initialize' : 'append';
      const args = freeze(capture({ action, operation_id: `${scenario.operation_prefix}:${kind}`, ts: scenario.ts[kind], payload,
        ...(previous ? { kind, expected_head: previous.entry_head } : {}) }, PAPER_LIMITS.inputBytes));
      const pending = { request: args, request_sha256: requestHash(args), dispatched: false };
      capture([...report.requests, args], PAPER_LIMITS.requestsBytes);
      capture({ requests: [...report.requests, args], receipts: report.receipts, pending_request: pending,
        pending_export: report.pending_export }, PAPER_LIMITS.controlsBytes);
      report.requests.push(args); report.pending_request = pending;
      const data = await call('journal', args, pending);
      report.receipts.push(writeReceipt(data, args, report.receipts.length, previous)); report.pending_request = null;
    };
    await append('initialize', { account: scenario.account });
    await append('decision', { decision_id: `${scenario.operation_prefix}:decision`, purpose: 'synthetic-only',
      scenario_sha256: report.scenario_sha256, sizing_sha256: sha(canonicalJson(sizing)) });
    await append('check', { decision_seq: report.receipts.at(-1).entry_seq, limits_digest: checked.limits_digest,
      result_sha256: sha(canonicalJson(checked)), accepted: checked.accepted, rejected: checked.rejected });
    await append('order', { ...order, client_order_id: `${scenario.operation_prefix}:order`, venue: 'local_sim' });
    await append('fill', { ...scenario.fill, client_order_id: `${scenario.operation_prefix}:order`, symbol: scenario.symbol,
      side: order.side, venue: 'local_sim', filled_at: scenario.ts.fill });
    await append('mark', scenario.mark);
    const last = report.receipts.at(-1), verified = await call('journal', { action: 'verify' });
    requireThat(verified.action === 'verify' && verified.exists === true && verified.valid === true &&
      verified.entries === last.entry_seq + 1 && verified.head === last.entry_head && verified.reason === null, 'HEAD_MISMATCH');
    report.pending_export = { request: { action: 'export', sign: true }, dispatched: false };
    const exported = await call('journal', report.pending_export.request, report.pending_export);
    report.export = exportReceipt(exported, last, scenario); control.guard(); report.pending_export = null; report.status = 'completed';
    return report;
  } catch (error) { return stopped(report, error); }
  finally { report.call_count = control.calls; }
}
function finish(report) {
  try { return freeze(capture(report, PAPER_LIMITS.outputBytes)); }
  catch {
    // Optional bulky results can be explicitly refused; original bounded controls survive.
    const fallback = { ...report, planning: null, export: null, omitted_fields: ['planning', 'export'] };
    stopped(fallback, new Stop('OUTPUT_CAPACITY'));
    return freeze(capture(fallback, PAPER_LIMITS.outputBytes));
  }
}

/** Trusted injected interface: (immutable MCP request, {signal, timeoutMs}) => reply. */
export async function runPaperJournal({ callTool, scenario = SYNTHETIC_SCENARIO, write = false, ...policy } = {}) {
  const report = emptyReport(); let control;
  try { control = boundary(policy); await workflow(callTool, scenario, write, control, report); }
  catch (error) { stopped(report, error); }
  finally { control?.dispose(); }
  return finish(report);
}

const DEFINITIONS = Object.freeze({ size_position: SIZE_POSITION_JSON, check_orders: CHECK_ORDERS_JSON, journal: JOURNAL_WRITABLE_JSON });
export const PACKAGE_PAPER_LIMITS = Object.freeze({ workMs: 25_000, closureMs: 5_000, totalMs: 30_000,
  requestFrameBytes: 65_536, responseFrameBytes: 524_288, stderrBytes: 65_536,
  stdoutBytes: PAPER_LIMITS.outputBytes + 1, refusalBytes: 2_048 });

/** One observed absolute clock. Trusted injected clocks are not authenticated time. */
export function createPaperScope({ now = () => performance.now(), signal, totalMs = PACKAGE_PAPER_LIMITS.totalMs } = {}) {
  requireThat(typeof now === 'function' && Number.isInteger(totalMs) && totalMs > 5_000 && totalMs <= 30_000 &&
    (!signal || signal instanceof AbortSignal), 'POLICY');
  const controller = new AbortController(); let first = null, last = -1, started, closureStarted = null, calls = 0;
  const fail = error => {
    if (!first) first = error instanceof Stop ? error : new Stop('CALL_FAILED');
    if (!controller.signal.aborted) controller.abort();
    return first;
  };
  const cancel = () => fail(new Stop('CANCELLED'));
  const sample = () => {
    let t;
    try { t = now(); } catch { throw fail(new Stop('CLOCK')); }
    if (!finite(t) || t < 0 || t < last) throw fail(new Stop('CLOCK'));
    last = t; if (signal?.aborted) cancel(); return t;
  };
  signal?.addEventListener('abort', cancel, { once: true });
  try { started = sample(); } catch (error) { signal?.removeEventListener('abort', cancel); throw error; }
  const workMs = totalMs - PACKAGE_PAPER_LIMITS.closureMs;
  let timer = setTimeout(() => fail(new Stop('DEADLINE')), workMs);
  const guard = () => {
    const t = sample();
    if (t - started >= workMs) fail(new Stop('DEADLINE'));
    if (closureStarted !== null) fail(new Stop('STDIO_CLOSED'));
    if (first) throw first; return t;
  };
  const beginClose = () => {
    if (closureStarted === null) { closureStarted = last; clearTimeout(timer); try { closureStarted = sample(); } catch { /* sticky CLOCK; teardown still runs */ } }
    return closureStarted;
  };
  const closureRemaining = () => {
    const t = sample(), remaining = Math.min(PACKAGE_PAPER_LIMITS.closureMs - (t - beginClose()), totalMs - (t - started));
    if (remaining <= 0) throw fail(new Stop('STDIO_CLOSE_UNCERTAIN'));
    return remaining;
  };
  const finalObservation = () => {
    const t = sample();
    if (closureStarted === null || closureStarted - started > workMs || t - closureStarted > PACKAGE_PAPER_LIMITS.closureMs || t - started > totalMs)
      fail(new Stop('DEADLINE'));
    return { observed_work_ms: closureStarted === null ? null : closureStarted - started,
      observed_closure_ms: closureStarted === null ? null : t - closureStarted, observed_total_ms: t - started,
      work_limit_ms: workMs, closure_limit_ms: PACKAGE_PAPER_LIMITS.closureMs, total_limit_ms: totalMs,
      clock_scope: 'cooperative_observed_not_preemption' };
  };
  const bounded = (task, closing = false) => new Promise((resolve, reject) => {
    let settled = false, timeout;
    const clean = () => { clearTimeout(timeout); controller.signal.removeEventListener('abort', stop); };
    const finishBound = (fn, value) => { if (!settled) { settled = true; clean(); fn(value); } };
    const stop = () => finishBound(reject, first || fail(new Stop('CANCELLED')));
    const observe = () => closing ? closureRemaining() : workMs - (guard() - started);
    try {
      const remaining = observe();
      if (!closing) controller.signal.addEventListener('abort', stop, { once: true });
      timeout = setTimeout(() => finishBound(reject, fail(new Stop(closing ? 'STDIO_CLOSE_UNCERTAIN' : 'DEADLINE'))), Math.max(1, remaining));
      Promise.resolve().then(() => {
        requireThat(!settled, first?.code || 'DEADLINE'); observe();
        const value = task();
        // Own the returned task before a synchronous post-callback observation can refuse.
        Promise.resolve(value).then(value => {
          if (settled) return;
          try { observe(); finishBound(resolve, value); } catch (error) { finishBound(reject, fail(error)); }
        }, error => finishBound(reject, fail(error))).catch(error => finishBound(reject, fail(error)));
        observe();
      }).catch(error => finishBound(reject, fail(error)));
    } catch (error) { finishBound(reject, fail(error)); }
  });
  return { guard, bounded, fail, beginClose, closureRemaining, finalObservation, signal: controller.signal,
    get calls() { return calls; }, get failure() { return first; }, get started() { return started; },
    remaining: () => workMs - (guard() - started),
    dispatch: () => { guard(); requireThat(calls < PAPER_LIMITS.maxCalls, 'CALL_LIMIT'); calls++; },
    dispose: () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); } };
}

/** Locked legacy frame and Promise/drain contract, used by production and native fixtures. */
export function createPaperNativeWriter(stdin, scope, { state = { closed: false, exited: false }, serialize = message => JSON.stringify(message) + '\n' } = {}) {
  requireThat(stdin && typeof stdin.write === 'function' && typeof stdin.once === 'function' && typeof stdin.removeListener === 'function', 'STDIO_WRITER');
  requireThat(['closed', 'exited'].every(key => typeof Object.getOwnPropertyDescriptor(state, key)?.value === 'boolean'), 'STDIO_WRITER');
  const nativeWrite = stdin.write.bind(stdin);
  return { send(message) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const clean = () => { stdin.removeListener('error', error); stdin.removeListener('drain', drain); scope.signal.removeEventListener('abort', abort); };
      const done = (fn, value) => { if (!settled) { settled = true; clean(); fn(value); } };
      const error = () => done(reject, scope.fail(new Stop('STDIO_WRITE')));
      const abort = () => done(reject, scope.failure || scope.fail(new Stop('CANCELLED')));
      const drain = () => { try { scope.guard(); requireThat(!state.closed && !state.exited, 'STDIO_CLOSED'); done(resolve); } catch (e) { done(reject, scope.fail(e)); } };
      try {
        scope.guard(); requireThat(!state.closed && !state.exited, 'STDIO_CLOSED');
        stdin.once('error', error); scope.signal.addEventListener('abort', abort, { once: true });
        const frame = serialize(message);
        requireThat(typeof frame === 'string' && frame.endsWith('\n') && Buffer.byteLength(frame, 'utf8') <= PACKAGE_PAPER_LIMITS.requestFrameBytes, 'STDIO_FRAME_BOUND');
        // No serializer, await or callback between this observation and the captured native effect.
        scope.guard(); requireThat(!state.closed && !state.exited && !settled, 'STDIO_CLOSED');
        const written = nativeWrite(frame);
        if (written) drain(); else if (!settled) stdin.once('drain', drain);
      } catch (e) { done(reject, scope.fail(e)); }
    });
  } };
}

const SAFE_ENV_KEYS = Object.freeze(process.platform === 'win32' ? ['APPDATA', 'COMSPEC', 'HOMEDRIVE', 'HOMEPATH', 'LOCALAPPDATA',
  'PATH', 'PATHEXT', 'PROCESSOR_ARCHITECTURE', 'PROGRAMDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)', 'PROGRAMW6432', 'SYSTEMDRIVE',
  'SYSTEMROOT', 'TEMP', 'USERNAME', 'USERPROFILE', 'WINDIR'] : ['HOME', 'LOGNAME', 'PATH', 'SHELL', 'TERM', 'USER']);
export function paperServerEnvironment(home, write, supplied = process.env) {
  const env = {};
  for (const key of SAFE_ENV_KEYS) if (typeof supplied[key] === 'string' && !supplied[key].startsWith('()')) env[key] = supplied[key];
  return { ...env, CANLI_HOME: home, CANLI_EXEC_TOOLSETS: 'all', CANLI_EXEC_JOURNAL_WRITE: write ? '1' : '0' };
}

/** Trusted sdkModules/nativeFs injection exercises this SAME adapter without another child. */
export async function runPaperJournalStdio({ home, write = false, scenario = SYNTHETIC_SCENARIO, signal,
  deadlineMs = PACKAGE_PAPER_LIMITS.totalMs, now, scope: providedScope, sdkModules,
  nativeFs = { lstatSync, realpathSync } } = {}) {
  const scope = providedScope ?? createPaperScope({ signal, totalMs: deadlineMs, ...(now ? { now } : {}) });
  const report = emptyReport(); let client, transport, child, birth = false, exited = false, childClosed = false, closed = false;
  const writerState = { closed: false, exited: false };
  let pid = null, stderrBytes = 0, terminal = Promise.resolve(), closePromise, clientClosing, transportClosing;
  const memo = fn => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; });
    Promise.resolve().then(fn).then(resolve, reject); return promise; };
  const close = () => {
    if (!closePromise) {
      closed = true; writerState.closed = true;
      closePromise = memo(async () => {
        let failed = false;
        try { if (client) await client.close(); } catch { failed = true; scope.fail(new Stop('STDIO_CLOSE_UNCERTAIN')); }
        try { if (transport) await transport.close(); } catch { failed = true; scope.fail(new Stop('STDIO_CLOSE_UNCERTAIN')); }
        if (child) await terminal;
        requireThat(!failed && (!child || (birth && exited && childClosed)), 'STDIO_CLOSE_UNCERTAIN');
      });
      scope.beginClose();
    }
    return closePromise;
  };
  try {
    scope.guard(); requireThat(typeof home === 'string' && home.length <= 4_096 && isAbsolute(home) && typeof write === 'boolean' && typeof process.getuid === 'function', 'HOME');
    const stat = nativeFs.lstatSync(home); scope.guard();
    requireThat(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === process.getuid() && (stat.mode & 0o7777) === 0o700, 'HOME');
    const fixedHome = nativeFs.realpathSync(home); scope.guard(); const captured = scenarioInput(scenario); scope.guard();
    const modules = sdkModules ?? await scope.bounded(() => Promise.all([import('@modelcontextprotocol/client'), import('@modelcontextprotocol/client/stdio')])
      .then(([a, b]) => ({ Client: a.Client, StdioClientTransport: b.StdioClientTransport })));
    scope.guard(); requireThat(typeof modules.Client === 'function' && typeof modules.StdioClientTransport === 'function', 'STDIO_INTERFACE');
    client = new modules.Client({ name: 'canli-synthetic-paper-example', version: '1' },
      { capabilities: {}, versionNegotiation: { mode: 'legacy' }, inputRequired: { autoFulfill: false } });
    transport = new modules.StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('./server.mjs', import.meta.url))],
      env: paperServerEnvironment(fixedHome, write), stderr: 'pipe', maxBufferSize: PACKAGE_PAPER_LIMITS.responseFrameBytes });
    const originalTransportClose = transport.close.bind(transport);
    transport.close = () => {
      if (!transportClosing) { closed = true; writerState.closed = true; transportClosing = memo(originalTransportClose); scope.beginClose(); }
      return transportClosing;
    };
    const originalClientClose = client.close.bind(client);
    client.close = () => { if (!clientClosing) { closed = true; writerState.closed = true; clientClosing = memo(originalClientClose); scope.beginClose(); } return clientClosing; };
    const originalStart = transport.start.bind(transport); let writer;
    transport.start = () => {
      scope.guard(); requireThat(!closed, 'STDIO_CLOSED'); const pending = originalStart();
      // Admission can throw before returning pending; the observer never replaces its SDK outcome.
      Promise.resolve(pending).then(() => undefined, () => undefined).catch(() => undefined);
      // Exact locked2.1.0 object is retained before its close handler clears _process.
      child = transport._process; requireThat(child && child.stdin && typeof child.once === 'function', 'STDIO_CHILD_UNKNOWN');
      const born = () => { birth = Number.isSafeInteger(child.pid) && child.pid > 0; pid = birth ? child.pid : null; };
      if (child.pid) born(); child.once('spawn', born);
      terminal = new Promise(resolve => {
        const complete = () => { if (exited && childClosed) resolve(); };
        child.once('exit', () => { exited = true; writerState.exited = true; if (!closed) scope.fail(new Stop('STDIO_EARLY_EXIT')); complete(); }); child.once('close', () => { childClosed = true; complete(); });
        child.once('error', () => scope.fail(new Stop('STDIO_CHILD_UNKNOWN')));
      });
      writer = createPaperNativeWriter(child.stdin, scope, { state: writerState });
      return pending;
    };
    transport.send = message => { scope.guard(); requireThat(writer && transport._process === child, 'STDIO_CHILD_UNKNOWN'); return writer.send(message); };
    requireThat(transport.stderr && typeof transport.stderr.on === 'function', 'STDIO_INTERFACE');
    transport.stderr.on('data', bytes => {
      stderrBytes += Buffer.isBuffer(bytes) ? bytes.length : Buffer.byteLength(bytes);
      if (stderrBytes > PACKAGE_PAPER_LIMITS.stderrBytes) scope.fail(new Stop('STDERR_BOUND'));
    });
    transport.stderr.resume(); client.onerror = () => { if (!closed) scope.fail(new Stop('STDIO_ERROR')); };
    await scope.bounded(() => client.connect(transport, { signal: scope.signal, timeout: Math.ceil(scope.remaining()) }));
    requireThat(birth, 'STDIO_CHILD_UNKNOWN');
    await workflow((request, options) => client.callTool(request, { signal: options.signal, timeout: options.timeoutMs,
      toolDefinition: { name: request.name, description: 'Local repository example', inputSchema: DEFINITIONS[request.name] } }), captured, write, scope, report);
    if (report.status === 'stopped' && report.stop?.code) {
      const originalFailure = new Stop(report.stop.code);
      if (originalFailure.code === 'JOURNAL_STORE_UNCERTAIN') originalFailure.persistenceAttempted = report.stop.journal_persistence_attempted;
      scope.fail(originalFailure);
    }
  } catch (error) { stopped(report, scope.fail(error)); }
  finally {
    try { const closing = close(); await scope.bounded(() => closing, true); } catch (error) { stopped(report, scope.fail(error)); }
    report.call_count = scope.calls;
    let timing = null; try { timing = scope.finalObservation(); } catch (error) { scope.fail(error); }
    report.transport = { scope: sdkModules ? 'injected_no_child' : child ? 'same_owned_child_exit_and_close' : 'no_child_started',
      owned_pid: sdkModules ? null : pid, observed_exit: child ? exited : null, observed_close: child ? childClosed : null,
      absence_scope: sdkModules ? null : child && birth && exited && childClosed ? 'admitted_same_child_terminal_only' : null,
      stderr_bytes: stderrBytes, timing };
    if (scope.failure) stopped(report, scope.failure);
  }
  try {
    let result = finish(report);
    try { scope.finalObservation(); } catch (error) { scope.fail(error); }
    if (scope.failure && result.stop?.code !== scope.failure.code) {
      stopped(report, scope.failure); result = finish(report);
      // A repeated failed clock still retains the full stopped report and its first failure.
      try { scope.finalObservation(); } catch (error) { scope.fail(error); }
    }
    return result;
  } finally { if (!providedScope) scope.dispose(); }
}

export function paperJournalEntry(argvPath, modulePath = fileURLToPath(import.meta.url), fs = { realpathSync }) {
  try { return typeof argvPath === 'string' && fs.realpathSync(argvPath) === fs.realpathSync(modulePath); } catch { return false; }
}

/** Terminal emission uses the same absolute scope, including serialization. No CLI injection flags. */
export async function paperJournalCommand(argv, { emit,
  now, sdkModules, nativeFs, signal, totalMs = PACKAGE_PAPER_LIMITS.totalMs } = {}) {
  const controller = new AbortController(), cancel = () => controller.abort();
  requireThat(!signal || signal instanceof AbortSignal, 'POLICY');
  const activeSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  const scope = createPaperScope({ signal: activeSignal, totalMs, ...(now ? { now } : {}) });
  const capturedEmit = emit ?? process.stdout.write.bind(process.stdout);
  const observeTerminal = () => { try { scope.finalObservation(); } catch (error) { scope.fail(error); } };
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel); let result;
  try {
    scope.guard(); requireThat(typeof capturedEmit === 'function', 'STDIO_WRITER'); const args = capture(argv ?? process.argv.slice(2), 8_192); scope.guard();
    requireThat(Array.isArray(args) && args[0] === '--home' && typeof args[1] === 'string' &&
      (args.length === 2 || (args.length === 3 && args[2] === '--write')), 'USAGE');
    result = await runPaperJournalStdio({ home: args[1], write: args[2] === '--write', scope, sdkModules, nativeFs });
  } catch (error) {
    const report = emptyReport(); stopped(report, scope.fail(error)); scope.beginClose(); result = finish(report);
  }
  try {
    let frame = JSON.stringify(result) + '\n';
    requireThat(Buffer.byteLength(frame, 'utf8') <= PACKAGE_PAPER_LIMITS.stdoutBytes, 'OUTPUT_CAPACITY');
    observeTerminal();
    if (scope.failure && result.stop?.code !== scope.failure.code) {
      const report = capture(result, PAPER_LIMITS.outputBytes); stopped(report, scope.failure);
      result = finish(report); frame = JSON.stringify(result) + '\n';
      requireThat(Buffer.byteLength(frame, 'utf8') <= PACKAGE_PAPER_LIMITS.stdoutBytes, 'OUTPUT_CAPACITY'); observeTerminal();
    }
    capturedEmit(frame);
    return result;
  } finally { scope.dispose(); process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); }
}
export const paperJournalMain = paperJournalCommand;
if (paperJournalEntry(process.argv[1])) {
  try { const result = await paperJournalCommand(); if (!['completed', 'writes_disabled'].includes(result.status)) process.exitCode = 1; }
  catch { process.stderr.write('Paper journal refused\n'); process.exitCode = 1; }
}
