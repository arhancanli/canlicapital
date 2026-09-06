import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { chromium } from "playwright";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = resolve(ROOT, "public/system-films");
const STATE_PATH = resolve(OUTPUT, "state.json");
const RENDER_TEMPLATE = resolve(ROOT, "tools/system-films/composition.template");
const RENDER_HTML = resolve(ROOT, "tools/system-films/composition-render.tmp.html");
const FILM_IDS = ["engine", "broker", "record"];
const DURATION = 12;
const FPS = 24;
const PORT = Number(process.env.CANLI_FILM_RENDER_PORT || 4186);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.on("error", reject);
    child.on("exit", (code) => code === 0
      ? resolvePromise()
      : reject(new Error(`${command} exited with ${code}`)));
  });
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 125));
  }
  throw new Error(`renderer server did not start at ${url}`);
}

async function fileRecord(path) {
  const bytes = await readFile(path);
  const info = await stat(path);
  return { bytes: info.size, sha256: sha256(bytes) };
}

if (!ffmpegPath) throw new Error("ffmpeg-static did not provide a binary for this platform");
const stateBytes = await readFile(STATE_PATH);
const state = JSON.parse(stateBytes);
const temp = await mkdtemp(join(tmpdir(), "canli-system-films-"));
await mkdir(OUTPUT, { recursive: true });
await writeFile(RENDER_HTML, await readFile(RENDER_TEMPLATE));

const vite = spawn(
  process.execPath,
  [resolve(ROOT, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
  { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] },
);
vite.stdout.on("data", () => {});
vite.stderr.on("data", (chunk) => process.stderr.write(chunk));

let browser;
try {
  await waitForServer(`http://127.0.0.1:${PORT}/tools/system-films/composition-render.tmp.html`);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

  const manifestFilms = [];
  for (const id of FILM_IDS) {
    const frames = resolve(temp, id);
    await mkdir(frames, { recursive: true });
    await page.goto(`http://127.0.0.1:${PORT}/tools/system-films/composition-render.tmp.html?film=${id}`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => window.__SYSTEM_FILM_READY__ === true);

    const frameCount = DURATION * FPS;
    for (let frame = 0; frame < frameCount; frame += 1) {
      await page.evaluate((seconds) => window.seekSystemFilm(seconds), frame / FPS);
      await page.screenshot({ path: resolve(frames, `${String(frame).padStart(4, "0")}.png`) });
      if ((frame + 1) % 96 === 0) console.log(`${id}: rendered ${frame + 1}/${frameCount} frames`);
    }

    await page.evaluate(() => window.seekSystemFilm(7.25));
    const poster = resolve(OUTPUT, `${id}-poster.png`);
    await page.screenshot({ path: poster });

    const webm = resolve(OUTPUT, `${id}.webm`);
    const mp4 = resolve(OUTPUT, `${id}.mp4`);
    const input = resolve(frames, "%04d.png");
    await run(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", "-framerate", String(FPS), "-i", input, "-an", "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "34", "-pix_fmt", "yuv420p", webm]);
    await run(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", "-framerate", String(FPS), "-i", input, "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "22", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4]);

    manifestFilms.push({
      id,
      duration_seconds: DURATION,
      frames_per_second: FPS,
      width: 1280,
      height: 720,
      silent: true,
      timestamp: state.films.find((film) => film.id === id).timestamp,
      files: {
        webm: { path: `/system-films/${id}.webm`, ...(await fileRecord(webm)) },
        h264: { path: `/system-films/${id}.mp4`, ...(await fileRecord(mp4)) },
        poster: { path: `/system-films/${id}-poster.png`, ...(await fileRecord(poster)) },
      },
    });
  }

  const manifest = {
    schema: "canli.system-films-manifest.v1",
    artifact_snapshot_at: state.snapshot_at,
    rendered_from_state_sha256: sha256(stateBytes),
    renderer: { duration_seconds: DURATION, frames_per_second: FPS, deterministic_seek: true },
    films: manifestFilms,
  };
  await writeFile(resolve(OUTPUT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`rendered ${manifestFilms.length} system films -> ${OUTPUT.replace(`${ROOT}/`, "")}`);
} finally {
  if (browser) await browser.close();
  vite.kill("SIGTERM");
  await rm(RENDER_HTML, { force: true });
  await rm(temp, { recursive: true, force: true });
}
