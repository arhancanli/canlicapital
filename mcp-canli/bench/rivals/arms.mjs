// The servers compared. Rivals run from ~/canli-bench-rivals (versions pinned in its *-frozen.txt); each with its defaults,
// except OpenBB, whose full tool list exceeds the 128 tools OpenAI accepts, so it runs in its own
// tool-discovery mode, as its docs recommend for large catalogs.
const R = process.env.RIVALS_DIR ?? `${process.env.HOME}/canli-bench-rivals`;
const CANLI = new URL("../../src/server.mjs", import.meta.url).pathname;
const ID = { EDGAR_IDENTITY: "Canli Capital benchmark research@example.com" };
export const ARMS = {
  canli: [["canli", process.execPath, [CANLI], {}]],
  // The same server after the fixes this benchmark prompted (digits, find, field names, search).
  "canli-after": [["canli", process.execPath, [CANLI], {}]],
  // After every fix (also result refs, nested run_tool, named yields and spreads, price returns).
  "canli-final": [["canli", process.execPath, [CANLI], {}]],
  // The published flagship as a user installs it from npm (CANLI_FLAGSHIP_SERVER, default ~/canli-bench-flagship).
  "canli-0.6.0": [["canli", process.execPath, [process.env.CANLI_FLAGSHIP_SERVER ?? `${process.env.HOME}/canli-bench-flagship/node_modules/canli-mcp/src/server.mjs`], {}]],
  // The latest flagship as a user installs it from npm.
  "canli-0.16.1": [["canli", process.execPath, [`${process.env.HOME}/canli-bench-flagship-0161/node_modules/canli-mcp/src/server.mjs`], {}]],
  // This branch's flagship: the published packages with this branch's canli-mcp, fundamentals and
  // markets sources copied over (CANLI_DEV_SERVER, default ~/canli-bench-flagship-dev).
  "canli-dev": [["canli", process.execPath, [process.env.CANLI_DEV_SERVER ?? `${process.env.HOME}/canli-bench-flagship-dev/node_modules/canli-mcp/src/server.mjs`], {}]],
  openbb: [["openbb", `${R}/.venv/bin/openbb-mcp`, ["--transport", "stdio", "--tool-discovery"], {}]],
  edgartools: [["edgar", `${R}/.venv-edgar/bin/edgartools-mcp`, [], ID]],
  "edgartools-5.62": [["edgar", `${R}/.venv-edgar-new/bin/edgartools-mcp`, [], ID]],
  yahoo: [["yahoo", `${R}/yfmcp/.venv313/bin/python`, [`${R}/yfmcp/server.py`], {}]],
  // A hosted server that answers without an account. No code of theirs runs here.
  drillr: [["drillr", "https://gateway.drillr.ai/mcp/data", [], {}]],
  // Installed by hand at pinned versions after reading their source. Each runs with a throwaway HOME.
  "sec-edgar-mcp": [["secedgar", `${R}/.venv-secedgar/bin/sec-edgar-mcp`, [], { HOME: `${R}/home/secedgar`, SEC_EDGAR_USER_AGENT: ID.EDGAR_IDENTITY }]],
  yfmcp: [["yfmcp", `${R}/.venv-yfmcp/bin/yfmcp`, [], { HOME: `${R}/home/yfmcp` }]],
  "pit-fundamentals": [["pit", process.execPath, [`${R}/npm-pit/node_modules/pit-fundamentals-mcp/index.js`], { HOME: `${R}/home/pit` }]],
  "edgartools+yahoo": [["edgar", `${R}/.venv-edgar/bin/edgartools-mcp`, [], ID], ["yahoo", `${R}/yfmcp/.venv313/bin/python`, [`${R}/yfmcp/server.py`], {}]],
};

// Hosted servers that answered without an account in the census of 2026-11-02. No code of theirs runs here.
const HOSTED = {
  "signal8": "https://mcp.signal8.ai/mcp",
  "cyanheads-hosted": "https://secedgar.caseyjhand.com/mcp",
  "keyvex": "https://mcp.keyvex.com",
  "pipeworx-edgar-hosted": "https://gateway.pipeworx.io/edgar/mcp",
  "valuein": "https://mcp.valuein.biz/mcp",
  "oxfordledge": "https://www.oxfordledge.com/mcp",
  "beatandraise": "https://beatandraise.com/mcp",
  "secfeed": "https://secfeedapi.com/mcp",
  "stockfacts": "https://mcp.livermore.club/mcp",
  "rockmoon": "https://mcp.rockmoon.ai/mcp",
  "finbolt": "https://api.getfinbolt.com/mcp",
  "stocklake": "https://api.stocklake.dev/mcp",
  "dataporium": "https://mcp.dataporium.io/mcp",
  "nexqual": "https://mcp.nexqual.com/mcp",
  "usefulapi-finnhub": "https://finnhub.usefulapi.io/mcp",
  "edgrapi": "https://api.edgrapi.com/mcp",
  "filingstools": "https://filings.tools/mcp",
  "filingapi": "https://mcp.filingapi.dev/mcp",
  "quantsonar": "https://quantsonar.com/mcp",
  "datakoot": "https://filings.datakoot.com/mcp",
  "alphacreek": "https://mcp.alphacreek.ai/mcp",
  "shibui": "https://mcp.shibui.finance/mcp",
  "marketintel": "https://api.marketintelligenceapi.com/mcp",
  "agentnewsstand": "https://api.agentnewsstand.com/mcp",
};
for (const [key, url] of Object.entries(HOSTED)) ARMS[key] = [[key, url, [], {}]];
