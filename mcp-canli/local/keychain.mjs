// `canli-mcp connect <provider or VARIABLE>`: your API keys in the operating system's keychain (macOS Keychain, or the
// Secret Service on Linux through secret-tool), never in a file or a prompt to a model. A key is read from a hidden
// prompt or from stdin, never from the command line, where other processes could see it. CANLI_HOME/keychain.json
// lists the names stored, never a value; when canli-mcp starts it reads those names from the keychain into its own
// environment, and a variable already set wins. Windows has no keychain command line that can read a secret back, so
// there it says to set the variable instead.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { keychainCommand } from "./commands.mjs";
import { PRESETS } from "./upstream.mjs";

const SERVICE = "canli-mcp";
const NAME = /^[A-Z][A-Z0-9_]{2,63}$/;
// What each provider's key goes under: the variables canli-mcp and its packs read.
export const PROVIDERS = Object.freeze({
  massive: { names: ["MASSIVE_API_KEY"], about: "Massive (formerly Polygon.io): US stock trades streamed" },
  polygon: { names: ["MASSIVE_API_KEY"], about: "the same as massive" },
  alpaca: { names: ["ALPACA_API_KEY_ID", "ALPACA_API_SECRET_KEY"], about: "Alpaca: US stock prices and trades streamed" },
  finnhub: { names: ["FINNHUB_API_KEY"], about: "Finnhub: US stock trades streamed" },
  tiingo: { names: ["TIINGO_API_KEY"], about: "Tiingo: US stock prices" },
  ...Object.fromEntries(Object.entries(PRESETS).map(([id, p]) => [id, { names: [...new Set(JSON.stringify(p).match(/\$\{([A-Z][A-Z0-9_]*)\}/g) ?? [])].map((v) => v.slice(2, -1)), about: p.about }]).filter(([, p]) => p.names.length)),
});

export const USAGE = `usage:
  canli-mcp connect <provider>      ${Object.keys(PROVIDERS).join(", ")}
  canli-mcp connect <VARIABLE>      any variable canli-mcp or an upstream reads, e.g. FMP_API_KEY
  canli-mcp connect --list          the names stored (never a value)
  canli-mcp disconnect <provider or VARIABLE>
The key is asked for with nothing shown, or read from stdin: printf %s "$KEY" | canli-mcp connect finnhub`;

const listFile = (home) => join(home, "keychain.json");
export const storedNames = (home) => { try { return JSON.parse(readFileSync(listFile(home), "utf8")).names.filter((n) => NAME.test(n)); } catch { return []; } };
const saveNames = (home, names) => {
  mkdirSync(home, { recursive: true, mode: 0o700 });
  writeFileSync(listFile(home), `${JSON.stringify({ about: "Names of the keys canli-mcp keeps in this machine's keychain; never a value.", names: [...new Set(names)].sort() }, null, 1)}\n`, { mode: 0o600 });
};

// The keychain of this platform: store, read and remove one secret by name. Secrets go through stdin only.
export function keychain({ platform = process.platform, spawn = keychainCommand } = {}) {
  if (platform === "darwin") {
    // security's interactive mode reads its command from stdin, so the key is never in an argument list. Its parser
    // takes double-quoted words; a key with a quote, backslash or space in it is refused rather than mangled.
    return {
      name: "the macOS Keychain",
      store(name, value) {
        if (!/^[\x21-\x7e]+$/.test(value) || /["\\]/.test(value)) throw new Error("This key has a space, quote or backslash in it, which the macOS keychain command cannot take safely; set the variable instead.");
        const r = spawn("/usr/bin/security", ["-i"], `add-generic-password -U -s ${SERVICE} -a ${name} -l "${SERVICE} ${name}" -w "${value}"\n`);
        if (r.status !== 0 || /error|could not/i.test(r.stderr + r.stdout)) throw new Error(`The macOS keychain did not take ${name}: ${(r.stderr || r.stdout).trim().slice(0, 200)}`);
      },
      read(name) {
        const r = spawn("/usr/bin/security", ["find-generic-password", "-s", SERVICE, "-a", name, "-w"]);
        return r.status === 0 ? r.stdout.replace(/\n$/, "") : null;
      },
      remove(name) { spawn("/usr/bin/security", ["delete-generic-password", "-s", SERVICE, "-a", name]); },
    };
  }
  if (platform === "linux") {
    const attrs = (name) => ["service", SERVICE, "name", name];
    return {
      name: "the Secret Service (secret-tool)",
      store(name, value) {
        const r = spawn("secret-tool", ["store", `--label=${SERVICE} ${name}`, ...attrs(name)], value);
        if (r.status !== 0) throw new Error(`secret-tool did not take ${name}${r.status === -1 ? " (is libsecret-tools installed?)" : ""}: ${r.stderr.trim().slice(0, 200)}`);
      },
      read(name) {
        const r = spawn("secret-tool", ["lookup", ...attrs(name)]);
        return r.status === 0 && r.stdout ? r.stdout.replace(/\n$/, "") : null;
      },
      remove(name) { spawn("secret-tool", ["clear", ...attrs(name)]); },
    };
  }
  return null;
}

// The variables a provider or a name stands for.
export function namesFor(what) {
  const p = PROVIDERS[String(what ?? "").toLowerCase()];
  if (p) return p.names;
  if (NAME.test(String(what ?? ""))) return [what];
  throw new Error(`No provider or variable "${what}".\n${USAGE}`);
}

// When the server starts: each stored name not already set, read into env. Returns the names read.
export function loadKeys(env, home, { chain = keychain() } = {}) {
  if (!existsSync(listFile(home)) || !chain) return [];
  const loaded = [];
  for (const name of storedNames(home)) {
    if (env[name]) continue;
    const value = chain.read(name);
    if (value) { env[name] = value; loaded.push(name); }
  }
  return loaded;
}

// connect: ask(name) gives each key (hidden prompt or stdin); disconnect forgets them.
export async function connectCommand(home, argv, { chain = keychain(), ask, env = process.env } = {}) {
  const [what] = argv;
  if (!what || what === "--help") return { usage: USAGE };
  if (what === "--list") return { keychain: chain?.name ?? "none on this platform", stored: storedNames(home), providers: Object.fromEntries(Object.entries(PROVIDERS).map(([id, p]) => [id, p.names])) };
  if (!chain) throw new Error(`This platform has no keychain canli-mcp can read back. Set ${namesFor(what).join(" and ")} in the environment of the MCP client's canli entry instead.`);
  const names = namesFor(what);
  const done = [];
  for (const name of names) {
    const value = String(await ask(name) ?? "").trim();
    if (!value) throw new Error(`No value given for ${name}; nothing stored${done.length ? ` after ${done.join(", ")}` : ""}.`);
    chain.store(name, value);
    done.push(name);
    saveNames(home, [...storedNames(home), name]);
  }
  const shadowed = names.filter((n) => env[n]);
  return { stored: done, in: chain.name, ...(shadowed.length ? { note: `${shadowed.join(", ")} is also set in this environment, and a set variable wins over the keychain.` } : {}), next: "Restart your MCP client (or canli-mcp) and it reads the keys from the keychain." };
}

export function disconnectCommand(home, argv, { chain = keychain() } = {}) {
  const names = namesFor(argv[0]);
  for (const name of names) chain?.remove(name);
  saveNames(home, storedNames(home).filter((n) => !names.includes(n)));
  return { removed: names, from: chain?.name ?? "the list (no keychain on this platform)" };
}

// A key typed with nothing shown, or read from stdin when it is not a terminal (one line per key).
export function askHidden({ stdin = process.stdin, stderr = process.stderr } = {}) {
  let lines = null;
  return (name) => new Promise((resolve, reject) => {
    if (!stdin.isTTY) {
      const take = () => resolve(lines.shift() ?? "");
      if (lines) return take();
      let text = "";
      stdin.setEncoding("utf8");
      stdin.on("data", (d) => { text += d; });
      stdin.on("end", () => { lines = text.split(/\r?\n/); take(); });
      stdin.on("error", reject);
      return;
    }
    stderr.write(`${name} (nothing is shown as you type): `);
    let value = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") { stdin.setRawMode(false); stdin.pause(); stdin.off("data", onData); stderr.write("\n"); return resolve(value); }
        if (ch === "\u0003") { stdin.setRawMode(false); stderr.write("\n"); return reject(new Error("Stopped; nothing stored.")); }
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on("data", onData);
  });
}
