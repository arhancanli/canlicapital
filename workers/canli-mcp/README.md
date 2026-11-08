# canli-mcp on Cloudflare Workers

The hosted canli-mcp (today the Vercel function api/mcp-canli.js) built as a Worker: the published npm package, the same rules (six read-only packs, no files, no paper trading, no keyless prices, 60 requests a minute per caller), served over MCP Streamable HTTP.

    node build.mjs              bundle to dist/worker.mjs (ESBUILD=path to esbuild's lib/main.js)
    wrangler dev --local        run it in workerd
    wrangler deploy             deploy (runs the build first)

build.mjs bakes the files the packages read next to their modules into the bundle, and adapts three things Workers do differently: fetch takes redirect "follow" or "manual" (so "error" becomes "manual": a redirect is still never followed), zlib's maxOutputLength is at most 128 MiB, and fetch must not be called as another object's method (src/setup.mjs binds it). src/setup.mjs also gives FRED a User-Agent with a contact link, which FRED requires from Cloudflare's network.

Status 2026-11-03: built on canli-mcp 0.17.1 and checked locally in workerd (initialize reports 0.17.1; find_tool answers as the Vercel server does). The test address https://canli-mcp.arhancanli.workers.dev still serves the earlier 0.17.0 build. In two replays of the recorded calls there, 19 to 25 stopped at Cloudflare's free-plan CPU limit (error 1102), so the switch waits for Workers Paid. The replay is now in the branch (below); its run on 3 Nov at 20:18 UTC passed 68 of 87 on the Worker against the Vercel server. The other 19, the heavier tools, got HTTP 503 from Cloudflare, and each answered when sent again alone, which fits the free plan's CPU allowance being used up at times. Vercel failed none, and every call both answered behaved the same way on both. Where the Worker answered it was faster: a median of 199 ms against 254 ms, and 2.1 s against 3.2 s for the slowest 5%. Paid keys are not served here yet. canlicapital.com/mcp/canli still runs on Vercel.

## Edge cache

On a user's machine the markets pack keeps the public data it reads in a disk cache, fresh for as long as each kind of document stays the same (a filing 30 days, company facts 6 hours, a company's list of filings 15 minutes), each copy with the evidence of its first read. A Worker has no disk, so build.mjs gives the pack src/cache.mjs instead: the same entries and freshness, kept in Cloudflare's cache in the data centre serving the request. A copy keeps its first evidence, so a figure says when the SEC served it, not when the cache did. X-Canli-Cache on each answer counts the copies a request found fresh (hit) or past their freshness (stale, refetched and kept for when a source is down) and the reads that found none (miss); the replay adds them up.

Checked locally in workerd on 4 Nov 2026, each time in a fresh isolate: financial_statements (Apple, two annual reports) found all 6 of its SEC reads in the cache and answered in 0.08 s against 1.8 s the first time; read_filing (NVIDIA's 10-K) found 2 of 2, 0.02 s against 0.4 s. Both answers were byte for byte the first ones, evidence times included. Cloudflare documents the cache for Workers on a custom domain and does not say whether it works on workers.dev; the first replay after the switch will show it, as a second pass should count hits.

The fundamentals and validation packs read canlicapital.com's company reference instead, which serves every file with max-age=0, so each look-up went back to Vercel: for Apple, the ticker list (128 KB), the company's record (306 KB) and its SEC snapshot (270 KB). The Worker caches these by address: a snapshot, named by its SHA-256 and checked against it on every read, for a year; a record and the two lists for six hours, as long as the fundamentals pack keeps its own copies. A revalidation (If-None-Match), a range or a POST goes straight through. Checked the same way on 4 Nov: known_as_of (Apple as of 1 Mar 2020) found its 3 reads in the cache in a fresh isolate, 0.08 s against 0.78 s; restatements (BDX) 2 of 2, 0.12 s against 1.48 s; both answers identical.

## Replay before the switch

    npm test                                                        the replay's own tests
    npm run replay -- https://canli-mcp.arhancanli.workers.dev --against https://canlicapital.com/mcp/canli --out replay.json

replay/calls.json holds 87 recorded calls (tool name and arguments). Each goes through run_tool to the candidate and, with --against, to the server it would replace, at most one a second on each (the hosted servers take 60 a minute from a caller; a 429 is waited out). A call passes when the candidate answers it, with no timeout, HTTP or JSON-RPC failure and no Cloudflare error page, and answers it as the reference does: a tool that declines there (prices are off on both hosted servers) must decline here too. The run exits 1 unless every call passes; the switch waits for 87 of 87.
