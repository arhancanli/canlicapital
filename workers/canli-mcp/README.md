# canli-mcp on Cloudflare Workers

The hosted canli-mcp (today the Vercel function api/mcp-canli.js) built as a Worker: the published npm package, the same rules (six read-only packs, no files, no paper trading, no keyless prices, 60 requests a minute per caller), served over MCP Streamable HTTP.

    node build.mjs              bundle to dist/worker.mjs (ESBUILD=path to esbuild's lib/main.js)
    wrangler dev --local        run it in workerd
    wrangler deploy             deploy (runs the build first)

build.mjs bakes the files the packages read next to their modules into the bundle, and adapts three things Workers do differently: fetch takes redirect "follow" or "manual" (so "error" becomes "manual": a redirect is still never followed), zlib's maxOutputLength is at most 128 MiB, and fetch must not be called as another object's method (src/setup.mjs binds it). src/setup.mjs also gives FRED a User-Agent with a contact link, which FRED requires from Cloudflare's network.

Status 2026-11-03: built on canli-mcp 0.17.1 and checked locally in workerd (initialize reports 0.17.1; find_tool answers as the Vercel server does). The test address https://canli-mcp.arhancanli.workers.dev still serves the earlier 0.17.0 build. In two replays of the recorded calls there, 19 to 25 stopped at Cloudflare's free-plan CPU limit (error 1102), so the switch waits for Workers Paid. The replay is now in the branch (below); its run on 3 Nov at 20:18 UTC passed 68 of 87 on the Worker against the Vercel server. The other 19, the heavier tools, got HTTP 503 from Cloudflare, and each answered when sent again alone, which fits the free plan's CPU allowance being used up at times. Vercel failed none, and every call both answered behaved the same way on both. Where the Worker answered it was faster: a median of 199 ms against 254 ms, and 2.1 s against 3.2 s for the slowest 5%. Paid keys are not served here yet. canlicapital.com/mcp/canli still runs on Vercel.

## Replay before the switch

    npm test                                                        the replay's own tests
    npm run replay -- https://canli-mcp.arhancanli.workers.dev --against https://canlicapital.com/mcp/canli --out replay.json

replay/calls.json holds 87 recorded calls (tool name and arguments). Each goes through run_tool to the candidate and, with --against, to the server it would replace, at most one a second on each (the hosted servers take 60 a minute from a caller; a 429 is waited out). A call passes when the candidate answers it, with no timeout, HTTP or JSON-RPC failure and no Cloudflare error page, and answers it as the reference does: a tool that declines there (prices are off on both hosted servers) must decline here too. The run exits 1 unless every call passes; the switch waits for 87 of 87.
