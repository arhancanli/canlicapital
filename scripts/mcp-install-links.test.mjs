import assert from "node:assert/strict";
import test from "node:test";

import { cursorInstallLink, HOSTED_MCP_URL, vscodeAddCommand } from "./lib/mcp-install-links.mjs";

test("the Cursor install link carries the hosted endpoint as base64 server JSON", () => {
  const link = new URL(cursorInstallLink());
  assert.equal(link.protocol, "cursor:");
  assert.equal(link.host, "anysphere.cursor-deeplink");
  assert.equal(link.pathname, "/mcp/install");
  assert.equal(link.searchParams.get("name"), "canli-validation");
  const config = JSON.parse(Buffer.from(link.searchParams.get("config"), "base64").toString("utf8"));
  assert.deepEqual(config, { url: HOSTED_MCP_URL });
});

test("the VS Code command registers the hosted endpoint over HTTP", () => {
  const json = vscodeAddCommand().match(/^code --add-mcp '(.*)'$/)[1];
  assert.deepEqual(JSON.parse(json), { name: "canli-validation", type: "http", url: HOSTED_MCP_URL });
});

test("the Claude Desktop link serves the latest release's stable bundle name", async () => {
  const { CLAUDE_DESKTOP_BUNDLE_URL } = await import("./lib/mcp-install-links.mjs");
  const url = new URL(CLAUDE_DESKTOP_BUNDLE_URL);
  assert.equal(url.host, "github.com");
  assert.equal(url.pathname, "/arhancanli/canli-validation-mcp/releases/latest/download/canli-validation.mcpb");
});
