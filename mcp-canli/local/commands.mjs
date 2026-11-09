// The only places this server starts anything, and each only when a person asks: on the command line,
// by naming an upstream server's command in their own upstreams file, or by keeping a key in the keychain with
// canli-mcp connect (the keychain's own command, with the key on stdin, never in an argument).
//
// --exec runs the command they named. It gets the block on standard input and the rule's id in its
// environment. Nothing from an event goes on its command line, so an event cannot change what runs.
import { spawn, spawnSync } from "node:child_process";

import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/client/stdio";

import { asBlock } from "../src/sentinel.mjs";

// An upstream MCP server that runs as a command (src/upstreams.mjs). It gets only the environment the
// MCP SDK passes by default (PATH, HOME, USER, SHELL, TERM and the like) and the variables its entry
// names, so no other key in this process's environment reaches it.
export function stdioTransport({ command, args = [], env = {} }) {
  return new StdioClientTransport({ command, args, env: { ...getDefaultEnvironment(), ...env }, stderr: "ignore" });
}

export function execSink(command, spawnImpl = spawn) {
  let queue = Promise.resolve();
  return (event) => {
    queue = queue.then(() => new Promise((done) => {
      const child = spawnImpl(command, { shell: true, stdio: ["pipe", "inherit", "inherit"], env: { ...process.env, CANLI_SENTINEL_RULE: event.rule } });
      child.on("error", () => done());
      child.on("close", () => done());
      child.stdin.on("error", () => {});
      child.stdin.end(asBlock(event));
    }));
    return queue;
  };
}

// canli-mcp models install: npm, for one pinned package, into its own folder. No tool ever calls this.
export function installPackage(dir, spec) {
  return spawnSync("npm", ["install", "--prefix", dir, "--no-audit", "--no-fund", "--silent", spec], { stdio: "inherit", shell: process.platform === "win32" }).status ?? 1;
}

// The OS keychain's command (local/keychain.mjs): /usr/bin/security on macOS, secret-tool on Linux. No shell; a
// secret goes on stdin only.
export function keychainCommand(command, args, input) {
  if (!["/usr/bin/security", "secret-tool"].includes(command)) throw new Error(`${command} is not a keychain command.`);
  const r = spawnSync(command, args, { input, encoding: "utf8", timeout: 15000 });
  return { status: r.error ? -1 : r.status, stdout: r.stdout ?? "", stderr: r.error ? String(r.error.message) : r.stderr ?? "" };
}

// canli-mcp lab build --shards n: this same command, once per shard, at once; resolves to the first non-zero exit.
export function runShards(entry, n, extra = []) {
  return Promise.all(Array.from({ length: n }, (_, i) => new Promise((done) => {
    const child = spawn(process.execPath, [entry, "lab", "shard", String(i), String(n), ...extra], { stdio: ["ignore", "inherit", "inherit"] });
    child.on("exit", (code) => done(code ?? 1));
  }))).then((codes) => codes.find((c) => c !== 0) ?? 0);
}
