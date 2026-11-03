# canli-mcp on Cloudflare Workers

The hosted canli-mcp (today the Vercel function api/mcp-canli.js) built as a Worker: the published npm package, the same rules (six read-only packs, no files, no paper trading, no keyless prices, 60 requests a minute per caller), served over MCP Streamable HTTP.

    node build.mjs              bundle to dist/worker.mjs (ESBUILD=path to esbuild's lib/main.js)
    wrangler dev --local        run it in workerd
    wrangler deploy             deploy (runs the build first)

build.mjs bakes the files the packages read next to their modules into the bundle, and adapts three things Workers do differently: fetch takes redirect "follow" or "manual" (so "error" becomes "manual": a redirect is still never followed), zlib's maxOutputLength is at most 128 MiB, and fetch must not be called as another object's method (src/setup.mjs binds it). src/setup.mjs also gives FRED a User-Agent with a contact link, which FRED requires from Cloudflare's network.

Status 2026-11-03: deployed to the test address https://canli-mcp.arhancanli.workers.dev. Replaying the site's 87 recorded calls: 59 identical to the Vercel server; 25 stop at Cloudflare's free-plan CPU limit (error 1102), which needs Workers Paid. Paid keys are not served here yet. canlicapital.com/mcp/canli still runs on Vercel.
