// The three system-film posters ship as 1280x720 PNGs at 335 to 362 kB each,
// lazy-loaded on the homepage where they render at roughly 400 CSS px wide.
// This encodes a 960-wide WebP beside each PNG with the same ffmpeg-static
// binary render-system-films.mjs already depends on (no new dependency), and
// records it in public/system-films/manifest.json so scripts/verify-system-films.mjs
// can check its byte count and hash like every other film file.
//
// buildPosterWebp() operates on whatever poster PNG is already on disk, so it
// works two ways: standalone (this file run directly, against the currently
// published posters) and inline (render-system-films.mjs imports and calls it
// right after writing a fresh poster, so a full re-render never leaves the
// WebP stale).
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = resolve(ROOT, "public/system-films/manifest.json");
const POSTER_WIDTH = 960;
const QUALITY = 80;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolvePromise() : reject(new Error(`${command} exited with ${code}`))));
  });
}

async function fileRecord(path) {
  const bytes = await readFile(path);
  const info = await stat(path);
  return { bytes: info.size, sha256: sha256(bytes) };
}

export async function buildPosterWebp(pngPath) {
  if (!ffmpegPath) throw new Error("ffmpeg-static did not provide a binary for this platform");
  const webpPath = pngPath.replace(/\.png$/, ".webp");
  await run(ffmpegPath, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", pngPath,
    "-vf", `scale=${POSTER_WIDTH}:-1`,
    "-c:v", "libwebp", "-q:v", String(QUALITY),
    webpPath,
  ]);
  return { webpPath, record: await fileRecord(webpPath) };
}

async function main() {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  for (const film of manifest.films) {
    const pngPath = resolve(ROOT, "public", film.files.poster.path.replace(/^\//, ""));
    const { record } = await buildPosterWebp(pngPath);
    film.files.poster_webp = { path: `/system-films/${film.id}-poster.webp`, ...record };
    console.log(`${film.id}: poster.webp ${record.bytes} bytes (poster.png was ${film.files.poster.bytes})`);
  }
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
