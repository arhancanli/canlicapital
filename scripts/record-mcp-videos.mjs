// Records short videos of canli-mcp's views as /mcp-servers plays them (js/mcp-demo.js): each
// demo full screen, with the clicks a person would make, saved as public/videos/canli-mcp/<id>.webm
// with a poster frame (<id>.jpg) and public/videos/canli-mcp/index.json (duration, size, recorded).
// The pages that show a video read index.json, so a video that was not recorded is not offered.
// Needs a built site served locally: npm run build && npx vite preview --port 4417, then
// node scripts/record-mcp-videos.mjs [http://localhost:4417] [id ...]
import { mkdirSync, statSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'public/videos/canli-mcp');
const [base = 'http://localhost:4417', ...only] = process.argv.slice(2);
const SIZE = { width: 1280, height: 720 };
// Playwright's own ffmpeg cuts the page load off the front (a stream copy: its encoder is far too
// slow to re-encode), so a video starts on the view.
const FFMPEG_DIR = resolve(homedir(), 'Library/Caches/ms-playwright');
const ffmpeg = () => { const d = readdirSync(FFMPEG_DIR).filter((n) => n.startsWith('ffmpeg-')).sort().at(-1); const dir = resolve(FFMPEG_DIR, d); return resolve(dir, readdirSync(dir).find((n) => n.startsWith('ffmpeg'))); };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// What a person does in each view: the controls the views really have (mcp-canli/src/view).
const sweep = async (page, y = 0.5) => { for (let x = 0.15; x <= 0.85; x += 0.05) { await page.mouse.move(SIZE.width * x, SIZE.height * y, { steps: 4 }); await pause(90); } };
const SCRIPTS = {
  market: async (page, view) => { await sweep(page, 0.35); await view.locator('button.mt').nth(2).click(); await pause(3000); await sweep(page, 0.55); },
  curve: async (page, view) => { await sweep(page, 0.5); await view.getByText('▶ Play').first().click(); await pause(7000); },
  compare: async (page) => { await sweep(page, 0.4); await sweep(page, 0.7); },
  statements: async (page) => { await sweep(page, 0.45); await page.mouse.wheel(0, 500); await pause(800); await sweep(page, 0.5); },
  surface: async (page) => { await sweep(page, 0.4); await sweep(page, 0.65); },
  chart: async (page) => { await sweep(page, 0.45); await page.mouse.wheel(0, 600); await pause(800); await sweep(page, 0.5); },
  backtest: async (page, view) => {
    const fast = view.locator('.sliders input[type=range]').first();
    await fast.focus();
    for (let i = 0; i < 6; i++) { await page.keyboard.press('ArrowLeft'); await pause(500); }
    await pause(1200);
    await view.locator('[data-b="luck"]').first().click({ timeout: 8000 });
    await pause(2500);
    await sweep(page, 0.6);
  },
};

const { demos } = JSON.parse(readFileSync(resolve(ROOT, 'public/demos/canli-mcp/index.json'), 'utf8'));
const indexPath = resolve(OUT, 'index.json');
let index = { videos: {} };
try { index = JSON.parse(readFileSync(indexPath, 'utf8')); } catch { /* the first recording starts the index */ }
mkdirSync(OUT, { recursive: true });
// The installed Google Chrome, so recording downloads no browser.
const browser = await chromium.launch({ channel: 'chrome' });
for (const { id } of demos) {
  if (only.length && !only.includes(id)) continue;
  const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: resolve(OUT, '.raw'), size: SIZE }, reducedMotion: 'no-preference' });
  // Full screen from the first paint, so the frames before the cut (a stream copy cuts at a
  // keyframe) already show the view rather than the page around it.
  await context.addInitScript(() => document.addEventListener('DOMContentLoaded', () => { document.querySelector('[data-mcp-demo]')?.classList.add('is-full'); document.documentElement.classList.add('mcp-demo-open'); }));
  const page = await context.newPage();
  const opened = Date.now();
  await page.goto(`${base}/mcp-servers`, { waitUntil: 'networkidle' });
  await page.locator(`[data-demo="${id}"]`).click();
  const frame = page.locator('.mcp-demo__frame iframe');
  await frame.waitFor();
  const view = page.frameLocator('.mcp-demo__frame iframe');
  await pause(1500);
  await pause(600);
  const from = (Date.now() - opened) / 1000;
  await page.screenshot({ path: resolve(OUT, `${id}.jpg`), type: 'jpeg', quality: 82 });
  await SCRIPTS[id](page, view);
  await pause(800);
  await context.close();
  const raw = await page.video().path();
  execFileSync(ffmpeg(), ['-y', '-loglevel', 'error', '-ss', from.toFixed(2), '-i', raw, '-an', '-c', 'copy', resolve(OUT, `${id}.webm`)]);
  rmSync(raw);
  // The clip's own length: the cut starts at the keyframe before the offset, so it runs longer.
  const probe = spawnSync(ffmpeg(), ['-hide_banner', '-i', resolve(OUT, `${id}.webm`)], { encoding: 'utf8' }).stderr.match(/Duration: (\d+):(\d+):([\d.]+)/);
  const seconds = Math.round((Number(probe[1]) * 3600 + Number(probe[2]) * 60 + Number(probe[3])) * 10) / 10;
  index.videos[id] = { file: `${id}.webm`, poster: `${id}.jpg`, seconds, bytes: statSync(resolve(OUT, `${id}.webm`)).size, recorded: new Date().toISOString().slice(0, 10), width: SIZE.width, height: SIZE.height };
  process.stdout.write(`${id}: ${seconds} s, ${index.videos[id].bytes} bytes\n`);
}
await browser.close();
rmSync(resolve(OUT, '.raw'), { recursive: true, force: true });
writeFileSync(indexPath, JSON.stringify(index, null, 1) + '\n');
