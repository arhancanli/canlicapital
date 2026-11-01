#!/usr/bin/env node
// canli-broker: send an order file you have read to your own broker account, from your own machine.
// Answers are read from the terminal itself, never from piped input, so another program cannot confirm.
import { closeSync, mkdirSync, openSync, readSync, realpathSync, writeFileSync, writeSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { makeHttp } from "./http.mjs";
import { BROKERS, run, STOP_FILE } from "./send.mjs";
import { Refused } from "./util.mjs";

const USAGE = `canli-broker check orders.json --broker <${Object.keys(BROKERS).join("|")}> [--live]
canli-broker send  orders.json --broker <name> [--live] [--limits file] [--yes] [--unknown-not-placed]
canli-broker stop     stop all sending from this machine until you delete the stop file

Paper unless you pass --live. Live also needs your limits file, and you type a confirmation each time.`;

export function terminalAsk(question, expected) {
  let tty;
  try { tty = openSync("/dev/tty", "r+"); } catch { throw new Refused("A person has to confirm at a terminal, and there is none here. Nothing was sent."); }
  try {
    writeSync(tty, question);
    const buffer = Buffer.alloc(256), n = readSync(tty, buffer, 0, 256, null);
    return buffer.toString("utf8", 0, n).trim() === expected;
  } finally { closeSync(tty); }
}

export async function main(argv, env = process.env) {
  const [command, ...rest] = argv;
  const home = env.CANLI_HOME || join(homedir(), ".canli");
  if (command === "stop") {
    mkdirSync(home, { recursive: true, mode: 0o700 });
    writeFileSync(join(home, STOP_FILE), `Stopped ${new Date().toISOString()}\n`);
    process.stdout.write(`Stopped. Nothing will be sent until you delete ${join(home, STOP_FILE)}.\n`);
    return 0;
  }
  if (command !== "check" && command !== "send") { process.stdout.write(`${USAGE}\n`); return command ? 2 : 0; }
  const flag = (name) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; };
  const has = (name) => rest.includes(name);
  const file = rest[0] && !rest[0].startsWith("--") ? rest[0] : null;
  if (!file) { process.stdout.write(`${USAGE}\n`); return 2; }
  try {
    await run({ command, file, broker: flag("--broker"), live: has("--live"), limitsFile: flag("--limits"), yes: has("--yes"), unknownNotPlaced: has("--unknown-not-placed"), env, home, http: makeHttp(env), ask: async (q, want) => terminalAsk(q, want), print: (line) => process.stdout.write(`${line}\n`) });
    return 0;
  } catch (err) {
    process.stderr.write(`${err instanceof Refused ? err.message : `Stopped: ${err.message}`}\n`);
    return 1;
  }
}

const isMain = (() => { try { return realpathSync(process.argv[1] ?? "") === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (isMain) process.exitCode = await main(process.argv.slice(2));
