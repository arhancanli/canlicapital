// `canli-mcp serve`: the same server over Streamable HTTP (POST /mcp, with server-sent events on
// GET /mcp) and WebSocket (/ws), for agents on this machine that keep a connection open. It binds to
// the loopback address only and every request needs the token it prints, so a web page in a browser on
// this machine cannot reach it: the Host and Origin headers are checked as well. stdio stays the default.
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server";

const LOOPBACK = /^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i;
const MAX_BODY = 8 * 1024 * 1024;
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

// Whether a request may reach the server, and if not the status that says why.
export function refuse(req, token) {
  if (!LOOPBACK.test(req.headers.host ?? "")) return [403, "This server answers only on the loopback address."];
  const origin = req.headers.origin;
  if (origin && !/^https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i.test(origin)) return [403, "Requests from web pages are refused."];
  const auth = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1];
  if (!auth || !same(auth, token)) return [401, "Send the token the server printed as: Authorization: Bearer <token>"];
  return null;
}

// JSON-RPC messages over one WebSocket, as the MCP SDK's transport interface wants them.
export class WebSocketTransport {
  constructor(socket) { this.socket = socket; }
  async start() {
    this.socket.on("message", (data) => {
      let message;
      try { message = JSON.parse(String(data)); } catch (err) { this.onerror?.(err); return; }
      this.onmessage?.(message);
    });
    this.socket.on("close", () => this.onclose?.());
    this.socket.on("error", (err) => this.onerror?.(err));
  }
  async send(message) { this.socket.send(JSON.stringify(message)); }
  async close() { this.socket.close(); }
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw new RangeError("request too large");
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

export async function startServe({ makeServer, port = 0, token = randomBytes(24).toString("base64url"), websocket = true }) {
  const sessions = new Map();
  const http = createServer(async (req, res) => {
    const no = refuse(req, token);
    if (no) { res.writeHead(no[0], { "content-type": "text/plain" }).end(no[1]); return; }
    if (new URL(req.url, "http://x").pathname !== "/mcp") { res.writeHead(404).end(); return; }
    try {
      const id = req.headers["mcp-session-id"];
      let transport = id ? sessions.get(id) : null;
      if (id && !transport) { res.writeHead(404, { "content-type": "text/plain" }).end("Unknown session."); return; }
      if (!transport) {
        transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: randomUUID, onsessioninitialized: (sid) => sessions.set(sid, transport), onsessionclosed: (sid) => sessions.delete(sid) });
        await makeServer().then((server) => server.connect(transport));
      }
      const body = ["POST", "DELETE"].includes(req.method) ? await readBody(req) : undefined;
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
      const answer = await transport.handleRequest(new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers, body: body?.length ? body : undefined }));
      res.writeHead(answer.status, Object.fromEntries(answer.headers));
      if (!answer.body) { res.end(); return; }
      const reader = answer.body.getReader();
      req.on("close", () => reader.cancel().catch(() => {}));
      for (;;) { const { done, value } = await reader.read(); if (done) break; res.write(value); }
      res.end();
    } catch (err) {
      if (!res.headersSent) res.writeHead(err instanceof RangeError ? 413 : 500, { "content-type": "text/plain" });
      res.end(err instanceof RangeError ? err.message : "The request failed.");
    }
  });
  let wss = null;
  if (websocket) {
    const { WebSocketServer } = await import("ws");
    wss = new WebSocketServer({ noServer: true, maxPayload: MAX_BODY });
    http.on("upgrade", (req, socket, head) => {
      const no = refuse(req, token);
      if (no || new URL(req.url, "http://x").pathname !== "/ws") { socket.write(`HTTP/1.1 ${no?.[0] ?? 404} Refused\r\nConnection: close\r\n\r\n`); socket.destroy(); return; }
      wss.handleUpgrade(req, socket, head, async (ws) => { const server = await makeServer(); await server.connect(new WebSocketTransport(ws)); });
    });
  }
  await new Promise((ok, fail) => { http.once("error", fail); http.listen(port, "127.0.0.1", ok); });
  const at = http.address().port;
  return { port: at, token, http: `http://127.0.0.1:${at}/mcp`, ws: websocket ? `ws://127.0.0.1:${at}/ws` : null, close: () => new Promise((ok) => {
    // An upgraded socket is no longer the HTTP server's to close.
    for (const c of wss?.clients ?? []) c.terminate();
    wss?.close();
    http.closeAllConnections?.();
    http.close(ok);
  }) };
}
