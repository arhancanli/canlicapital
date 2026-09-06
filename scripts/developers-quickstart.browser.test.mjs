// scripts/developers-quickstart.browser.test.mjs
// Drives the real /developers page in a headless browser and intercepts POST /api/v1/keys, so this
// proves the inline "Get a key" script actually does what the generator's comment claims: fill the
// highlighted block, show the once-only note, and substitute the key into every pre.dev-code
// snippet on the page, all without touching the network beyond the one route we fake.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { chromium } from "playwright";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml" };

function startStaticServer() {
  return new Promise((resolveServer) => {
    const server = createServer(async (req, res) => {
      try {
        const urlPath = decodeURIComponent(req.url.split("?")[0]);
        const filePath = normalize(join(ROOT, urlPath === "/" ? "/developers.html" : urlPath));
        if (!filePath.startsWith(ROOT)) throw new Error("path escapes root");
        const data = await readFile(filePath);
        res.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end("not found");
      }
    });
    server.listen(0, "127.0.0.1", () => resolveServer(server));
  });
}

async function withPage(baseUrl, run) {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    // The page loads Google Fonts over the network; abort them so the test is fast and does not
    // depend on outbound network access this sandbox may not have.
    await context.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
    const page = await context.newPage();
    await run(page, context);
  } finally {
    await browser.close();
  }
}

let server;
let baseUrl;

test.before(async () => {
  server = await startStaticServer();
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => new Promise((r) => server.close(r)));

test("a successful key issuance fills the block, shows the once-only note, and substitutes the key into every snippet", async () => {
  const fakeKey = "ck_live_FAKE_TEST_KEY_0123456789ABCDEF";
  const note = "Store this key now. Only its hash is kept and it cannot be shown again.";
  await withPage(baseUrl, async (page, context) => {
    await context.route("**/api/v1/keys", (route) =>
      route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          schema: "canli.api.v1",
          endpoint: "/api/v1/keys",
          data: { key: fakeKey, label: "developers page", quotas: { keys_per_client_per_day: 5 }, keys_remaining_today: 4, note },
        }),
      }),
    );
    await page.goto(`${baseUrl}/developers.html`, { waitUntil: "domcontentloaded" });

    // Before the click: no placeholder, nothing shown, the curl fallback is what a crawler sees.
    assert.equal(await page.locator("#dev-key-result").getAttribute("hidden"), "", "the result box starts hidden");
    assert.equal((await page.locator("#dev-key-result").innerText()).trim(), "");

    await page.click("#dev-get-key-button");
    await page.waitForSelector("#dev-key-result:not([hidden])");

    const resultText = await page.locator("#dev-key-result").innerText();
    assert.ok(resultText.includes(fakeKey), `expected the issued key in the result block, got: ${resultText}`);
    assert.ok(resultText.includes(note), "the exact once-only note from the response must be shown");
    assert.ok(resultText.includes("4"), "the remaining daily keys count from the response must be shown");

    const snippets = await page.locator("pre.dev-code").allInnerTexts();
    assert.ok(snippets.some((t) => t.includes(fakeKey)), "the key must be substituted into at least one snippet");
    assert.ok(!snippets.some((t) => t.includes("$CANLI_KEY")), "no snippet should still show the placeholder after success");

    assert.equal(await page.locator("#dev-key-error").getAttribute("hidden"), "", "no error shown on success");
  });
});

test("a 429 shows the envelope's message verbatim and keeps the curl path visible", async () => {
  const message = "At most 5 keys per client per UTC day";
  await withPage(baseUrl, async (page, context) => {
    await context.route("**/api/v1/keys", (route) =>
      route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ schema: "canli.api.v1", endpoint: "/api/v1/keys", error: { code: "issuance_exhausted", message }, data: {} }),
      }),
    );
    await page.goto(`${baseUrl}/developers.html`, { waitUntil: "domcontentloaded" });
    await page.click("#dev-get-key-button");
    await page.waitForSelector("#dev-key-error:not([hidden])");

    const errorText = (await page.locator("#dev-key-error").innerText()).trim();
    assert.equal(errorText, message, "the error box must show the envelope's message verbatim");
    assert.equal(await page.locator("#dev-key-result").getAttribute("hidden"), "", "no key block on a failure");

    // The curl fallback stays visible and unedited: a $CANLI_KEY snippet never got a fake key.
    const curlBlock = page.locator("pre.dev-code").first();
    await assert.doesNotReject(curlBlock.waitFor({ state: "visible", timeout: 2000 }));
    assert.match(await curlBlock.innerText(), /curl -X POST/);
  });
});

test("a network failure also shows a message and keeps the button usable again", async () => {
  await withPage(baseUrl, async (page, context) => {
    await context.route("**/api/v1/keys", (route) => route.abort("failed"));
    await page.goto(`${baseUrl}/developers.html`, { waitUntil: "domcontentloaded" });
    await page.click("#dev-get-key-button");
    await page.waitForSelector("#dev-key-error:not([hidden])");
    assert.ok((await page.locator("#dev-key-error").innerText()).trim().length > 0);
    assert.equal(await page.locator("#dev-get-key-button").isEnabled(), true, "the button must re-enable after a failure");
  });
});
