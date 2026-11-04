// The text of a PDF, page by page and line by line, for the filings that come only as PDFs (the House's
// periodic transaction reports). Enough of the format for documents a program wrote: objects, Flate streams,
// fonts with ToUnicode maps (two-byte Identity-H and one-byte), text operators and form XObjects, positions
// through the transformation matrices. A scanned page has no text, and comes back empty.
import { inflateSync, constants } from "node:zlib";

// A stream inflates to 32 MB at most, so a malformed or hostile file cannot fill the memory. A small stream (deflate
// expands at most about 1,032 times, so one under 32 KB stays under the cap) is inflated with no options at all: Node
// reads some of these documents' streams (a declared window smaller than the data uses) only that way, and any
// options object, even an empty one, fails them. A larger stream is inflated under the cap, or skipped.
const MAX_STREAM = 32 * 1024 * 1024;
const inflate = (bytes) => {
  if (bytes.length <= MAX_STREAM / 1032) {
    try { return inflateSync(bytes); } catch { try { return inflateSync(bytes, { finishFlush: constants.Z_SYNC_FLUSH }); } catch { return null; } }
  }
  try { return inflateSync(bytes, { maxOutputLength: MAX_STREAM }); } catch { return null; }
};

// Every object: its dictionary text and, for a stream, its decoded bytes.
function objects(buf) {
  const s = buf.toString("latin1"), out = new Map();
  const re = /(\d+)\s+0\s+obj\b/g;
  let m;
  while ((m = re.exec(s))) {
    const at = m.index + m[0].length, end = s.indexOf("endobj", at);
    if (end < 0) break;
    let body = s.slice(at, end), data = null;
    const si = body.search(/\bstream\r?\n/);
    if (si >= 0) {
      const dict = body.slice(0, si);
      let start = at + si + 6;
      if (s[start] === "\r") start += 1;
      if (s[start] === "\n") start += 1;
      const len = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict);
      const stop = len ? start + Number(len[1]) : s.indexOf("endstream", start);
      const raw = buf.subarray(start, stop);
      data = /\/FlateDecode/.test(dict) ? inflate(raw) : /\/Filter/.test(dict) ? null : raw;
      body = dict;
      re.lastIndex = Math.max(re.lastIndex, s.indexOf("endobj", stop) + 6);
    } else re.lastIndex = end + 6;
    out.set(Number(m[1]), { dict: body, data });
  }
  return out;
}

// The text after a key: a nested dictionary (balanced << >>), an array, or a reference.
function value(dict, key, objs) {
  const i = dict.search(new RegExp(`/${key}(?![A-Za-z])`));
  if (i < 0) return null;
  const rest = dict.slice(i + key.length + 1).trimStart();
  const ref = /^(\d+)\s+0\s+R/.exec(rest);
  if (ref) return objs ? objs.get(Number(ref[1]))?.dict ?? null : `${ref[1]} 0 R`;
  if (rest.startsWith("<<")) { let depth = 0; for (let j = 0; j < rest.length; j += 1) { if (rest.startsWith("<<", j)) { depth += 1; j += 1; } else if (rest.startsWith(">>", j)) { depth -= 1; j += 1; if (!depth) return rest.slice(0, j + 1); } } }
  if (rest.startsWith("[")) return rest.slice(0, rest.indexOf("]") + 1);
  return null;
}
const refs = (text) => [...String(text ?? "").matchAll(/(\d+)\s+0\s+R/g)].map((m) => Number(m[1]));
const named = (dict) => Object.fromEntries([...String(dict ?? "").matchAll(/\/([^\s/<>[\]()]+)\s+(\d+)\s+0\s+R/g)].map((m) => [m[1], Number(m[2])]));

// A ToUnicode map: bfchar and bfrange entries.
function cmap(text) {
  const map = new Map();
  const str = (h) => String.fromCodePoint(...(h.match(/.{4}/g) ?? []).map((x) => parseInt(x, 16)));
  for (const b of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) for (const m of b[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g)) map.set(parseInt(m[1], 16), str(m[2]));
  for (const b of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) for (const m of b[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(?:<([0-9A-Fa-f]+)>|\[([^\]]*)\])/g)) {
    const lo = parseInt(m[1], 16), hi = parseInt(m[2], 16);
    if (hi - lo > 65535) continue;
    if (m[3]) { const base = parseInt(m[3], 16); for (let c = lo; c <= hi; c += 1) map.set(c, String.fromCodePoint(base + c - lo)); }
    else { const list = [...m[4].matchAll(/<([0-9A-Fa-f]+)>/g)].map((x) => str(x[1])); for (let c = lo; c <= hi; c += 1) map.set(c, list[c - lo] ?? ""); }
  }
  return map;
}

function fontsOf(resources, objs) {
  const fonts = {};
  for (const [name, n] of Object.entries(named(value(resources ?? "", "Font", objs)))) {
    const f = objs.get(n);
    if (!f) continue;
    const tu = refs(value(f.dict, "ToUnicode"))[0], map = tu && objs.get(tu)?.data ? cmap(objs.get(tu).data.toString("latin1")) : null;
    fonts[name] = { map, wide: /\/Subtype\s*\/Type0/.test(f.dict) };
  }
  return fonts;
}

// A literal string's bytes, with its escapes.
function literal(s) {
  const out = [];
  for (let i = 1; i < s.length - 1; i += 1) {
    const c = s[i];
    if (c !== "\\") { out.push(c.charCodeAt(0)); continue; }
    const n = s[++i];
    if (/[0-7]/.test(n)) { let o = n; while (o.length < 3 && /[0-7]/.test(s[i + 1])) o += s[++i]; out.push(parseInt(o, 8) & 255); }
    else out.push({ n: 10, r: 13, t: 9, b: 8, f: 12 }[n] ?? n.charCodeAt(0));
  }
  return out;
}
function decode(token, font) {
  const codes = token.startsWith("<") ? (token.slice(1, -1).match(font?.wide ? /.{1,4}/g : /.{1,2}/g) ?? []).map((h) => parseInt(h.padEnd(font?.wide ? 4 : 2, "0"), 16)) : literal(token);
  const wideCodes = token.startsWith("(") && font?.wide ? codes.reduce((acc, b, i) => (i % 2 ? (acc[acc.length - 1] = acc[acc.length - 1] * 256 + b, acc) : [...acc, b]), []) : codes;
  return wideCodes.map((c) => (font?.map ? font.map.get(c) ?? "" : String.fromCharCode(c))).join("");
}

const TOKENS = /<<|>>|<[0-9A-Fa-f\s]*>|\((?:\\[\s\S]|[^\\)])*\)|\[|\]|\/[^\s/<>[\]()]+|[-+]?\d*\.?\d+|[A-Za-z*'"]+/g;
const mul = (a, b) => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]];

// Text runs of one content stream, with their positions on the page; form XObjects are followed once.
function runsOf(content, resources, objs, ctm0, out, depth = 0) {
  const fonts = fontsOf(resources, objs), xobjects = named(value(resources ?? "", "XObject", objs));
  let ctm = ctm0, font = null, tm = [1, 0, 0, 1, 0, 0], tlm = tm, leading = 0;
  const saved = [], operands = [];
  const show = (text) => { if (!text) return; const p = mul(tm, ctm); out.push({ x: p[4], y: p[5], t: text }); };
  const tokens = content.match(TOKENS) ?? [];
  for (let i = 0; i < tokens.length; i += 1) {
    const tk = tokens[i];
    if (tk === "[") { const arr = []; while (i + 1 < tokens.length && tokens[i + 1] !== "]") arr.push(tokens[++i]); i += 1; operands.push(arr); continue; }
    if (/^[A-Za-z*'"]+$/.test(tk)) {
      const n = (k) => Number(operands[operands.length - k]);
      switch (tk) {
        case "q": saved.push(ctm); break;
        case "Q": ctm = saved.pop() ?? ctm; break;
        case "cm": ctm = mul([n(6), n(5), n(4), n(3), n(2), n(1)], ctm); break;
        case "BT": tm = tlm = [1, 0, 0, 1, 0, 0]; break;
        case "Tf": font = fonts[String(operands[operands.length - 2]).slice(1)] ?? null; break;
        case "TL": leading = n(1); break;
        case "Tm": tm = tlm = [n(6), n(5), n(4), n(3), n(2), n(1)]; break;
        case "Td": tm = tlm = mul([1, 0, 0, 1, n(2), n(1)], tlm); break;
        case "TD": leading = -n(1); tm = tlm = mul([1, 0, 0, 1, n(2), n(1)], tlm); break;
        case "T*": tm = tlm = mul([1, 0, 0, 1, 0, -leading], tlm); break;
        case "Tj": show(decode(String(operands[operands.length - 1]), font)); break;
        case "'": tm = tlm = mul([1, 0, 0, 1, 0, -leading], tlm); show(decode(String(operands[operands.length - 1]), font)); break;
        case "TJ": { const arr = operands[operands.length - 1]; if (Array.isArray(arr)) show(arr.filter((x) => /^[<(]/.test(x)).map((x) => decode(x, font)).join("")); break; }
        case "Do": {
          const x = objs.get(xobjects[String(operands[operands.length - 1]).slice(1)]);
          if (x?.data && depth < 3 && /\/Subtype\s*\/Form/.test(x.dict)) {
            const m = /\/Matrix\s*\[([^\]]*)\]/.exec(x.dict)?.[1].trim().split(/\s+/).map(Number);
            runsOf(x.data.toString("latin1"), value(x.dict, "Resources", objs) ?? x.dict, objs, m?.length === 6 ? mul(m, ctm) : ctm, out, depth + 1);
          }
          break;
        }
        default: break;
      }
      operands.length = 0;
    } else operands.push(tk);
  }
  return out;
}

// Runs on one baseline, left to right, with a tab between them: where a program draws a table cell by cell,
// each run is a cell. Where it draws character by character, a tab goes only where the gap is far wider
// than the line's usual one, a column boundary.
function joinLine(rs) {
  const gaps = rs.slice(1).map((r, i) => r.x - rs[i].x).filter((g) => g > 0).sort((a, b) => a - b);
  const usual = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
  return rs.map((r, i) => (i && (rs[i - 1].t.trim().length > 1 || (usual && r.x - rs[i - 1].x > 3 * usual)) ? `\t${r.t}` : r.t)).join("");
}

// Each page's lines, top to bottom: runs on one baseline joined left to right.
export function pdfLines(bytes) {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") throw new Error("not a PDF");
  const objs = objects(buf);
  const pages = [...objs.values()].filter((o) => /\/Type\s*\/Page(?![s\w])/.test(o.dict));
  return pages.map((p) => {
    const resources = value(p.dict, "Resources", objs) ?? "";
    const runs = [];
    for (const n of refs(value(p.dict, "Contents"))) { const c = objs.get(n); if (c?.data) runsOf(c.data.toString("latin1"), resources, objs, [1, 0, 0, 1, 0, 0], runs); }
    const rows = new Map();
    for (const r of runs) { const y = Math.round(r.y / 3) * 3; if (!rows.has(y)) rows.set(y, []); rows.get(y).push(r); }
    return [...rows].sort((a, b) => b[0] - a[0]).map(([, rs]) => joinLine(rs.sort((a, b) => a.x - b.x)).replace(/[  ]+/g, " ").replace(/ ?\t ?/g, "\t").trim()).filter(Boolean);
  });
}
