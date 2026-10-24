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
// This is a signature over commitments, not a zero-knowledge proof: an auditor who is shown a value
// learns it, and the checks themselves are trusted to this server's code. Brokers take API keys, not
// proofs; the keys stay in the environment and are never shown to the model either way.
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign, verify } from "node:crypto";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const canonical = (v) => (v === null || typeof v !== "object" ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(canonical).join(",")}]` : `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`);
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

// The trader's signing key, made once (mode 0600, never overwritten). It is read first; only when
// there is none is a key made, created exclusively ("wx"), so two processes starting together end
// up with one key and no check-then-write gap.
export function attestKey(home) {
  const priv = join(home, "attest-ed25519.pem"), pub = join(home, "attest-ed25519.pub.pem");
  let pem;
  try { pem = readFileSync(priv); } catch (e) {
    if (e.code !== "ENOENT") throw e;
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    try { writeFileSync(priv, privateKey.export({ type: "pkcs8", format: "pem" }), { flag: "wx", mode: 0o600 }); } catch (w) { if (w.code !== "EEXIST") throw w; }
    pem = readFileSync(priv);
  }
  const key = createPrivateKey(pem);
  const publicPem = createPublicKey(key).export({ type: "spki", format: "pem" });
  // The public half is derived from the private key each time, so a missing or stale copy is rewritten.
  writeFileSync(pub, publicPem, { mode: 0o644 });
  return { key, publicPem, keyId: sha256(publicPem).slice(0, 16), publicPath: pub };
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
  const body = { v: 1, key_id: signer.keyId, ...statement };
  return { ...body, signature: sign(null, Buffer.from(canonical(body)), signer.key).toString("base64") };
}

export function verifyAttestation(attestation, publicPem, openings = []) {
  const { signature, ...body } = attestation ?? {};
  if (!signature) return { valid: false, reason: "no signature" };
  let pub;
  try { pub = createPublicKey(publicPem); } catch (e) { return { valid: false, reason: `public key unreadable: ${e.message}` }; }
  const keyId = sha256(pub.export({ type: "spki", format: "pem" })).slice(0, 16);
  if (body.key_id !== keyId) return { valid: false, reason: `signed by key ${body.key_id}, not this public key (${keyId})` };
  const valid = verify(null, Buffer.from(canonical(body)), pub, Buffer.from(signature, "base64"));
  const commitments = new Set(Object.values(body.account ?? {}));
  return {
    valid, ...(valid ? {} : { reason: "the signature does not match the statement: it was altered or signed by another key" }),
    statement: body,
    opened: openings.map((o) => ({ label: o.label, value: o.value, matches: commitments.has(o.commitment) && openCommitment(o.commitment, o.salt, o.value) })),
  };
}
