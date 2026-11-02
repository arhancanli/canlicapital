// Any FIX 4.4 gateway: an institutional broker's, an execution network's, or a test venue's. You name
// the gateway and which it is, a test venue or production. Nothing else about it can be read from here,
// so a run that says paper needs a gateway you have declared a test venue.
//
// Limit orders only, in share quantities, so each order's most is known before it goes. Written from
// the FIX 4.4 specification and tested against a simulator on this machine. It has never connected to
// a real gateway, and each counterparty certifies a connection before it goes live, with its own rules
// on top of these. Prime brokers and execution networks offer FIX only under a signed agreement.
import { connect as plainConnect } from "node:net";
import { connect as tlsConnect } from "node:tls";

import { decode, encode, fixTime } from "../fix.mjs";
import { clean, isCrypto, Refused } from "../util.mjs";

const SIDE = { buy: "1", sell: "2" }, TIF = { day: "0", gtc: "1" };
const LOOPBACK = new Set(["127.0.0.1", "::1", "localhost"]);
const WAIT_MS = 20000;

function need(env, name) {
  const v = env[name];
  if (!v) throw new Refused(`${name} is not set.`);
  return v;
}

// One conversation with the gateway: logon, the work, logoff. Heartbeats and test requests are answered
// while it waits.
async function session(cfg, work) {
  const open = cfg.tls ? tlsConnect : plainConnect;
  const socket = open({ host: cfg.host, port: cfg.port, ...(cfg.tls ? { servername: cfg.host } : {}) });
  let seq = 1, buffer = "", failed = null;
  const waiting = [];
  const queue = [];
  const send = (type, fields = []) => { socket.write(encode(type, fields, { sender: cfg.sender, target: cfg.target, seq }), "latin1"); seq += 1; };
  const deliver = () => { while (queue.length && waiting.length) waiting.shift().ok(queue.shift()); };
  const fail = (err) => { failed = failed ?? err; for (const w of waiting.splice(0)) w.no(failed); };
  socket.setEncoding("latin1");
  socket.on("data", (chunk) => {
    try {
      const { messages, rest } = decode(buffer + chunk);
      buffer = rest;
      for (const m of messages) {
        const type = m.get("35");
        if (type === "0") continue;
        if (type === "1") { send("0", [["112", m.get("112") ?? ""]]); continue; }
        queue.push(m);
      }
      deliver();
    } catch (err) { fail(err); socket.destroy(); }
  });
  socket.on("error", (err) => fail(new Error(`The FIX gateway connection failed: ${clean(err.message, 120)}`)));
  socket.on("close", () => fail(new Error("The FIX gateway closed the connection.")));
  const next = () => new Promise((ok, no) => {
    if (queue.length) { ok(queue.shift()); return; }
    if (failed) { no(failed); return; }
    const t = setTimeout(() => no(new Error("The FIX gateway did not answer in time.")), WAIT_MS);
    waiting.push({ ok: (m) => { clearTimeout(t); ok(m); }, no: (e) => { clearTimeout(t); no(e); } });
  });
  await new Promise((ok, no) => { socket.once(cfg.tls ? "secureConnect" : "connect", ok); socket.once("error", no); });
  try {
    send("A", [["98", "0"], ["108", "30"], ["141", "Y"], ...(cfg.username ? [["553", cfg.username]] : []), ...(cfg.password ? [["554", cfg.password]] : [])]);
    const logon = await next();
    if (logon.get("35") !== "A") throw new Refused(`The FIX gateway refused the logon: ${clean(logon.get("58") ?? logon.get("35"), 200)}`);
    const out = await work({ send, next });
    try { send("5"); } catch { /* it is going anyway */ }
    return out;
  } finally { socket.destroy(); }
}

export const fix = {
  name: "fix",
  async setup(mode, env) {
    const kind = need(env, "CANLI_FIX_ENVIRONMENT");
    if (!["test", "production"].includes(kind)) throw new Refused("CANLI_FIX_ENVIRONMENT must say test or production.");
    if ((mode === "paper") !== (kind === "test")) throw new Refused(mode === "paper" ? "CANLI_FIX_ENVIRONMENT says production, and this run is paper." : "CANLI_FIX_ENVIRONMENT says test, and this run is live.");
    const host = need(env, "CANLI_FIX_HOST"), port = Number(need(env, "CANLI_FIX_PORT"));
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Refused("CANLI_FIX_PORT must be a port number.");
    // A password does not cross a network in the clear. Plain TCP is only for this machine, such as a
    // stunnel beside a gateway or a simulator.
    const tls = env.CANLI_FIX_TLS !== "0";
    if (!tls && !LOOPBACK.has(host)) throw new Refused("A FIX gateway on another machine needs TLS.");
    return { host, port, tls, sender: need(env, "CANLI_FIX_SENDER"), target: need(env, "CANLI_FIX_TARGET"), username: env.CANLI_FIX_USERNAME, password: env.CANLI_FIX_PASSWORD, account: env.CANLI_FIX_ACCOUNT };
  },
  cannot(o) {
    if (isCrypto(o.symbol)) return "This adapter sends only stocks over FIX.";
    if (o.type !== "limit") return "This adapter sends only limit orders over FIX, so each order's most is known before it goes.";
    if (o.notional_usd !== undefined) return "This adapter sends share quantities over FIX, not notional_usd.";
    return null;
  },
  // Limit orders carry their own price, and positions live at the broker: a sell cannot be checked here.
  async price() { return null; },
  async position() { return null; },
  async place(cfg, _http, o, clientId) {
    return session(cfg, async ({ send, next }) => {
      send("D", [["11", clientId], ...(cfg.account ? [["1", cfg.account]] : []), ["55", o.symbol], ["54", SIDE[o.side]], ["60", fixTime()], ["38", o.quantity], ["40", "2"], ["44", o.limit_price], ["59", TIF[o.time_in_force]]]);
      for (;;) {
        const m = await next(), type = m.get("35");
        if (type === "3") throw new Error(`The FIX gateway rejected the message: ${clean(m.get("58") ?? "no reason given", 200)}`);
        if (type === "5") throw new Error(`The FIX gateway logged off: ${clean(m.get("58") ?? "no reason given", 200)}`);
        if (type !== "8" || m.get("11") !== clientId) continue;
        const status = m.get("39");
        if (status === "8") throw new Refused(`The order was rejected: ${clean(m.get("58") ?? "no reason given", 200)}`);
        return { id: m.get("37") ?? null, status: { 0: "new", 1: "partly filled", 2: "filled", A: "pending new" }[status] ?? `status ${clean(status, 8)}` };
      }
    });
  },
};
