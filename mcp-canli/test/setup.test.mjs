// canli-mcp setup: each MCP client found gets one "canli" entry and keeps the rest of its file, a copy of
// each changed file is kept, a file with comments is left alone, a second run changes nothing, --dry-run
// writes nothing and --remove takes the entry out again.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { formatSetup, setupClients } from "../local/setup.mjs";

const NOW = Date.parse("2026-11-04T12:00:00Z");
function machine() {
  const home = mkdtempSync(path.join(tmpdir(), "canli-setup-"));
  const at = (p) => path.join(home, p);
  mkdirSync(at("Library/Application Support/Claude"), { recursive: true });
  writeFileSync(at("Library/Application Support/Claude/claude_desktop_config.json"), JSON.stringify({ mcpServers: { other: { command: "other-server" } }, theme: "dark" }));
  mkdirSync(at(".cursor"));
  mkdirSync(at("Library/Application Support/Code/User"), { recursive: true });
  mkdirSync(at(".gemini"));
  writeFileSync(at(".gemini/settings.json"), "{\n  // my settings\n  \"theme\": \"x\"\n}\n");
  mkdirSync(at(".kiro"));
  mkdirSync(at(".codex"));
  writeFileSync(at(".codex/config.toml"), "model = \"o5\"\n\n[mcp_servers.other]\ncommand = \"other\"\n");
  return { home, at };
}

test("setup adds one entry to each client found, keeps the rest, copies what it changes, and leaves a file with comments alone", () => {
  const { home, at } = machine();
  const r = setupClients({ home, platform: "darwin", now: NOW });
  const status = Object.fromEntries(r.clients.map((c) => [c.client, c.status]));
  assert.equal(status["Claude Desktop"], "added");
  assert.equal(status.Cursor, "added");
  assert.equal(status["VS Code"], "added");
  assert.equal(status.Kiro, "added");
  assert.equal(status["Codex CLI"], "added");
  assert.match(status["Gemini CLI"], /^left alone: the file is not plain JSON/);
  assert.equal(status.Windsurf, "not found");
  const claude = JSON.parse(readFileSync(at("Library/Application Support/Claude/claude_desktop_config.json"), "utf8"));
  assert.deepEqual(claude, { mcpServers: { other: { command: "other-server" }, canli: { command: "npx", args: ["-y", "canli-mcp"] } }, theme: "dark" });
  assert.deepEqual(JSON.parse(readFileSync(at("Library/Application Support/Code/User/mcp.json"), "utf8")), { servers: { canli: { type: "stdio", command: "npx", args: ["-y", "canli-mcp"] } } }, "VS Code's own key and type");
  assert.deepEqual(JSON.parse(readFileSync(at(".kiro/settings/mcp.json"), "utf8")).mcpServers.canli.args, ["-y", "canli-mcp"]);
  assert.equal(readFileSync(at(".codex/config.toml"), "utf8"), "model = \"o5\"\n\n[mcp_servers.other]\ncommand = \"other\"\n\n[mcp_servers.canli]\ncommand = \"npx\"\nargs = [\"-y\", \"canli-mcp\"]\n");
  assert.equal(readFileSync(at(".gemini/settings.json"), "utf8"), "{\n  // my settings\n  \"theme\": \"x\"\n}\n", "untouched");
  assert.deepEqual(r.clients.find((c) => c.client === "Gemini CLI").add_by_hand, { mcpServers: { canli: { command: "npx", args: ["-y", "canli-mcp"] } } });
  const copies = readdirSync(at("Library/Application Support/Claude")).filter((f) => f.includes(".canli-backup-"));
  assert.deepEqual(copies, ["claude_desktop_config.json.canli-backup-20261104-120000"]);
  assert.match(formatSetup(r), /✓ Cursor: added/);
  const again = setupClients({ home, platform: "darwin", now: NOW + 1000 });
  assert.ok(again.clients.filter((c) => c.status !== "not found" && c.client !== "Gemini CLI").every((c) => c.status === "already set up"), JSON.stringify(again.clients));
});

test("setup --dry-run writes nothing, --only picks clients, --remove takes the entry out, and a different entry is never replaced", () => {
  const { home, at } = machine();
  const before = readFileSync(at("Library/Application Support/Claude/claude_desktop_config.json"), "utf8");
  const dry = setupClients({ home, platform: "darwin", argv: ["--dry-run"], now: NOW });
  assert.equal(dry.clients.find((c) => c.client === "Cursor").status, "would add");
  assert.equal(readFileSync(at("Library/Application Support/Claude/claude_desktop_config.json"), "utf8"), before);
  assert.deepEqual(readdirSync(at(".cursor")), [], "no file made");
  const only = setupClients({ home, platform: "darwin", argv: ["--only", "cursor,codex"], now: NOW });
  assert.deepEqual(only.clients.map((c) => [c.client, c.status]), [["Cursor", "added"], ["Codex CLI", "added"]]);
  const removed = setupClients({ home, platform: "darwin", argv: ["--remove", "--only", "cursor,codex"], now: NOW + 1000 });
  assert.deepEqual(removed.clients.map((c) => c.status), ["removed", "removed"]);
  assert.deepEqual(JSON.parse(readFileSync(at(".cursor/mcp.json"), "utf8")), { mcpServers: {} });
  assert.equal(readFileSync(at(".codex/config.toml"), "utf8"), "model = \"o5\"\n\n[mcp_servers.other]\ncommand = \"other\"\n\n", "the other server's section stays");
  writeFileSync(at(".cursor/mcp.json"), JSON.stringify({ mcpServers: { canli: { command: "node", args: ["my-fork.mjs"] } } }));
  assert.match(setupClients({ home, platform: "darwin", argv: ["--only", "cursor"], now: NOW }).clients[0].status, /left alone: it already has a different "canli" entry/);
  assert.throws(() => setupClients({ home, argv: ["--only", "notepad"] }), /no client notepad/);
});
