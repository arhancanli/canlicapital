// workers/canli-mcp/build.mjs
//
// Bundles the Worker. The npm packages read small files next to their own modules when they load
// (package.json for the version, the tool index, guides, receipt keys, the strategy hub, the view
// scripts). A Worker has no such files, so this build writes each one into the bundle as text, at
// the place it is read, and gives every module a valid file URL of its own for the checks that ask
// "was I started directly?" (they all answer no). Nothing else in the packages changes.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ESBUILD = process.env.ESBUILD ?? new URL("../../../cirrun/waitlist/node_modules/esbuild/lib/main.js", `file://${process.env.HOME}/x/`).pathname;
const esbuild = await import(ESBUILD);
const HERE = dirname(fileURLToPath(import.meta.url));

const literal = (s) => JSON.stringify(s);

function inlineFiles(source, file) {
  const dir = dirname(file);
  let out = source;
  // readFileSync(new URL("./name", import.meta.url), "utf8") -> the file's text
  out = out.replace(/readFileSync\(new URL\("([^"]+)", import\.meta\.url\), "utf8"\)/g, (_, rel) => literal(readFileSync(join(dir, rel), "utf8")));
  // view.mjs reads its scripts by name: give it every file it names in code("...") calls
  if (/const code = \(file\) => readFileSync\(new URL\(file, import\.meta\.url\), "utf8"\)/.test(out)) {
    const names = [...new Set([...out.matchAll(/code\("([^"]+)"\)/g)].map((m) => m[1]))];
    const files = Object.fromEntries(names.map((n) => [n, readFileSync(join(dir, n), "utf8")]));
    out = `const __CANLI_FILES = ${literal(files)};\n` + out.replace("readFileSync(new URL(file, import.meta.url), \"utf8\")", "__CANLI_FILES[file]");
  }
  // hub.mjs reads its strategy shelf from ./hub/
  if (/const DIR = new URL\("\.\/hub\/", import\.meta\.url\);/.test(out)) {
    const hubDir = join(dir, "hub");
    const files = Object.fromEntries(readdirSync(hubDir).filter((n) => statSync(join(hubDir, n)).isFile()).map((n) => [n, readFileSync(join(hubDir, n), "utf8")]));
    out = `const __CANLI_HUB = ${literal(files)};\n` + out.replace(/readFileSync\(new URL\(([^,()]+), DIR\), "utf8"\)/g, (_, expr) => `__CANLI_HUB[${expr}]`);
  }
  // Workers' fetch takes redirect "follow" or "manual", not "error". "manual" keeps the rule: a redirect
  // is never followed; it comes back as a 3xx response, which every caller treats as a failed fetch.
  out = out.replaceAll('redirect: "error"', 'redirect: "manual"');
  // Workers' zlib takes maxOutputLength up to 128 MiB, the memory a Worker has in all; a larger cap
  // is refused outright, so unpacking is held to 128 MiB here.
  out = out.replace(/maxOutputLength: ([A-Z_]+)/g, "maxOutputLength: Math.min($1, 134217728)");
  // Every other import.meta.url: this module's own file URL, so URL arithmetic stays valid.
  return out.replaceAll("import.meta.url", literal(pathToFileURL(file).href));
}

const builtins = new Set(builtinModules.flatMap((m) => [m, `node:${m}`]));
const workerPlugin = {
  name: "canli-worker",
  setup(build) {
    build.onResolve({ filter: /.*/ }, (args) => (builtins.has(args.path) ? { path: args.path.startsWith("node:") ? args.path : `node:${args.path}`, external: true } : undefined));
    build.onLoad({ filter: /node_modules[\\/]canli-[^\\/]+[\\/](?:src|local)[\\/].*\.m?js$/ }, (args) => {
      const source = readFileSync(args.path, "utf8");
      return /import\.meta\.url|redirect: "error"|maxOutputLength/.test(source) ? { contents: inlineFiles(source, args.path), loader: "js", resolveDir: dirname(args.path) } : undefined;
    });
  },
};

const result = await esbuild.build({
  entryPoints: [join(HERE, "src/index.mjs")],
  outfile: join(HERE, "dist/worker.mjs"),
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  mainFields: ["browser", "module", "main"],
  conditions: ["workerd", "worker", "browser", "import", "default"],
  plugins: [workerPlugin],
  metafile: true,
  logLevel: "warning",
});
const left = Object.keys(result.metafile.inputs).filter((f) => /canli-.*\/(?:src|local)\//.test(f) && /import\.meta\.url/.test(readFileSync(join(HERE, f), "utf8")));
console.log(`built dist/worker.mjs (${Math.round(statSync(join(HERE, "dist/worker.mjs")).size / 1024)} KiB); modules rewritten: ${left.length}`);
