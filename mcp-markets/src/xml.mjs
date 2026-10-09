// A small XML reader for SEC's flat XML forms (Form 4, 13F information tables). Namespaces are
// dropped; elements become { name, attrs, children, text }. Not a general XML parser: no DTDs.
import { decodeEntities } from "./html.mjs";

export function parseXml(xml) {
  const root = { name: "#root", attrs: {}, children: [], text: "" };
  const stack = [root];
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/\s*([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(xml))) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) top.text += m[1];
    else if (m[2]) {
      const name = m[2].replace(/^.*:/, "");
      // Close up to the matching element; tolerate stray closers.
      for (let i = stack.length - 1; i > 0; i--) if (stack[i].name === name) { stack.length = i; break; }
    } else if (m[3]) {
      const attrs = {};
      for (const a of m[4].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1].replace(/^.*:/, "")] = decodeEntities(a[2] ?? a[3]);
      const el = { name: m[3].replace(/^.*:/, ""), attrs, children: [], text: "" };
      top.children.push(el);
      if (!m[5]) stack.push(el);
    } else if (m[6] !== undefined) top.text += decodeEntities(m[6]);
  }
  return root;
}

export const child = (el, name) => el?.children.find((c) => c.name === name);
export const children = (el, name) => el?.children.filter((c) => c.name === name) ?? [];
// Text at a path of element names; a final "value" wrapper (Form 4 style) is read through.
export function textAt(el, ...path) {
  let cur = el;
  for (const p of path) cur = child(cur, p);
  if (!cur) return null;
  const v = child(cur, "value");
  const t = (v ? v.text : cur.text).trim();
  return t === "" ? null : t;
}
export function all(el, name, out = []) {
  for (const c of el.children) { if (c.name === name) out.push(c); all(c, name, out); }
  return out;
}
export const num = (s) => (s == null || s === "" || !Number.isFinite(Number(s)) ? null : Number(s));
