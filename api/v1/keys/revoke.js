import { bearerKey, hashKey } from '../../_lib/auth.js';
import { BodyError, readJsonBody } from '../../_lib/body.js';
import { envelope, errorEnvelope, send } from '../../_lib/envelope.js';
import { defaultStore } from '../../_lib/handler.js';
import { LIMITS, LIMITS_TEXT } from '../../_lib/limits.js';

export function validateBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length) throw new TypeError('The bearer key is the only revocation target; send an empty JSON object or no body');
  return {};
}

export function createRevokeHandler({ store } = {}) {
  const fail = (res, status, code, message) => send(res, status, errorEnvelope({ endpoint: 'keys/revoke', code, message, limits: LIMITS_TEXT }));
  return async (req, res) => {
    if (req.method === 'OPTIONS') return send(res, 204, '', {});
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST, OPTIONS'); return fail(res, 405, 'method_not_allowed', 'Use POST'); }
    const key = bearerKey(req);
    if (!key) return fail(res, 401, 'unauthorized', 'Send the key to revoke in Authorization: Bearer ck_live_...');
    let body;
    try { body = await readJsonBody(req, LIMITS.max_key_revoke_body_bytes, { allowEmpty: true }); }
    catch (error) { return fail(res, error instanceof BodyError ? error.status : 400, error instanceof BodyError ? error.code : 'unreadable_body', 'Send an empty JSON object or no body'); }
    try { validateBody(body); } catch (error) { return fail(res, 422, 'invalid_input', error.message); }
    let result;
    try { result = await (store ?? defaultStore()).revokeKey(hashKey(key)); }
    catch { return fail(res, 503, 'store_unavailable', 'Key revocation is unavailable; do not assume the key was revoked'); }
    if (!result.revoked) return fail(res, 401, 'unauthorized', 'Unknown key');
    return send(res, 200, envelope({ endpoint: 'keys/revoke', claimClass: 'OBSERVED', capitalKind: 'NOT_APPLICABLE_SERVICE_STATUS', limits: LIMITS_TEXT, sources: [], data: {
      revoked: true, revoked_at: result.revoked_at,
      note: 'Future quota admissions using this key are denied. Requests admitted before revocation may finish. Existing public receipts remain available. Issue a new key separately if needed.',
    } }));
  };
}
export default createRevokeHandler();
