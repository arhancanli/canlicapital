// One-click install targets for the hosted MCP endpoint, derived here once so /developers and its
// test read the same values.
//
// Cursor: cursor://anysphere.cursor-deeplink/mcp/install?name=NAME&config=BASE64(server JSON)
// (https://cursor.com/docs/mcp/install-links). VS Code: `code --add-mcp '<json>'`
// (https://code.visualstudio.com/docs/agent-customization/mcp-servers). Both point at the hosted
// endpoint, so neither needs Node.js on the user's machine.
export const HOSTED_MCP_URL = "https://canlicapital.com/mcp";
export const MCP_INSTALL_NAME = "canli-validation";
// The Claude Desktop extension, attached to every release of the standalone repository under a
// stable file name, so this link always serves the latest bundle (built by mcp/mcpb/build.sh).
export const CLAUDE_DESKTOP_BUNDLE_URL =
  "https://github.com/arhancanli/canli-validation-mcp/releases/latest/download/canli-validation.mcpb";

export function cursorInstallLink(name = MCP_INSTALL_NAME, url = HOSTED_MCP_URL) {
  const config = Buffer.from(JSON.stringify({ url })).toString("base64");
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent(name)}&config=${encodeURIComponent(config)}`;
}

export function vscodeAddCommand(name = MCP_INSTALL_NAME, url = HOSTED_MCP_URL) {
  return `code --add-mcp '${JSON.stringify({ name, type: "http", url })}'`;
}

// Where the server is listed, shown on /developers. Only listings that are live and checked.
export const MCP_LISTINGS = Object.freeze([
  { label: "npm", href: "https://www.npmjs.com/package/canli-validation-mcp" },
  { label: "MCP Registry", href: "https://registry.modelcontextprotocol.io/v0/servers?search=io.github.arhancanli/canli-validation-mcp" },
  { label: "cursor.directory", href: "https://cursor.directory/plugins/canli-validation-mcp-1" },
  { label: "Source", href: "https://github.com/arhancanli/canli-validation-mcp" },
]);
