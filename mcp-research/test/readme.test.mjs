// The README's Tools table names exactly the tools the real server lists over stdio: a tool added,
// renamed or removed without its row fails here, naming the side that lacks it. No network: listing
// tools reads nothing from canlicapital.com.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function listToolNames() {
  const client = new Client({ name: "readme-test", version: "1" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [resolve(ROOT, "src/server.mjs")] }));
  try {
    return (await client.listTools()).tools.map((t) => t.name);
  } finally {
    await client.close();
  }
}

// The first column of the table under "## Tools": one backticked tool name per row, header and
// separator skipped. The table ends at the first blank line or heading after it.
export function readmeToolNames(markdown) {
  const lines = markdown.split("\n");
  const start = lines.findIndex((l) => /^##\s+Tools\s*$/.test(l));
  assert.notEqual(start, -1, 'README has no "## Tools" heading');
  const names = [];
  let inTable = false;
  for (const line of lines.slice(start + 1)) {
    if (/^#/.test(line) || (inTable && line.trim() === "")) break;
    if (!line.startsWith("|")) continue;
    inTable = true;
    const first = line.split("|")[1]?.trim() ?? "";
    if (/^-+$/.test(first) || first === "Tool") continue;
    const m = /^`([^`]+)`$/.exec(first);
    assert.ok(m, `Tools table row does not start with a backticked tool name: ${line}`);
    names.push(m[1]);
  }
  assert.ok(names.length > 0, "the Tools table is empty");
  return names;
}

test("the README's Tools table matches the tools the server lists", async () => {
  const documented = readmeToolNames(readFileSync(resolve(ROOT, "README.md"), "utf8"));
  const served = await listToolNames();
  const missingFromReadme = served.filter((n) => !documented.includes(n));
  const missingFromServer = documented.filter((n) => !served.includes(n));
  const duplicated = documented.filter((n, i) => documented.indexOf(n) !== i);
  assert.deepEqual(
    { missingFromReadme, missingFromServer, duplicated },
    { missingFromReadme: [], missingFromServer: [], duplicated: [] },
    [
      missingFromReadme.length ? `served but not in the README's Tools table: ${missingFromReadme.join(", ")}` : "",
      missingFromServer.length ? `in the README's Tools table but not served: ${missingFromServer.join(", ")}` : "",
      duplicated.length ? `listed twice in the Tools table: ${duplicated.join(", ")}` : "",
    ].filter(Boolean).join("; "),
  );
});

test("the table parser reads only the Tools table, and reports a dropped or renamed row", () => {
  const md = [
    "# x", "", "## Tools", "", "| Tool | Reads | Returns |", "|---|---|---|",
    "| `alpha` | a | b |", "| `beta` | c | d |", "", "## Prompts and resources", "",
    "| Prompt | What it answers |", "|---|---|", "| `not_a_tool` | e |",
  ].join("\n");
  assert.deepEqual(readmeToolNames(md), ["alpha", "beta"]);
  assert.deepEqual(readmeToolNames(md.replace("| `beta` | c | d |\n", "")), ["alpha"]);
  assert.deepEqual(readmeToolNames(md.replace("`beta`", "`gamma`")), ["alpha", "gamma"]);
  assert.throws(() => readmeToolNames(md.replace("## Tools", "## Tool list")), /no "## Tools" heading/);
});
