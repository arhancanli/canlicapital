// FIX 4.4, the plain text protocol institutional brokers and execution networks speak: just enough to
// log on, send one order, read its execution report and log off. Each message carries its own length
// and checksum, and both are checked on what comes back.
const SOH = "\x01";
const pad = (n, w) => String(n).padStart(w, "0");
export const fixTime = (d = new Date()) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1, 2)}${pad(d.getUTCDate(), 2)}-${pad(d.getUTCHours(), 2)}:${pad(d.getUTCMinutes(), 2)}:${pad(d.getUTCSeconds(), 2)}.${pad(d.getUTCMilliseconds(), 3)}`;
const checksum = (s) => pad([...Buffer.from(s, "latin1")].reduce((a, b) => a + b, 0) % 256, 3);

// A value cannot carry the field separator, or one field could smuggle in another.
const safe = (v) => { const s = String(v); if (s.includes(SOH) || /[\r\n]/.test(s)) throw new Error("A FIX field cannot hold a separator."); return s; };

export function encode(type, fields, { sender, target, seq, now = new Date() }) {
  const body = [["35", type], ["49", sender], ["56", target], ["34", seq], ["52", fixTime(now)], ...fields].map(([k, v]) => `${k}=${safe(v)}${SOH}`).join("");
  const head = `8=FIX.4.4${SOH}9=${Buffer.byteLength(body, "latin1")}${SOH}`;
  return `${head}${body}10=${checksum(head + body)}${SOH}`;
}

// Messages out of a stream of bytes, with what is left over. A message whose length or checksum is
// wrong is an error, not something to guess at.
export function decode(buffer) {
  const messages = [];
  let rest = buffer;
  for (;;) {
    const start = rest.indexOf("8=FIX");
    if (start < 0) return { messages, rest: "" };
    rest = rest.slice(start);
    const lengthAt = rest.indexOf(`${SOH}9=`);
    if (lengthAt < 0) return { messages, rest };
    const lengthEnd = rest.indexOf(SOH, lengthAt + 1);
    if (lengthEnd < 0) return { messages, rest };
    const length = Number(rest.slice(lengthAt + 3, lengthEnd)), bodyStart = lengthEnd + 1, bodyEnd = bodyStart + length;
    if (!Number.isInteger(length) || length < 0 || length > 1e6) throw new Error("A FIX message gave a bad length.");
    const tail = rest.indexOf(SOH, bodyEnd);
    if (rest.length < bodyEnd + 7 || tail < 0) return { messages, rest };
    if (rest.slice(bodyEnd, bodyEnd + 3) !== "10=") throw new Error("A FIX message's length does not match its body.");
    if (rest.slice(bodyEnd + 3, tail) !== checksum(rest.slice(0, bodyEnd))) throw new Error("A FIX message's checksum is wrong.");
    const fields = new Map();
    for (const part of rest.slice(0, bodyEnd).split(SOH)) { const i = part.indexOf("="); if (i > 0 && !fields.has(part.slice(0, i))) fields.set(part.slice(0, i), part.slice(i + 1)); }
    messages.push(fields);
    rest = rest.slice(tail + 1);
  }
}
