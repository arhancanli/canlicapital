// Replays captured responses; any request not captured fails the test, so no test touches the network.
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const DIR = new URL("./fixtures/", import.meta.url);
const MANIFEST = JSON.parse(readFileSync(new URL("manifest.json", DIR), "utf8"));

export function replayFetch(extra = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, headers: init.headers ?? {}, method: init.method ?? "GET", body: init.body });
    // A POST query (FINRA) is captured under "POST <url> <body>".
    const key = init.method && init.method !== "GET" ? `${init.method} ${url} ${init.body ?? ""}` : url;
    if (extra[key]) return new Response(typeof extra[key] === "string" ? extra[key] : JSON.stringify(extra[key]), { status: 200 });
    const file = MANIFEST[key];
    if (!file) return new Response(`not captured: ${key}`, { status: 404 });
    return new Response(gunzipSync(readFileSync(new URL(file, DIR))).toString("utf8"), { status: 200 });
  };
  return { fetchImpl, calls };
}
export const NOW = Date.parse("2026-10-09T12:00:00Z");
