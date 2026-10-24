// Signed risk attestations and private balances.
//
// Every pre-trade check this server runs ends in an attestation: a statement of which orders were
// checked, against which limits, with what result, at what time, signed with an Ed25519 key that
// is made on the trader's machine the first time and never leaves it (CANLI_HOME/attest-ed25519.pem;
// the public half, attest-ed25519.pub.pem, is what the trader gives an auditor or a counterparty).
// Anyone holding the public key can check the statement was made by this server's key and not
// altered (verify_attestation).
//
// With CANLI_PAPER_PRIVATE=1 the model never sees the account's numbers: equity, cash, buying power
// and positions are replaced by commitments, SHA-256 of a random salt and the value. The salts are
// written only to CANLI_HOME/commitments.jsonl, so the trader can later open a commitment to an
// auditor (show the value and salt; anyone can recompute the hash) without the model ever having
// held the figure. The attestation carries the same commitments, so it says "these orders passed
// against this account" while disclosing the account to nobody.
//
// Each attestation is signed twice when Node can (24.7 or later): with Ed25519 and with ML-DSA-65
// (FIPS 204), a post-quantum signature, over the same statement naming both keys. A verifier then
// needs both public keys and both signatures must hold, so the statement stays unforgeable even if
// one scheme falls (Ed25519 to a large quantum computer, say). Older Node signs with Ed25519 alone.
//
// This is a signature over commitments, not a zero-knowledge proof: an auditor who is shown a value
// learns it, and the checks themselves are trusted to this server's code. Brokers take API keys, not
// proofs; the keys stay in the environment and are never shown to the model either way.
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign, verify } from "node:crypto";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const canonical = (v) => (v === null || typeof v !== "object" ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(canonical).join(",")}]` : `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`);
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

// The trader's signing keys, made once (mode 0600, never overwritten). Each is read first; only when
// there is none is a key made, created exclusively ("wx"), so two processes starting together end
// up with one key and no check-then-write gap.
function keyFile(home, alg) {
  const priv = join(home, `attest-${alg}.pem`), pub = join(home, `attest-${alg}.pub.pem`);
  let pem;
  try { pem = readFileSync(priv); } catch (e) {
    if (e.code !== "ENOENT") throw e;
    let pair;
    try { pair = generateKeyPairSync(alg); } catch { return null; } // ML-DSA needs Node 24.7+
    try { writeFileSync(priv, pair.privateKey.export({ type: "pkcs8", format: "pem" }), { flag: "wx", mode: 0o600 }); } catch (w) { if (w.code !== "EEXIST") throw w; }
    pem = readFileSync(priv);
  }
  const key = createPrivateKey(pem);
  const publicPem = createPublicKey(key).export({ type: "spki", format: "pem" });
  // The public half is derived from the private key each time, so a missing or stale copy is rewritten.
  writeFileSync(pub, publicPem, { mode: 0o644 });
  return { key, publicPem, keyId: sha256(publicPem).slice(0, 16), publicPath: pub };
}
export function attestKey(home, { postQuantum = true } = {}) {
  const ed = keyFile(home, "ed25519");
  const pq = postQuantum ? keyFile(home, "ml-dsa-65") : null;
  return { ...ed, ...(pq ? { pq } : {}) };
}

// A commitment to a value: its hash with a fresh salt; the salt goes to the trader's file only.
export function committer(home, now) {
  const path = join(home, "commitments.jsonl");
  return (label, value) => {
    const salt = randomBytes(16).toString("hex"), commitment = sha256(`${salt}:${canonical(value)}`);
    appendFileSync(path, `${JSON.stringify({ at: now().toISOString(), label, commitment, salt, value })}\n`, { mode: 0o600 });
    return commitment;
  };
}
export const openCommitment = (commitment, salt, value) => sha256(`${salt}:${canonical(value)}`) === commitment;

export function attest(signer, statement) {
  const body = { v: signer.pq ? 2 : 1, key_id: signer.keyId, ...(signer.pq ? { pq_key_id: signer.pq.keyId, pq_alg: "ML-DSA-65" } : {}), ...statement };
  const bytes = Buffer.from(canonical(body));
  return { ...body, signature: sign(null, bytes, signer.key).toString("base64"), ...(signer.pq ? { pq_signature: sign(null, bytes, signer.pq.key).toString("base64") } : {}) };
}

const readKey = (pem, what) => {
  try { const k = createPublicKey(pem); return { key: k, keyId: sha256(k.export({ type: "spki", format: "pem" })).slice(0, 16) }; } catch (e) { return { error: `${what} public key unreadable: ${e.message}` }; }
};
// An attestation signed with both keys verifies only when both signatures hold for the keys given.
export function verifyAttestation(attestation, publicPem, openings = [], pqPublicPem = null) {
  const { signature, pq_signature: pqSignature, ...body } = attestation ?? {};
  const out = (valid, reason) => {
    const commitments = new Set(Object.values(body.account ?? {}));
    return {
      valid, ...(reason ? { reason } : {}), signatures: body.pq_key_id ? ["Ed25519", "ML-DSA-65"] : ["Ed25519"],
      statement: body,
      opened: openings.map((o) => ({ label: o.label, value: o.value, matches: commitments.has(o.commitment) && openCommitment(o.commitment, o.salt, o.value) })),
    };
  };
  if (!signature) return out(false, "no signature");
  const ed = readKey(publicPem, "Ed25519");
  if (ed.error) return out(false, ed.error);
  if (body.key_id !== ed.keyId) return out(false, `signed by key ${body.key_id}, not this public key (${ed.keyId})`);
  const bytes = Buffer.from(canonical(body));
  if (!verify(null, bytes, ed.key, Buffer.from(signature, "base64"))) return out(false, "the Ed25519 signature does not match the statement: it was altered or signed by another key");
  if (body.pq_key_id) {
    if (!pqSignature) return out(false, "the statement names a post-quantum key but carries no ML-DSA-65 signature");
    if (!pqPublicPem) return out(false, "the statement is also signed with ML-DSA-65; give that public key (attest-ml-dsa-65.pub.pem) to check it");
    const pq = readKey(pqPublicPem, "ML-DSA-65");
    if (pq.error) return out(false, pq.error);
    if (body.pq_key_id !== pq.keyId) return out(false, `post-quantum signature by key ${body.pq_key_id}, not this public key (${pq.keyId})`);
    let ok = false;
    try { ok = verify(null, bytes, pq.key, Buffer.from(pqSignature, "base64")); } catch { ok = false; }
    if (!ok) return out(false, "the ML-DSA-65 signature does not match the statement: it was altered or signed by another key");
  }
  return out(true);
}
