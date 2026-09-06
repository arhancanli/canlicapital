// scripts/verify-copy-command.browser.test.mjs
// /verify's Level 1 command lists every published artifact file, which reads as a wall of
// filenames on a page whose point is to be read before it is run. It is now collapsed behind a
// native <details> with a plain summary, with a Copy button (the same copy-then-confirm pattern
// used elsewhere on the site) so a reader does not have to expand it just to grab the script.
// This drives the real /verify page in a headless browser to prove both still work.
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
        const filePath = normalize(join(ROOT, urlPath === "/" ? "/verify.html" : urlPath));
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

let server;
let baseUrl;

test.before(async () => {
  server = await startStaticServer();
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => new Promise((r) => server.close(r)));

test("the Level 1 file list starts collapsed and the Copy button copies the full command", async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    await context.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
    await context.grantPermissions(["clipboard-write", "clipboard-read"]);
    const page = await context.newPage();
    await page.goto(`${baseUrl}/verify.html`, { waitUntil: "domcontentloaded" });

    const details = page.locator("details.verify__disclosure");
    await assert.doesNotReject(details.waitFor({ state: "attached", timeout: 2000 }));
    assert.equal(await details.evaluate((el) => el.open), false, "the file list must start collapsed");

    const commandText = await page.locator("#l1-command").textContent();
    assert.ok(commandText.includes("for f in"), "the collapsed disclosure must still hold the full command");
    assert.ok(commandText.split(/\s+/).length > 50, "the file list should still be the long one, just hidden");

    await details.locator("summary").click();
    assert.equal(await details.evaluate((el) => el.open), true, "the summary must open the disclosure");

    const copyButton = page.locator("#l1-copy");
    const restLabel = (await copyButton.textContent()).trim();
    await copyButton.click();
    await page.waitForFunction(() => document.getElementById("l1-copy")?.textContent === "Copied");

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    assert.equal(clipboardText, commandText, "the Copy button must copy the exact command shown");

    await page.waitForFunction(
      (label) => document.getElementById("l1-copy")?.textContent === label,
      restLabel,
      { timeout: 3000 },
    );
  } finally {
    await browser.close();
  }
});
