// The servers compared. Rivals run from a scratch install (see README.md); each with its defaults,
// except OpenBB, whose full tool list exceeds the 128 tools OpenAI accepts, so it runs in its own
// tool-discovery mode, as its docs recommend for large catalogs.
const R = process.env.RIVALS_DIR ?? "/private/tmp/claude-501/-Users-arhancanli/edd2d3e0-de5f-4fc1-a9df-697e935a2fd5/scratchpad/rivals";
const CANLI = new URL("../../src/server.mjs", import.meta.url).pathname;
const ID = { EDGAR_IDENTITY: "Canli Capital benchmark research@example.com" };
export const ARMS = {
  canli: [["canli", process.execPath, [CANLI], {}]],
  // The same server after the fixes this benchmark prompted (digits, find, field names, search).
  "canli-after": [["canli", process.execPath, [CANLI], {}]],
  openbb: [["openbb", `${R}/.venv/bin/openbb-mcp`, ["--transport", "stdio", "--tool-discovery"], {}]],
  edgartools: [["edgar", `${R}/.venv-edgar/bin/edgartools-mcp`, [], ID]],
  yahoo: [["yahoo", `${R}/yfmcp/.venv313/bin/python`, [`${R}/yfmcp/server.py`], {}]],
  "edgartools+yahoo": [["edgar", `${R}/.venv-edgar/bin/edgartools-mcp`, [], ID], ["yahoo", `${R}/yfmcp/.venv313/bin/python`, [`${R}/yfmcp/server.py`], {}]],
};
