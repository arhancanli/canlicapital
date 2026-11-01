// Requests to brokers, with no redirects, so a key never follows one to another host. The IBKR gateway
// on this machine has a self-signed certificate, so for that address alone the certificate is not checked.
import { request } from "node:https";

const TIMEOUT_MS = 20000;
const wrap = (status, text) => {
  let json = null;
  try { json = JSON.parse(text); } catch { /* left as text */ }
  return { status, ok: status >= 200 && status < 300, json, text: String(text).slice(0, 1000) };
};
function toLocalGateway(url, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = request(url, { method, headers, rejectUnauthorized: false, timeout: TIMEOUT_MS }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (c) => { text += c; });
      res.on("end", () => resolve(wrap(res.statusCode, text)));
    });
    req.on("timeout", () => req.destroy(new Error("the gateway did not answer in time")));
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}
export async function http(url, opts = {}) {
  if (new URL(url).hostname === "localhost") return toLocalGateway(url, opts);
  const res = await fetch(url, { ...opts, redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS) });
  return wrap(res.status, await res.text());
}
