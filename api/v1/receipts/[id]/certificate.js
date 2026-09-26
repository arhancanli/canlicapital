// api/v1/receipts/[id]/certificate.js
// GET /audit/{id} (a vercel.json rewrite to this route): a human-readable certificate for one stored
// validation receipt. It shows the result, what the result does not establish, the exact source
// files that computed it, and the receipt's Ed25519 signature, checked on every view against the
// published key, with the commands to check it again without trusting this page. The page adds no
// grade: a verified signature says who computed the numbers and from what, not that a strategy works.
import { defaultStore } from "../../../_lib/handler.js";
import { LIMITS_TEXT } from "../../../_lib/limits.js";
import { PUBLISHED_RECEIPT_KEYS } from "../../../_lib/published-receipt-keys.js";
import { receiptOrigin } from "../../../_lib/receipt-origin.js";
import { signReceipt } from "../../../_lib/receipt-signature.js";
import { KEYS_URL, outputSha256, verifyReceipt } from "../../../../js/receipt-statement.js";
import { renderProductShellFooter, renderProductShellHeader, renderProductShellStylesheet } from "../../../../scripts/product-shell.mjs";

const esc = (v) => String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

const VALIDATOR_NAMES = Object.freeze({
  "validate/deflated-sharpe": "Deflated Sharpe ratio",
  "validate/overfitting": "Probability of backtest overfitting (CSCV)",
  "validate/paper-evidence": "Paper-evidence conformance",
  "validate/breadth": "Breadth ceiling",
  "validate/track-record": "Minimum track record length",
  "validate/backtest-length": "Minimum backtest length",
  "validate/haircut-sharpe": "Haircut Sharpe ratio",
  "validate/luck-trials": "Luck-equivalent trials",
});

function page({ title, body, status = 200 }) {
  return { status, html: `<!doctype html>
<html lang="en" data-page="receipt-certificate">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)} | Canli Capital</title>
<meta name="robots" content="noindex, follow" />
<meta name="description" content="A signed canlicapital.com validation receipt: the result, what it does not establish, the source files that computed it, and how to verify the signature." />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
${renderProductShellStylesheet()}
<link rel="stylesheet" href="/css/developers.css" />
</head>
<body class="dev-page">
${renderProductShellHeader({ active: "developers" })}
<main id="content">
${body}
</main>
${renderProductShellFooter()}
</body>
</html>
` };
}

function notFound(id) {
  return page({
    status: 404,
    title: "Receipt not found",
    body: `<section class="dev-hero"><p class="dev-kicker"><span>Validation receipt</span></p><h1>No receipt with that id.</h1>
    <p class="dev-note">${id ? `<code>${esc(id)}</code> is not a stored receipt.` : "A receipt id is 24 hex characters."} Receipts are issued by the <a href="/developers">validation API</a> and its MCP server.</p></section>`,
  });
}

export function renderCertificate(row, { origin = receiptOrigin(), keys = PUBLISHED_RECEIPT_KEYS.keys, env = process.env } = {}) {
  const output_sha256 = outputSha256(row.output);
  const signature = signReceipt({ id: row.id, endpoint: row.endpoint, input_sha256: row.input_sha256, output_sha256, bindings: row.bindings }, env);
  const check = verifyReceipt({ id: row.id, endpoint: row.endpoint, input_sha256: row.input_sha256, output: row.output, bindings: row.bindings, signature }, keys);
  const name = VALIDATOR_NAMES[row.endpoint] ?? row.endpoint;
  const jsonUrl = `${origin}/api/v1/receipts/${row.id}`;
  const pageUrl = `${origin}/audit/${row.id}`;
  const badge = `[![Canli receipt](${origin}/api/v1/receipts/${row.id}/badge.svg)](${pageUrl})`;
  const reading = row.output?.plain_reading;
  const status = check.valid
    ? `<p class="dev-note"><strong>Signature verified.</strong> This receipt's content matches its id, and its Ed25519 signature verifies against key <code>${esc(signature.key_id)}</code> published at <a href="${esc(KEYS_URL)}">${esc(KEYS_URL)}</a>.</p>`
    : `<p class="dev-note"><strong>Signature not verified.</strong> ${signature ? "At least one check failed." : "This deployment holds no signing key, so the receipt carries no signature."} The numbers below are still the stored result for this id.</p>`;
  const sources = Object.entries(row.bindings)
    .map(([path, sha]) => `<tr><td><code>${esc(path)}</code></td><td><code>${esc(sha)}</code></td></tr>`)
    .join("\n        ");
  const body = `<section class="dev-hero">
    <p class="dev-kicker"><span>Validation receipt</span><span>${esc(name)}</span></p>
    <h1>${esc(name)}: receipt ${esc(row.id)}</h1>
    ${reading ? `<p class="dev-note">${esc(reading)}</p>` : ""}
    ${status}
  </section>

  <section class="dev-section">
    <h2>What this does not establish</h2>
    <ul class="dev-list">${LIMITS_TEXT.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
  </section>

  <section class="dev-section">
    <h2>The result</h2>
    <pre class="dev-code" tabindex="0" aria-label="Stored result"><code>${esc(JSON.stringify(row.output, null, 2))}</code></pre>
    <p class="dev-note">Input sha256 <code>${esc(row.input_sha256)}</code>; output sha256 <code>${esc(output_sha256)}</code>. The inputs themselves are not stored, only their hash.${row.created_at ? ` Issued ${esc(String(row.created_at).slice(0, 10))}.` : ""}</p>
  </section>

  <section class="dev-section">
    <h2>The code that computed it</h2>
    <table class="dev-table" tabindex="0" aria-label="Source files"><thead><tr><th>Source file</th><th>sha256</th></tr></thead><tbody>
        ${sources}
    </tbody></table>
    <p class="dev-note">Every file is in the open-source repository <a href="https://github.com/arhancanli/canlicapital" rel="noreferrer">arhancanli/canlicapital</a>. The receipt id is the first 24 hex characters of sha256 over the canonical JSON of {endpoint, input_sha256, output, bindings}, so the id changes if any of them does.</p>
  </section>

  <section class="dev-section">
    <h2>Check it yourself</h2>
    <p class="dev-note">Do not trust this page: verify the signature on your own machine. With the MCP server (<code>npx -y canli-validation-mcp</code>), ask your assistant to run <code>verify_receipt</code> with id <code>${esc(row.id)}</code>; it checks the output hash, the id and the signature against the public key bundled in the package. The raw receipt is <a href="${esc(jsonUrl)}">${esc(jsonUrl)}</a>.</p>
    ${signature ? `<p class="dev-note">Signature (Ed25519, key <code>${esc(signature.key_id)}</code>): <code style="word-break: break-all">${esc(signature.value)}</code></p>` : ""}
  </section>

  <section class="dev-section">
    <h2>Link this receipt</h2>
    <pre class="dev-code" tabindex="0" aria-label="Badge markdown"><code>${esc(badge)}</code></pre>
    <p class="dev-note">The badge shows the validator and the receipt id, never a pass or fail mark.</p>
  </section>`;
  return page({ title: `${name} receipt ${row.id}`, body });
}

export function createCertificateHandler({ store } = {}) {
  return async function handler(req, res) {
    const send = ({ status, html }, cacheControl) => {
      res.statusCode = status;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", cacheControl);
      res.setHeader("X-Robots-Tag", "noindex");
      res.end(html);
    };
    if (req.method !== "GET" && req.method !== "HEAD") { res.setHeader("Allow", "GET, HEAD"); res.statusCode = 405; return res.end(); }
    const id = String(req.query?.id ?? "");
    if (!/^[0-9a-f]{24}$/.test(id)) return send(notFound(""), "public, max-age=300");
    let row;
    try {
      row = await (store ?? defaultStore()).getReceipt(id);
    } catch (e) {
      console.error("[validation-api] certificate receipt read failed", e.status ?? "", e.message);
      return send(page({ status: 503, title: "Receipt store unavailable", body: '<section class="dev-hero"><h1>The receipt store is unavailable.</h1><p class="dev-note">Try again shortly.</p></section>' }), "no-store");
    }
    if (!row) return send(notFound(id), "public, max-age=300");
    return send(renderCertificate(row), "public, max-age=3600");
  };
}

export default createCertificateHandler();
