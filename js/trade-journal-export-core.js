// Accounting contract: standards/trade-journal/EXPORT.md. Signature verification precedes
// accounting. Decimal integers preserve authored quantities and cash; ratios use IEEE-754.
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { canonicalJson } from '../scripts/canonical-json.mjs';
import { minimumTrackRecordLength } from './dsr-core.js';
import { perPeriodMoments } from './moments-core.js';
import { publicKeyBase64, verifyJournal } from './trade-journal-core.js';

export const ACCOUNT_PROFILE = 'canli.trade-journal.account.v0';
export const MAX_EXPORT_ENTRIES = 100000;
const SYMBOL = /^[A-Z0-9][A-Z0-9.:-]{0,39}$/;
const FREQ = ['DAILY', 'HOURLY', 'WEEKLY', 'MONTHLY', 'IRREGULAR'];
const VENUES = ['local_sim', 'alpaca_paper'];
const ZERO = Object.freeze([0n, 0]);
const sha = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const own = (o, k) => Object.hasOwn(o, k);
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v, name, max = 256) => {
  if (typeof v !== 'string' || !v.trim() || v.length > max) throw new RangeError(`${name}: nonempty bounded text required`);
  return v;
};
const fail = (seq, reason) => { throw new RangeError(`journal export at seq ${seq}: ${reason}`); };
function decimal(v, name, positive = false) {
  if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) >= 1e15 || (positive && !(v > 0))) throw new RangeError(`${name}: finite ${positive ? 'positive ' : ''}number below 1e15 required`);
  let s = String(v).toLowerCase(), exp = 0;
  if (s.includes('e')) { const parts = s.split('e'); s = parts[0]; exp = Number(parts[1]); }
  const fraction = s.includes('.') ? s.length - s.indexOf('.') - 1 : 0;
  let n = BigInt(s.replace('.', '')), scale = fraction - exp;
  if (scale < 0) { n *= 10n ** BigInt(-scale); scale = 0; }
  return norm([n, scale]);
}
function norm([n, s]) { if (!n) return ZERO; while (s && n % 10n === 0n) { n /= 10n; s--; } return [n, s]; }
function add(a, b) { const s = Math.max(a[1], b[1]); return norm([a[0] * 10n ** BigInt(s - a[1]) + b[0] * 10n ** BigInt(s - b[1]), s]); }
const neg = a => [-a[0], a[1]];
const sub = (a, b) => add(a, neg(b));
const mul = (a, b) => norm([a[0] * b[0], a[1] + b[1]]);
const cmp = (a, b) => { const d = sub(a, b)[0]; return d > 0n ? 1 : d < 0n ? -1 : 0; };
const abs = a => [a[0] < 0n ? -a[0] : a[0], a[1]];
function number(a, name) { const n = Number(`${a[0]}e-${a[1]}`); if (!Number.isFinite(n) || (a[0] !== 0n && n === 0)) throw new RangeError(`${name}: derived amount is outside finite numeric range`); return n; }
function ratio(a, b, name) { const r = number(a, name) / number(b, name); if (!Number.isFinite(r)) throw new RangeError(`${name}: derived ratio is nonfinite`); return r; }
function timestamp(v, name) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) || v.startsWith('0000') || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString() !== v) throw new RangeError(`${name}: real UTC timestamp with milliseconds required`);
  return v;
}
function bucket(ts, frequency) {
  const days = Date.parse(ts) / 86400000;
  if (frequency === 'DAILY') return Math.floor(days);
  if (frequency === 'HOURLY') return Math.floor(Date.parse(ts) / 3600000);
  if (frequency === 'WEEKLY') return Math.floor((days + 3) / 7);
  if (frequency === 'MONTHLY') return Number(ts.slice(0, 4)) * 12 + Number(ts.slice(5, 7));
  return null;
}
function profile(p) {
  if (!object(p) || p.schema !== ACCOUNT_PROFILE) throw new RangeError(`journal export requires genesis payload.account with ${ACCOUNT_PROFILE}; integrity alone does not establish opening capital`);
  const fields = ['schema', 'strategy_id', 'session_id', 'identity_kind', 'venue', 'currency', 'initial_cash', 'initial_positions', 'frequency', 'periods_per_year'];
  if (Object.keys(p).some(k => !fields.includes(k))) throw new RangeError('journal account has unsupported members');
  text(p.strategy_id, 'account.strategy_id');
  if (p.session_id !== undefined) text(p.session_id, 'account.session_id');
  if (!['CANDIDATE', 'SLEEVE', 'BOOK'].includes(p.identity_kind ?? 'CANDIDATE')) throw new RangeError('account.identity_kind is unsupported');
  if (![...VENUES, 'mixed'].includes(p.venue) || p.currency !== 'USD') throw new RangeError('account must declare a paper/simulated venue and USD currency');
  const frequency = p.frequency ?? 'IRREGULAR';
  if (!FREQ.includes(frequency)) throw new RangeError('account.frequency is unsupported');
  if (frequency !== 'IRREGULAR' && !(typeof p.periods_per_year === 'number' && Number.isFinite(p.periods_per_year) && p.periods_per_year > 0 && p.periods_per_year <= 1000000)) throw new RangeError('regular account frequency requires finite positive periods_per_year <= 1000000');
  if (p.periods_per_year !== undefined && !(typeof p.periods_per_year === 'number' && Number.isFinite(p.periods_per_year) && p.periods_per_year > 0 && p.periods_per_year <= 1000000)) throw new RangeError('account.periods_per_year is invalid');
  if (!Array.isArray(p.initial_positions) || p.initial_positions.length > 10000) throw new RangeError('account.initial_positions must explicitly be a bounded array');
  let equity = decimal(p.initial_cash, 'account.initial_cash');
  const holdings = new Map();
  for (const pos of p.initial_positions) {
    if (!object(pos) || Object.keys(pos).sort().join() !== 'price,qty,symbol' || !SYMBOL.test(pos.symbol) || holdings.has(pos.symbol)) throw new RangeError('opening positions require unique symbols and only symbol/qty/price');
    const qty = decimal(pos.qty, 'opening qty'), price = decimal(pos.price, 'opening price', true);
    holdings.set(pos.symbol, qty); equity = add(equity, mul(qty, price));
  }
  if (equity[0] <= 0n) throw new RangeError('opening marked equity must be positive');
  return { ...p, frequency, holdings, equity, cash: decimal(p.initial_cash, 'account.initial_cash') };
}
function supported(p, seq) {
  const unsupported = new Set(['cashflow', 'cashflows', 'externalcashflow', 'externalcashflows', 'corporateaction', 'corporateactions', 'dividend', 'dividends', 'split', 'splits', 'funding', 'interest', 'borrow', 'financing']);
  for (const k of Object.keys(p)) if (unsupported.has(k.toLowerCase().replaceAll('_', ''))) fail(seq, `unsupported financial event ${k}`);
}
function equal(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-12;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => equal(v, b[i]));
  if (object(a) || object(b)) return object(a) && object(b) && Object.keys(a).sort().join() === Object.keys(b).sort().join() && Object.keys(a).every(k => equal(a[k], b[k]));
  return a === b;
}

/** Verify all bytes, replay the selected prefix, and export one explicitly scoped account. */
export function exportJournal(data, options = {}) {
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data);
  let count = 0;
  for (const byte of bytes) if (byte === 10 && ++count > MAX_EXPORT_ENTRIES) throw new RangeError(`journal export is bounded to ${MAX_EXPORT_ENTRIES} entries`);
  const integrity = verifyJournal(bytes);
  if (!integrity.valid) throw new RangeError(`journal export refuses invalid journal at seq ${integrity.first_bad_line}: ${integrity.reason}`);
  const lines = bytes.toString('utf8').trimEnd().split('\n');
  const entries = lines.map(line => JSON.parse(line).entry);
  const from = options.from ?? 0, to = options.to ?? entries.length - 1;
  if (![from, to].every(Number.isInteger) || from < 0 || to >= entries.length || from >= to) throw new RangeError('journal range must be 0 <= from < to < entry count');
  if (from !== 0 && entries[from].kind !== 'mark') fail(from, 'from must be genesis or a mark opening the window');
  supported(entries[0].payload, 0);
  const account = profile(entries[0].payload.account);
  if (options.strategy_id !== undefined && options.strategy_id !== account.strategy_id) throw new RangeError('strategy_id does not match the signed account');
  if (options.session_id !== undefined && options.session_id !== account.session_id) throw new RangeError('session_id does not match the signed account');
  let publishUrl;
  if (options.publish_url !== undefined) {
    const url = new URL(options.publish_url);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.href.length > 2000) throw new RangeError('publish_url must be HTTPS without credentials or fragment');
    publishUrl = url.href;
  }
  const patches = new Map(), corrections = [];
  for (const e of entries.slice(1, to + 1)) {
    if (e.kind !== 'correction') continue;
    const target = entries[e.payload.corrects_seq];
    if (!['order', 'fill', 'mark'].includes(target.kind) || !object(e.payload.replacement) || !Object.keys(e.payload.replacement).length) fail(e.seq, 'correction requires an explicit order/fill/mark replacement patch');
    text(e.payload.reason, 'correction.reason', 1000);
    const allowed = target.kind === 'mark' ? ['marks', 'source', 'equity', 'observed_at'] : target.kind === 'order' ? ['client_order_id', 'symbol', 'side', 'qty', 'venue', 'type', 'limit_price', 'strategy_id', 'session_id'] : ['client_order_id', 'symbol', 'side', 'qty', 'price', 'fee', 'fill_id', 'filled_at', 'venue', 'strategy_id', 'session_id'];
    if (Object.keys(e.payload.replacement).some(k => !allowed.includes(k))) fail(e.seq, 'correction patch contains unsupported members');
    patches.set(target.seq, { ...(patches.get(target.seq) ?? target.payload), ...e.payload.replacement });
    corrections.push({ figure: `journal entry ${target.seq}`, withdrawn_on: e.ts.slice(0, 10), reason: e.payload.reason, superseded_by: `journal correction ${e.seq}` });
  }
  let cash = account.cash, equity = account.equity, opening = account.equity, previous = account.equity, peak = account.equity;
  const holdings = account.holdings, orders = new Map(), ids = new Set(), sources = new Set();
  const venues = { local_sim: 0, alpaca_paper: 0 }, series = [];
  let fees = ZERO, traded = ZERO, intervalTraded = ZERO, maxDrawdown = 0, windowTs = entries[0].ts, lastObserved = entries[0].ts, lastMarkSeq = 0, lastFillSeq = 0, totalFills = 0, regular = account.frequency !== 'IRREGULAR';
  for (const e of entries.slice(1, to + 1)) {
    const p = patches.get(e.seq) ?? e.payload;
    supported(p, e.seq);
    if (own(p, 'currency') && p.currency !== 'USD') fail(e.seq, 'event currency differs from USD account');
    for (const k of ['strategy_id', 'session_id']) if (own(p, k) && p[k] !== account[k]) fail(e.seq, `${k} differs from the signed account`);
    if (e.kind === 'config' && own(p, 'account')) fail(e.seq, 'opening account cannot change after genesis');
    if (e.kind === 'reconcile' && p.status !== 'AGREE') fail(e.seq, `unresolved ${p.status} reconciliation`);
    if (e.kind === 'order') {
      text(p.client_order_id, 'order id');
      if (orders.has(p.client_order_id) || !SYMBOL.test(p.symbol) || !['buy', 'sell'].includes(p.side) || !['market', 'limit'].includes(p.type) || !VENUES.includes(p.venue) || (account.venue !== 'mixed' && account.venue !== p.venue)) fail(e.seq, 'duplicate or unsupported order/scope');
      if (p.type === 'limit') decimal(p.limit_price, 'order limit_price', true);
      orders.set(p.client_order_id, { ...p, ts: e.ts, quantity: decimal(p.qty, 'order qty', true), filled: ZERO });
    } else if (e.kind === 'fill') {
      text(p.fill_id, 'fill.fill_id');
      const order = orders.get(p.client_order_id);
      if (ids.has(p.fill_id) || !order || p.symbol !== order.symbol || p.side !== order.side || (own(p, 'venue') && p.venue !== order.venue)) fail(e.seq, 'duplicate fill or fill without a matching prior order');
      ids.add(p.fill_id);
      if (own(p, 'filled_at')) { timestamp(p.filled_at, 'fill.filled_at'); if (p.filled_at < order.ts || p.filled_at > e.ts) fail(e.seq, 'filled_at is outside order/fill journal times'); }
      const qty = decimal(p.qty, 'fill qty', true), price = decimal(p.price, 'fill price', true), fee = decimal(p.fee, 'fill fee');
      order.filled = add(order.filled, qty);
      if (cmp(order.filled, order.quantity) > 0) fail(e.seq, 'filled quantity exceeds order quantity');
      const signedQty = p.side === 'buy' ? qty : neg(qty), amount = mul(signedQty, price);
      cash = sub(sub(cash, amount), fee); holdings.set(p.symbol, add(holdings.get(p.symbol) ?? ZERO, signedQty));
      lastFillSeq = e.seq;
      if (e.seq > from) { fees = add(fees, fee); traded = add(traded, abs(amount)); intervalTraded = add(intervalTraded, abs(amount)); totalFills++; venues[order.venue]++; }
    } else if (e.kind === 'mark') {
      text(p.source, 'mark.source');
      const observed = timestamp(p.observed_at ?? e.ts, 'mark.observed_at');
      if (observed <= lastObserved || observed > e.ts) fail(e.seq, 'mark observation time must increase and not exceed entry time');
      if (!object(p.marks) || Object.keys(p.marks).some(k => !SYMBOL.test(k))) fail(e.seq, 'marks require a symbol/price map');
      for (const [symbol, price] of Object.entries(p.marks)) decimal(price, `mark ${symbol}`, true);
      equity = cash;
      for (const [symbol, qty] of holdings) if (qty[0] !== 0n) {
        if (!own(p.marks, symbol)) fail(e.seq, `missing mark for open position ${symbol}`);
        equity = add(equity, mul(qty, decimal(p.marks[symbol], `mark ${symbol}`, true)));
      }
      const equityNumber = number(equity, 'marked equity');
      if (p.equity !== undefined && p.equity !== null && (typeof p.equity !== 'number' || !Number.isFinite(p.equity) || Math.abs(p.equity - equityNumber) > 1e-12 * Math.max(1, Math.abs(equityNumber)))) fail(e.seq, 'supplied equity differs from cash/fills/marks');
      if (e.seq < from) { previous = equity; lastObserved = observed; lastMarkSeq = e.seq; continue; }
      if (e.seq === from) { opening = equity; previous = equity; peak = equity; windowTs = observed; lastObserved = observed; lastMarkSeq = e.seq; continue; }
      if (opening[0] <= 0n) fail(from, 'selected opening marked equity must be positive');
      if (regular && bucket(observed, account.frequency) - bucket(lastObserved, account.frequency) !== 1) regular = false;
      if (cmp(equity, peak) > 0) peak = equity;
      maxDrawdown = Math.max(maxDrawdown, 1 - ratio(equity, peak, 'drawdown'));
      sources.add(p.source);
      series.push({ seq: e.seq, ts: observed, equity: equityNumber, return: previous[0] > 0n ? ratio(equity, previous, 'return') - 1 : null, turnover: previous[0] > 0n ? ratio(intervalTraded, previous, 'turnover') : null });
      previous = equity; lastObserved = observed; lastMarkSeq = e.seq; intervalTraded = ZERO;
    }
  }
  if (!series.length) throw new RangeError('journal export needs at least one mark after the opening valuation');
  if (lastFillSeq > lastMarkSeq) fail(lastFillSeq, 'fill has no subsequent valuation; add a mark or explicitly select an earlier to');
  const frequency = regular ? account.frequency : 'IRREGULAR', ppy = regular ? account.periods_per_year : null;
  const finiteReturns = series.every(row => row.return !== null), returns = series.map(row => row.return);
  const cumulative = ratio(equity, opening, 'cumulative return') - 1;
  let annualised = null, sharpe = null, reportable = false, mintrl = null, sharpeReason = 'irregular observation periods';
  if (ppy !== null && finiteReturns) {
    const rate = Math.pow(1 + cumulative, ppy / series.length) - 1;
    if (equity[0] > 0n && Number.isFinite(rate)) annualised = rate;
    try {
      const moments = perPeriodMoments(returns);
      const candidate = moments.sharpe_per_period * Math.sqrt(ppy);
      mintrl = minimumTrackRecordLength({ observed_sharpe_annualized: candidate, benchmark_sharpe_annualized: 0, periods_per_year: ppy, skew: moments.skew, non_excess_kurtosis: moments.non_excess_kurtosis, confidence: 0.95 });
      reportable = returns.length >= Math.ceil(mintrl.observations);
      sharpe = reportable ? candidate : null; sharpeReason = reportable ? null : 'observations below minimum track record';
    } catch (error) { sharpeReason = error.message; }
  } else if (!finiteReturns) sharpeReason = 'relative returns undefined after nonpositive equity';
  const turnoverAnnualised = ppy !== null && series.every(r => r.turnover !== null) ? series.reduce((s, r) => s + r.turnover, 0) / series.length * ppy : null;
  if (turnoverAnnualised !== null && !Number.isFinite(turnoverAnnualised)) throw new RangeError('annual turnover is nonfinite');
  const journalSha = sha(bytes), head = sha(Buffer.from(lines[to])), isMixed = (venues.local_sim > 0 && venues.alpaca_paper > 0) || (!totalFills && account.venue === 'mixed');
  const venue = isMixed ? 'mixed' : venues.alpaca_paper ? 'alpaca_paper' : totalFills ? 'local_sim' : account.venue;
  const record = {
    schema: 'canli.paper-evidence.v0', generated_at: options.generated_at ?? new Date().toISOString(),
    capital: { kind: isMixed ? 'MIXED' : venue === 'alpaca_paper' ? 'PAPER' : 'SIMULATED', execution: isMixed ? 'MIXED' : venue === 'alpaca_paper' ? 'BROKER_PAPER_FILLS' : 'LOCAL_SIMULATED_FILLS', venue, notes: `${venues.local_sim} locally simulated and ${venues.alpaca_paper} broker-paper fills, declared by the journal writer; broker authenticity not established.` },
    identity: { name: account.strategy_id, kind: account.identity_kind ?? 'CANDIDATE', preregistered: false },
    period: { first_observation: series[0].ts.slice(0, 10), last_observation: series.at(-1).ts.slice(0, 10), observation_count: series.length, frequency, calendar: 'UTC period buckets; periods per year declared in signed account' },
    returns: { basis: 'NET_OF_MODELLED_COSTS', cumulative, annualised, sharpe_annualised: sharpe, sharpe_reportable: reportable, series_available: true },
    costs: { modelled: totalFills > 0, components: totalFills > 0 ? ['FEES'] : [], turnover_annualised: turnoverAnnualised, notes: `Explicit USD fees only; fill prices already include their stated execution price. Fee total ${number(fees, 'fees')}. No independent impact or spread calibration.`, not_modelled: ['IMPACT', 'LATENCY', 'FINANCING', 'BORROW', 'FUNDING', 'corporate actions', 'missing or undisclosed executions'] },
    selection: { trials_counted: false, trial_count: null, deflation_applied: false },
    risk: { max_drawdown_realised: maxDrawdown, drawdown_basis: 'OBSERVED', exposure_notes: `Observed at supplied marks only, sources: ${[...sources].sort().join(', ')}; intraperiod drawdown not established.` },
    corrections: { count: corrections.length, withdrawn_figures: corrections },
    provenance: { source_bindings: [{ path: 'journal', sha256: journalSha, ...(publishUrl ? { url: publishUrl } : {}) }, { path: `journal/range/${from}/${to}`, sha256: head }], independently_verifiable: false, signed: false, signature_scheme: 'Export unsigned; source journal Ed25519, user-held key (self-attested)', ...(publishUrl ? { verification_url: publishUrl } : {}) },
    claim_maturity: { establishes: ['Recomputed cash/fill/mark performance for the explicitly selected journal window', 'Source journal chain and Ed25519 signatures verified'], does_not_establish: ['Market execution: paper fills are not market fills', 'Trusted time or completeness: no third-party anchor; other journals/windows may exist', 'Authentic broker fills, preregistration or counted research trials', 'Full costs, corporate actions or intraperiod risk', 'Public availability of a caller-supplied publication URL', ...(sharpeReason ? [`Sharpe unreported: ${sharpeReason}`] : ['Selection-adjusted or sustained forward Sharpe'])], external_review_count: 0, independent_replication_count: 0 },
    notes: `Accounting profile ${ACCOUNT_PROFILE}; USD; no external cash flows. Window ${from}..${to}; prior state replayed. ${series.filter(r => r.return === null).length} undefined relative returns retained. Session label ${account.session_id ?? '(none)'} is not research-ledger evidence.`,
  };
  timestamp(record.generated_at, 'generated_at');
  return { record, journal_sha256: journalSha, head, entry_range: { from, to }, metrics: { opening_equity: number(opening, 'opening equity'), closing_equity: number(equity, 'closing equity'), fees_usd: number(fees, 'fees'), traded_notional_usd: number(traded, 'traded notional'), fill_count: totalFills, cumulative_return: cumulative, max_drawdown: maxDrawdown, turnover_annualised: turnoverAnnualised, undefined_returns: series.filter(r => r.return === null).length, min_track_record: mintrl }, series, journal_public_key: entries[0].payload.journal_key };
}

export function signJournalExport(bundle, privatePem) {
  let key; try { key = createPrivateKey(privatePem); } catch { throw new RangeError('journal signing key is invalid'); }
  if (key.asymmetricKeyType !== 'ed25519' || publicKeyBase64(key) !== bundle.journal_public_key) throw new RangeError('journal signing key does not match genesis');
  const record = { ...bundle.record, provenance: { ...bundle.record.provenance, signed: true, signature_scheme: 'Ed25519 over canonical record bytes; user-held key (self-attested)' } };
  const signature = { scheme: 'Ed25519', public_key: bundle.journal_public_key, signature: sign(null, Buffer.from(canonicalJson(record)), key).toString('base64') };
  return { ...bundle, record, signature };
}
function checkRecordSignature(record, signature, key) {
  if (!object(signature) || signature.scheme !== 'Ed25519' || signature.public_key !== key || typeof signature.signature !== 'string') return false;
  const raw = Buffer.from(key, 'base64'), sig = Buffer.from(signature.signature, 'base64');
  if (raw.length !== 32 || sig.length !== 64 || sig.toString('base64') !== signature.signature) return false;
  try { return verify(null, Buffer.from(canonicalJson(record)), createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw]), type: 'spki', format: 'der' }), sig); } catch { return false; }
}

/** Numeric matches alone are insufficient: scope, identity, disclosures and claims must match. */
export function journalBindings(record, data, signature) {
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data), integrity = verifyJournal(bytes);
  const bindings = Array.isArray(record?.provenance?.source_bindings) ? record.provenance.source_bindings : [];
  const file = bindings.filter(b => b.path === 'journal'), ranges = bindings.filter(b => /^journal\/range\/\d+\/\d+$/.test(b.path));
  const base = { checked: true, chain_valid: integrity.valid, first_bad_seq: integrity.first_bad_line, journal_sha256: sha(bytes), journal_sha256_matches: file.length === 1 && file[0].sha256 === sha(bytes), range_valid: false, record_signature_valid: null, recomputed_matches: {}, all_match: false };
  if (!integrity.valid || file.length !== 1 || ranges.length !== 1 || bindings.length !== 2) return { ...base, reason: 'invalid journal or ambiguous source/range bindings' };
  const parts = ranges[0].path.split('/'), from = Number(parts[2]), to = Number(parts[3]);
  let exported;
  try { exported = exportJournal(bytes, { from, to, publish_url: file[0].url, generated_at: record.generated_at }); } catch (error) { return { ...base, reason: error.message }; }
  base.range_valid = ranges[0].sha256 === exported.head;
  const expected = exported.record;
  if (record.provenance.signed === true) {
    base.record_signature_valid = checkRecordSignature(record, signature, exported.journal_public_key);
    expected.provenance.signed = true;
    expected.provenance.signature_scheme = 'Ed25519 over canonical record bytes; user-held key (self-attested)';
  } else if (signature !== undefined) base.record_signature_valid = false;
  for (const field of ['capital', 'identity', 'period', 'returns', 'costs', 'selection', 'risk', 'corrections', 'provenance', 'claim_maturity', 'notes']) base.recomputed_matches[field] = equal(record[field], expected[field]);
  base.all_match = base.journal_sha256_matches && base.range_valid && base.record_signature_valid !== false && Object.values(base.recomputed_matches).every(Boolean);
  return base;
}
