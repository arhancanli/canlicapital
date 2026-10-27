// Build a dependency-complete extension from a reviewed checkout. CI checks out its release tag.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(process.argv[2] ?? join(root, "dist"));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(root, "mcpb/manifest.json"), "utf8"));
if (manifest.version !== pkg.version) throw new Error("MCPB manifest and package versions differ.");
const stage = mkdtempSync(join(tmpdir(), "canli-flagship-mcpb-"));
try {
  for (const file of ["src", "package.json", "package-lock.json", "LICENSE", "README.md", "FEATURES.md", "CHANGELOG.md"]) cpSync(join(root, file), join(stage, file), { recursive: true });
  cpSync(join(root, "mcpb/manifest.json"), join(stage, "manifest.json"));
  execFileSync("npm", ["ci", "--omit=dev", "--ignore-scripts"], { cwd: stage, stdio: "inherit" });
  execFileSync("npx", ["--yes", "@anthropic-ai/mcpb@2.1.2", "validate", join(stage, "manifest.json")], { stdio: "inherit" });
  mkdirSync(output, { recursive: true });
  execFileSync("npx", ["--yes", "@anthropic-ai/mcpb@2.1.2", "pack", stage, join(output, `canli-mcp-${pkg.version}.mcpb`)], { stdio: "inherit" });
} finally {
  rmSync(stage, { recursive: true, force: true });
}
