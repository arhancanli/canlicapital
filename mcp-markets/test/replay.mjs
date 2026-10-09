// Replays captured responses; any request not captured fails the test, so no test touches the network.
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const DIR = new URL("./fixtures/", import.meta.url);
const MANIFEST = JSON.parse(readFileSync(new URL("manifest.json", DIR), "utf8"));

export function replayFetch(extra = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, headers: init.headers ?? {} });
    if (extra[url]) return new Response(typeof extra[url] === "string" ? extra[url] : JSON.stringify(extra[url]), { status: 200 });
    const file = MANIFEST[url];
    if (!file) return new Response(`not captured: ${url}`, { status: 404 });
    return new Response(gunzipSync(readFileSync(new URL(file, DIR))).toString("utf8"), { status: 200 });
  };
  return { fetchImpl, calls };
}
export const NOW = Date.parse("2026-10-09T12:00:00Z");
