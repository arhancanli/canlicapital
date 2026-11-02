// `canli-mcp gui`: the tools and the result viewer in a browser, for anyone whose client does not draw
// MCP Apps or who has no AI client at all. A small page on the loopback address plays the MCP Apps
// host: it searches the tools, builds a form from a tool's schema, runs it and hands the result to
// the same viewer the MCP Apps clients draw, in a sandboxed frame that has no network of its own.
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";

import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";

import { viewHtml } from "../src/view.mjs";

const LOOPBACK = /^(?:127\.0\.0\.1|localhost)(?::\d+)?$/i;
const MAX_BODY = 8 * 1024 * 1024;
const ALLOWED = new Set(["find_tool", "describe_tool", "run_tool"]);
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
const page = () => readFileSync(new URL("./gui.html", import.meta.url), "utf8");

export async function startGui({ makeServer, port = 0, token = randomBytes(24).toString("base64url") }) {
  const server = await makeServer();
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: "canli-gui", version: "1" });
  await client.connect(b);
  const http = createServer(async (req, res) => {
    const send = (status, type, body, extra = {}) => res.writeHead(status, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", ...extra }).end(body);
    if (!LOOPBACK.test(req.headers.host ?? "")) return send(403, "text/plain", "This page answers only on the loopback address.");
    const url = new URL(req.url, "http://x");
    try {
      if (req.method === "GET" && url.pathname === "/") {
        if (!same(url.searchParams.get("token") ?? "", token)) return send(401, "text/plain", "Open the full address canli-mcp gui printed.");
        const nonce = randomBytes(16).toString("base64");
        return send(200, "text/html; charset=utf-8", page().replaceAll("__NONCE__", nonce).replace("__TOKEN__", token), { "content-security-policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; frame-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` });
      }
      // The viewer holds no secret and is framed with no network: its own policy allows nothing but itself.
      if (req.method === "GET" && url.pathname === "/view") return send(200, "text/html; charset=utf-8", viewHtml(), { "content-security-policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'" });
      if (req.method === "POST" && url.pathname === "/call") {
        if (!same(req.headers["x-canli-token"] ?? "", token)) return send(401, "text/plain", "Missing or wrong token.");
        const origin = req.headers.origin;
        if (origin && origin !== `http://${req.headers.host}`) return send(403, "text/plain", "Requests from other pages are refused.");
        const chunks = [];
        let size = 0;
        for await (const c of req) { size += c.length; if (size > MAX_BODY) return send(413, "text/plain", "Too large."); chunks.push(c); }
        const { name, arguments: args } = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!ALLOWED.has(name)) return send(403, "text/plain", `${String(name).slice(0, 60)} is not callable from this page.`);
        const out = await client.callTool({ name, arguments: args ?? {} });
        return send(200, "application/json", JSON.stringify(out));
      }
      return send(404, "text/plain", "Not found.");
    } catch (err) {
      return send(500, "application/json", JSON.stringify({ isError: true, content: [{ type: "text", text: String(err?.message ?? err) }] }));
    }
  });
  await new Promise((ok, fail) => { http.once("error", fail); http.listen(port, "127.0.0.1", ok); });
  const at = http.address().port;
  return { port: at, url: `http://127.0.0.1:${at}/?token=${token}`, close: async () => { http.closeAllConnections?.(); await new Promise((ok) => http.close(ok)); await client.close(); } };
}
