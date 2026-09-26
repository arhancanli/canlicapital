// GET /audit/{id}: the receipt certificate page. It must show the stored result with its limits and
// sources, check the signature against the published key on every view, never execute anything in a
// stored result, and never be indexed.
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";

import { LIMITS_TEXT } from "../../_lib/limits.js";
import { keyIdFor, receiptId } from "../../../js/receipt-statement.js";
import { createCertificateHandler, renderCertificate } from "./[id]/certificate.js";

function testKey() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const x = publicKey.export({ format: "jwk" }).x;
  return {
    env: { CANLI_RECEIPT_SIGNING_KEY: privateKey.export({ format: "der", type: "pkcs8" }).toString("base64") },
    keys: [{ key_id: keyIdFor(Buffer.from(x, "base64url")), alg: "Ed25519", x, status: "active" }],
  };
}

function rowWith(output) {
  const content = { endpoint: "validate/breadth", input_sha256: "sha256:in", output, bindings: { "js/breadth-core.js": "sha256:aa", "js/validate/breadth.js": "sha256:bb" } };
  return { id: receiptId(content), ...content, created_at: "2026-09-26T00:00:00Z" };
}

const ROW = rowWith({ ceiling: 2.236, plain_reading: "Adding sleeves of this quality can never take the book above a Sharpe of 2.236." });

test("a signed receipt's certificate shows the reading, every limit, every source, and a verified signature", () => {
  const key = testKey();
  const { status, html } = renderCertificate(ROW, { origin: "https://canlicapital.com", keys: key.keys, env: key.env });
  assert.equal(status, 200);
  assert.match(html, /Breadth ceiling: receipt [0-9a-f]{24}/);
  assert.match(html, /can never take the book above a Sharpe of 2\.236/);
  for (const sentence of LIMITS_TEXT) assert.ok(html.includes(sentence.replaceAll("'", "&#39;")), sentence);
  assert.match(html, /js\/breadth-core\.js/);
  assert.match(html, /Signature verified\./);
  assert.match(html, new RegExp(`key <code>${key.keys[0].key_id}</code>`));
  assert.match(html, /<meta name="robots" content="noindex, follow"/);
  assert.match(html, new RegExp(`\\(https://canlicapital\\.com/audit/${ROW.id}\\)`));
  // Scoped to the certificate itself: the site header's navigation copy is not the certificate.
  const main = html.slice(html.indexOf('<main id="content">'), html.indexOf("</main>"));
  assert.ok(main.length > 500);
  assert.ok(!/\b(pass|passed|fail|failed|approved)\b/i.test(main.replace(/pass or fail mark/g, "")), "no grade in the certificate");
});

test("without a signing key, or with a key that is not published, the page says the signature is not verified", () => {
  const key = testKey();
  assert.match(renderCertificate(ROW, { keys: key.keys, env: {} }).html, /Signature not verified\..*holds no signing key/s);
  assert.match(renderCertificate(ROW, { keys: testKey().keys, env: key.env }).html, /Signature not verified\..*At least one check failed/s);
});

test("text in a stored result is shown as text, never as markup", () => {
  const key = testKey();
  const row = rowWith({ plain_reading: '<script>alert("x")</script>', note: "<img src=x onerror=alert(1)>" });
  const { html } = renderCertificate(row, { keys: key.keys, env: key.env });
  assert.ok(!html.includes("<script>alert"));
  assert.ok(!html.includes("<img src=x"));
  assert.ok(html.includes("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"));
});

function makeRes() {
  const res = { statusCode: 200, headers: {}, body: "" };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.end = (b = "") => { res.body = String(b); };
  return res;
}

test("the handler: unknown and malformed ids are 404 pages, a store failure is 503, and nothing is indexed", async () => {
  const store = (row) => ({ getReceipt: async () => row });
  const cases = [
    [{ query: { id: "nope" } }, store(null), 404],
    [{ query: { id: "a".repeat(24) } }, store(null), 404],
    [{ query: { id: ROW.id } }, { getReceipt: async () => { throw new Error("down"); } }, 503],
    [{ query: { id: ROW.id } }, store(ROW), 200],
  ];
  for (const [req, s, expected] of cases) {
    const res = makeRes();
    await createCertificateHandler({ store: s })({ method: "GET", ...req }, res);
    assert.equal(res.statusCode, expected);
    assert.equal(res.headers["x-robots-tag"], "noindex");
    assert.match(res.headers["content-type"], /text\/html/);
  }
  const post = makeRes();
  await createCertificateHandler({ store: store(ROW) })({ method: "POST", query: { id: ROW.id } }, post);
  assert.equal(post.statusCode, 405);
});
