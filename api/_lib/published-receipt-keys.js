// api/_lib/published-receipt-keys.js
// The receipt signing keys as published at /.well-known/canli-receipt-keys.json, as a module the
// serverless functions can import without reading public/ at run time. A test in
// api/_lib/receipt-signature.test.mjs keeps it identical to the published file.
export const PUBLISHED_RECEIPT_KEYS = Object.freeze({
  "schema": "canli.receipt-keys.v1",
  "description": "Public keys that sign canlicapital.com validation receipts. A receipt's signature is Ed25519 over the canonical JSON of {schema, id, endpoint, input_sha256, output_sha256, bindings}; its key_id is the first 16 hex characters of sha256 over the key's 32 raw bytes.",
  "keys": [
    {
      "key_id": "269d381734732ea6",
      "alg": "Ed25519",
      "x": "k1ojmfzJlaiXwaEU5aql0CvNyHMS_vXTj9Q9-zTeYAw",
      "status": "active",
      "valid_from": "2026-09-26"
    }
  ]
});
