// `canli-mcp setup`: adds canli-mcp to every MCP client found on this machine in one step. A client is
// found when its own folder exists; its config file gets one entry, "canli", and keeps everything else.
// Each file it changes is copied first, beside itself. A file that is not plain JSON (one with comments) is
// left alone, with the entry to add by hand. --dry-run shows what would change, --only picks clients, and
// --remove takes the entry out again.
import { copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const NPX = { command: "npx", args: ["-y", "canli-mcp"] };
// root: the folder whose presence shows the client is installed; dir: where its MCP config lives.
const PER_OS = (darwin, win32, linux) => ({ darwin, win32, linux });
export const CLIENTS = Object.freeze([
  { id: "claude-desktop", name: "Claude Desktop", root: PER_OS("Library/Application Support/Claude", "AppData/Roaming/Claude", ".config/Claude"), file: "claude_desktop_config.json", key: "mcpServers" },
  { id: "cursor", name: "Cursor", root: ".cursor", file: "mcp.json", key: "mcpServers" },
  { id: "windsurf", name: "Windsurf", root: ".codeium/windsurf", file: "mcp_config.json", key: "mcpServers" },
  { id: "vscode", name: "VS Code", root: PER_OS("Library/Application Support/Code/User", "AppData/Roaming/Code/User", ".config/Code/User"), file: "mcp.json", key: "servers", entry: { type: "stdio", ...NPX } },
  { id: "gemini", name: "Gemini CLI", root: ".gemini", file: "settings.json", key: "mcpServers" },
  { id: "kiro", name: "Kiro", root: ".kiro", dir: ".kiro/settings", file: "mcp.json", key: "mcpServers" },
  { id: "lmstudio", name: "LM Studio", root: ".lmstudio", file: "mcp.json", key: "mcpServers" },
  { id: "amazonq", name: "Amazon Q Developer", root: ".aws/amazonq", file: "mcp.json", key: "mcpServers" },
  { id: "codex", name: "Codex CLI", root: ".codex", file: "config.toml", toml: true },
]);

const exists = (p) => { try { statSync(p); return true; } catch { return false; } };
const pathFor = (v, platform) => (typeof v === "string" ? v : v?.[platform] ?? null);
const stamp = (now) => new Date(now).toISOString().replace(/[-:]/g, "").replace(/\..*$/, "").replace("T", "-");
const tomlEntry = (name) => `[mcp_servers.${name}]\ncommand = "npx"\nargs = ["-y", "canli-mcp"]\n`;

function backup(file, now) {
  const copy = `${file}.canli-backup-${stamp(now)}`;
  copyFileSync(file, copy);
  return copy;
}

// One client: what is there, and what to do. Returns a row for the report.
function one(client, { home, platform, name, remove, dryRun, now }) {
  const root = pathFor(client.root, platform);
  if (!root || !exists(join(home, root))) return { client: client.name, status: "not found" };
  const dir = join(home, pathFor(client.dir, platform) ?? root), file = join(dir, client.file);
  const had = exists(file), text = had ? readFileSync(file, "utf8") : "";
  if (client.toml) {
    const header = new RegExp(`^\\[mcp_servers\\.${name}\\]\\s*$`, "m");
    if (remove) {
      if (!header.test(text)) return { client: client.name, status: "not set up", file };
      if (dryRun) return { client: client.name, status: "would remove", file };
      const kept = text.replace(new RegExp(`\\n?\\[mcp_servers\\.${name}\\]\\n(?:(?!\\[)[^\\n]*\\n?)*`), "\n");
      const copy = backup(file, now);
      writeFileSync(file, kept);
      return { client: client.name, status: "removed", file, backup: copy };
    }
    if (header.test(text)) return { client: client.name, status: "already set up", file };
    if (dryRun) return { client: client.name, status: "would add", file };
    const copy = had ? backup(file, now) : null;
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, `${text}${text && !text.endsWith("\n") ? "\n" : ""}${text ? "\n" : ""}${tomlEntry(name)}`);
    return { client: client.name, status: "added", file, ...(copy ? { backup: copy } : {}) };
  }
  let json = {};
  if (text.trim()) {
    try { json = JSON.parse(text); } catch { return { client: client.name, status: "left alone: the file is not plain JSON (it may hold comments)", file, add_by_hand: { [client.key]: { [name]: client.entry ?? NPX } } }; }
    if (!json || typeof json !== "object" || Array.isArray(json)) return { client: client.name, status: "left alone: the file is not a JSON object", file };
  }
  const servers = json[client.key] && typeof json[client.key] === "object" ? json[client.key] : {};
  const want = client.entry ?? NPX;
  if (remove) {
    if (!servers[name]) return { client: client.name, status: "not set up", file };
    if (dryRun) return { client: client.name, status: "would remove", file };
    const copy = backup(file, now);
    delete servers[name];
    writeFileSync(file, `${JSON.stringify({ ...json, [client.key]: servers }, null, 2)}\n`);
    return { client: client.name, status: "removed", file, backup: copy };
  }
  if (JSON.stringify(servers[name]) === JSON.stringify(want)) return { client: client.name, status: "already set up", file };
  if (servers[name]) return { client: client.name, status: `left alone: it already has a different "${name}" entry`, file };
  if (dryRun) return { client: client.name, status: "would add", file };
  const copy = had ? backup(file, now) : null;
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, `${JSON.stringify({ ...json, [client.key]: { ...servers, [name]: want } }, null, 2)}\n`);
  return { client: client.name, status: "added", file, ...(copy ? { backup: copy } : {}) };
}

// The report as a person reads it in a terminal.
export function formatSetup(r) {
  const lines = r.clients.map((c) => `${/^(added|removed|already set up)$/.test(c.status) ? "✓" : c.status === "not found" ? " " : /^would/.test(c.status) ? "→" : "!"} ${c.client}: ${c.status}${c.file && c.status !== "not found" ? `  ${c.file}` : ""}${c.backup ? `\n    copy of the old file: ${c.backup}` : ""}${c.add_by_hand ? `\n    add by hand: ${JSON.stringify(c.add_by_hand)}` : ""}`);
  return `${lines.join("\n")}\n\n${r.next.join("\n")}\n`;
}

export function setupClients({ home, platform = process.platform, argv = [], now = Date.now() }) {
  const flag = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
  const only = flag("--only")?.split(",").map((s) => s.trim()).filter(Boolean);
  const name = flag("--name") ?? "canli";
  if (!/^[a-z][a-z0-9_-]{0,31}$/.test(name)) throw new Error(`--name takes lowercase letters, digits, - and _, not "${name}".`);
  const unknown = only?.filter((id) => !CLIENTS.some((c) => c.id === id));
  if (unknown?.length) throw new Error(`--only: no client ${unknown.join(", ")}. Clients: ${CLIENTS.map((c) => c.id).join(", ")}.`);
  const opts = { home, platform, name, remove: argv.includes("--remove"), dryRun: argv.includes("--dry-run"), now };
  const clients = CLIENTS.filter((c) => !only || only.includes(c.id)).map((c) => one(c, opts));
  const changed = clients.filter((c) => /^(added|removed)$/.test(c.status)).length;
  return {
    clients,
    next: [
      changed ? "Restart each client that changed; canli-mcp is then in its tool list." : opts.dryRun ? "Run again without --dry-run to make these changes." : "Nothing changed.",
      "Claude Code: claude mcp add canli -s user -- npx -y canli-mcp",
      "claude.ai, ChatGPT and other web clients: add https://canlicapital.com/mcp/canli as a connector.",
    ],
  };
}
