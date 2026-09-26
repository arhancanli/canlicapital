// api/_lib/receipt-signature.js
//
// Signs a receipt's statement (js/receipt-statement.js) with the Ed25519 key in the environment
// variable CANLI_RECEIPT_SIGNING_KEY (base64 of the PKCS#8 DER private key). Ed25519 signatures are
// deterministic, so a receipt signed when it is issued and signed again when it is read carry the
// same bytes, and nothing about the signature is stored. The public half is published at
// /.well-known/canli-receipt-keys.json. Without the variable (a preview or a local run), receipts
// carry signature: null rather than failing, and the key id tells a reader which key to expect.
import { createPrivateKey, createPublicKey, sign } from "node:crypto";

import { keyIdFor, receiptStatement, SIGNATURE_SCHEMA } from "../../js/receipt-statement.js";

let cached;

export function signingKey(env = process.env) {
  const encoded = env.CANLI_RECEIPT_SIGNING_KEY;
  if (!encoded) return null;
  if (cached?.encoded === encoded) return cached;
  const privateKey = createPrivateKey({ key: Buffer.from(encoded, "base64"), format: "der", type: "pkcs8" });
  if (privateKey.asymmetricKeyType !== "ed25519") throw new Error("CANLI_RECEIPT_SIGNING_KEY is not an Ed25519 key");
  const x = createPublicKey(privateKey).export({ format: "jwk" }).x;
  cached = { encoded, privateKey, key_id: keyIdFor(Buffer.from(x, "base64url")) };
  return cached;
}

export function signReceipt(fields, env = process.env) {
  const key = signingKey(env);
  if (!key) return null;
  const value = sign(null, Buffer.from(receiptStatement(fields), "utf8"), key.privateKey).toString("base64url");
  return { alg: "Ed25519", schema: SIGNATURE_SCHEMA, key_id: key.key_id, value };
}
