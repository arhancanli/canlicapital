import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = resolve(ROOT, "public");

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

const stateBytes = await readFile(resolve(PUBLIC, "system-films/state.json"));
const state = JSON.parse(stateBytes);
const manifest = JSON.parse(await readFile(resolve(PUBLIC, "system-films/manifest.json"), "utf8"));
check(state.schema === "canli.system-films-state.v1", "unexpected system film state schema");
check(manifest.schema === "canli.system-films-manifest.v1", "unexpected system film manifest schema");
check(manifest.rendered_from_state_sha256 === sha256(stateBytes), "films were not rendered from the published state snapshot");
check(state.films.length === 3 && manifest.films.length === 3, "exactly three system films are required");
check(new Set(state.films.map(({ id }) => id)).size === 3, "system film ids are not unique");

for (const film of state.films) {
  check(film.timestamp && film.source?.sha256?.length === 64, `${film.id} has no timestamped source binding`);
  check(film.transcript?.length >= 3, `${film.id} has no complete text transcript`);
  check(film.metrics?.length === 3, `${film.id} must expose three sanitized metrics`);
  check(!/PA[0-9A-Z]{8,}/.test(JSON.stringify(film)), `${film.id} leaks an Alpaca account identifier`);
}

for (const film of manifest.films) {
  check(film.duration_seconds >= 10 && film.duration_seconds <= 15, `${film.id} duration is outside 10 to 15 seconds`);
  check(film.silent === true, `${film.id} is not declared silent`);
  for (const [kind, record] of Object.entries(film.files)) {
    const path = resolve(PUBLIC, record.path.replace(/^\//, ""));
    const bytes = await readFile(path);
    const info = await stat(path);
    check(info.size === record.bytes, `${film.id} ${kind} byte count drifted`);
    check(sha256(bytes) === record.sha256, `${film.id} ${kind} digest drifted`);
  }

  for (const [kind, codec] of [["webm", "vp9"], ["h264", "h264"]]) {
    const path = resolve(PUBLIC, film.files[kind].path.replace(/^\//, ""));
    const probe = spawnSync(ffmpegPath, ["-hide_banner", "-i", path], { encoding: "utf8" });
    const output = `${probe.stdout || ""}\n${probe.stderr || ""}`;
    check(output.includes(`Video: ${codec}`), `${film.id} ${kind} codec is not ${codec}`);
    check(!output.includes("Audio:"), `${film.id} ${kind} unexpectedly contains audio`);
    const duration = output.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
    check(duration, `${film.id} ${kind} duration could not be read`);
    const seconds = (Number(duration[1]) * 3600) + (Number(duration[2]) * 60) + Number(duration[3]);
    check(seconds >= 10 && seconds <= 15.05, `${film.id} ${kind} duration is ${seconds}s`);
  }
}

const [index, homeJs, compositionJs, compositionCss] = await Promise.all([
  readFile(resolve(ROOT, "index.html"), "utf8"),
  readFile(resolve(ROOT, "js/home.js"), "utf8"),
  readFile(resolve(ROOT, "tools/system-films/composition.js"), "utf8"),
  readFile(resolve(ROOT, "tools/system-films/composition.css"), "utf8"),
]);
check((index.match(/data-film-card=/g) || []).length === 3, "homepage does not render all three system film cards");
check((index.match(/<video/g) || []).length === 3, "homepage does not render all three video elements");
check((index.match(/data-src=/g) || []).length === 6, "video sources must remain lazy data-src values");
check((index.match(/loading="lazy"/g) || []).length >= 3, "system film posters are not lazy images");
check((index.match(/data-film-poster/g) || []).length === 3, "system film poster images are incomplete");
check((index.match(/data-poster=/g) || []).length === 3, "delayed native video poster bindings are incomplete");
check(!/<video[^>]+autoplay/i.test(index), "system film autoplay is present before viewport eligibility");
check(homeJs.includes("IntersectionObserver") && homeJs.includes("prefers-reduced-motion"), "system film playback has no viewport and reduced-motion gates");
check(compositionJs.includes("gsap.timeline({ paused: true })"), "film composition timeline is not paused");
for (const forbidden of ["Math.random", "Date.now", "performance.now", "repeat: -1", "yoyo:"]) {
  check(!compositionJs.includes(forbidden), `film composition contains nondeterministic motion: ${forbidden}`);
}
check(!compositionCss.includes("transition: all"), "film composition uses transition: all");
console.log("verified 3 authentic system films, 6 silent video fallbacks, 3 posters, transcripts, lazy playback, and deterministic motion");
