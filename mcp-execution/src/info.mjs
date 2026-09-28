// The server's identity in initialize, shared by the local and hosted builds so neither imports the
// other: a readable title, the page that documents it and its icon.
import { readFileSync } from "node:fs";

export const SERVER_NAME = "canli-execution-mcp";
export const SERVER_VERSION = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;

export const SERVER_INFO = Object.freeze({
  name: SERVER_NAME,
  version: SERVER_VERSION,
  title: "Canli Execution",
  websiteUrl: "https://canlicapital.com/developers#mcp-execution",
  icons: [
    { src: "https://canlicapital.com/icon-512.png", mimeType: "image/png", sizes: ["512x512"] },
    { src: "https://canlicapital.com/favicon.svg", mimeType: "image/svg+xml", sizes: ["any"] },
  ],
});
