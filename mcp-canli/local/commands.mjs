// The only two places this server starts anything, and each only when a person asks on the command line.
//
// --exec runs the command they named. It gets the block on standard input and the rule's id in its
// environment. Nothing from an event goes on its command line, so an event cannot change what runs.
import { spawn, spawnSync } from "node:child_process";

import { asBlock } from "../src/sentinel.mjs";

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
