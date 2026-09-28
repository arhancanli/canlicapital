// Writes mcp-released/<server>/: each MCP package's package.json, server.json and src/ exactly as
// they were at the release commit named in config/mcp-hosted-releases.json, plus RELEASE.json with
// the version, the commit and the sha256 of every file. The hosted handlers (api/mcp*.js) import
// only from here, so the hosted servers are the released packages, never work in progress.
// Needs git (the deploy build does not have it), so it runs by hand at each release and its output
// is committed; scripts/mcp-released.test.mjs checks the files against RELEASE.json.
//   node scripts/build-mcp-released.mjs
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const RELEASES = "config/mcp-hosted-releases.json";
export const OUT = "mcp-released";
const git = (...args) => execFileSync("git", ["-C", ROOT, ...args], { encoding: "buffer", maxBuffer: 1 << 28 });
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function releasedFiles(dir, commit) {
  const listed = git("ls-tree", "-r", "--name-only", commit, "--", `${dir}/package.json`, `${dir}/server.json`, `${dir}/src`).toString().split("\n").filter(Boolean);
  if (!listed.includes(`${dir}/package.json`) || !listed.some((p) => p.startsWith(`${dir}/src/`))) throw new Error(`${dir} at ${commit} has no package.json or src/`);
  return listed.map((path) => ({ path: path.slice(dir.length + 1), bytes: git("show", `${commit}:${path}`) }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { servers } = JSON.parse(readFileSync(resolve(ROOT, RELEASES), "utf8"));
  rmSync(resolve(ROOT, OUT), { recursive: true, force: true });
  for (const [name, release] of Object.entries(servers)) {
    const files = releasedFiles(release.dir, release.commit);
    const pkg = JSON.parse(files.find((f) => f.path === "package.json").bytes.toString("utf8"));
    if (pkg.name !== release.package || pkg.version !== release.version) throw new Error(`${name}: ${release.commit} has ${pkg.name}@${pkg.version}, not ${release.package}@${release.version}`);
    for (const f of files) {
      const target = resolve(ROOT, OUT, name, f.path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, f.bytes);
    }
    const manifest = { schema: "canli.mcp-released.v1", server: name, package: release.package, version: release.version, commit: release.commit, source_dir: release.dir, files: Object.fromEntries(files.map((f) => [f.path, sha256(f.bytes)]).sort(([a], [b]) => (a < b ? -1 : 1))) };
    writeFileSync(resolve(ROOT, OUT, name, "RELEASE.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`${OUT}/${name}: ${release.package}@${release.version} from ${release.commit.slice(0, 8)}, ${files.length} files`);
  }
}
