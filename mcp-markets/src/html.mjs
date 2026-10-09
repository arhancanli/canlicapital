// Filing documents as text a model can read: HTML to lines, and a filing cut into its items.
// No dependencies; EDGAR's HTML is regular enough for this, and the tests pin real filings.

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", rsquo: "'", lsquo: "'", rdquo: "\"", ldquo: "\"", ndash: "-", mdash: "-", bull: "*", hellip: "...", reg: "(R)", trade: "(TM)", copy: "(C)", sect: "§", middot: "·" };

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      if (code === 160) return " ";
      if (code === 8217 || code === 8216) return "'";
      if (code === 8220 || code === 8221) return "\"";
      if (code === 8211 || code === 8212) return "-";
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

// Block elements end a line; table cells are separated by " | " so a row stays on one line.
export function htmlToText(html) {
  let s = String(html);
  s = s.replace(/<ix:header[\s\S]*?<\/ix:header[^>]*>/gi, "");
  s = s.replace(/<(script|style|head|title)\b[\s\S]*?<\/\1[^>]*>/gi, "");
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<div[^>]*display:\s*none[^>]*>[\s\S]*?<\/div>/gi, "");
  s = s.replace(/<\/(td|th)>/gi, " | ");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/?(p|div|tr|table|li|ul|ol|h[1-6]|center|section|article|hr)\b[^>]*>/gi, "\n");
  // Repeat until stable, so a tag split by another tag cannot survive one pass.
  for (let prev = null; prev !== s;) { prev = s; s = s.replace(/<[^>]*>/g, ""); }
  s = s.replace(/[<>]/g, " ");
  s = decodeEntities(s);
  const lines = [];
  for (let line of s.split("\n")) {
    line = line.replace(/[ \t ​]+/g, " ").replace(/(\s*\|\s*)+$/, "").replace(/^(\s*\|\s*)+/, "").replace(/(\s*\|\s*){2,}/g, " | ").trim();
    if (line && !/^\|?$/.test(line)) lines.push(line);
  }
  // Drop runs of bare page numbers and running headers such as "Table of Contents".
  return lines.filter((l) => !/^(\d{1,3}|page \d+|table of contents)$/i.test(l)).join("\n");
}

const ITEM_RE = /^(?:item|items)\s*(\d{1,2}(?:\.\d{2})?[a-c]?)\s*(?:[.:\-–—]|\s|$)\s*(.{0,160})$/i;
const PART_RE = /^part\s+(i{1,3}|iv)\b(?:\s*[.:\-–—]?\s*(.{0,80}))?$/i;

// Named sections, as people ask for them. 10-Q items are numbered within parts.
export const SECTION_ALIASES = Object.freeze({
  "10-K": { business: "1", "risk factors": "1A", risks: "1A", "unresolved staff comments": "1B", cybersecurity: "1C", properties: "2", "legal proceedings": "3", "market for common equity": "5", "md&a": "7", mda: "7", "management's discussion": "7", "managements discussion": "7", "market risk": "7A", "financial statements": "8", "controls and procedures": "9A", controls: "9A", directors: "10", "executive compensation": "11", compensation: "11", "security ownership": "12", "principal accountant": "14", exhibits: "15" },
  "10-Q": { "financial statements": "I-1", "md&a": "I-2", mda: "I-2", "management's discussion": "I-2", "managements discussion": "I-2", "market risk": "I-3", controls: "I-4", "controls and procedures": "I-4", "legal proceedings": "II-1", "risk factors": "II-1A", risks: "II-1A", "unregistered sales": "II-2", "share repurchases": "II-2", "other information": "II-5", exhibits: "II-6" },
});

const ROMAN = { i: "I", ii: "II", iii: "III", iv: "IV" };

// Every item heading in the text, with the part it sits in. A heading's section runs to the next
// heading; the table of contents produces headings too, so each item keeps its longest span.
export function findSections(text, form = "10-K") {
  const lines = text.split("\n");
  const quarterly = /^10-Q/i.test(form);
  const heads = [];
  let part = null;
  lines.forEach((line, i) => {
    const p = line.match(PART_RE);
    if (p && line.length < 90) { part = ROMAN[p[1].toLowerCase()]; return; }
    if (line.length > 200) return;
    const m = line.match(ITEM_RE);
    if (!m) return;
    const num = m[1].toUpperCase();
    let title = m[2].replace(/\s*\|\s*\d*\s*$/, "").replace(/\s*\.{2,}.*$/, "").trim();
    // A heading split across lines: "Item 1A." then "Risk Factors".
    if (!title && lines[i + 1] && lines[i + 1].length < 120) title = lines[i + 1].replace(/\s*\|\s*\d*\s*$/, "").trim();
    const key = quarterly && part ? `${part}-${num}` : num;
    heads.push({ key, num, part, title, line: i });
  });
  const spans = heads.map((h, j) => ({ ...h, end: j + 1 < heads.length ? heads[j + 1].line : lines.length }));
  // The body starts at the longest "Item 1" (Part I Item 1 in a 10-Q); the table of contents sits
  // before it, so an item that also appears after it is taken from there.
  const firstKey = quarterly ? "I-1" : "1";
  const longest = (key) => spans.filter((s) => s.key === key).reduce((a, s) => { const c = lines.slice(s.line, s.end).join("\n").length; return !a || c > a.c ? { s, c } : a; }, null);
  const bodyStart = longest(firstKey)?.s.line ?? 0;
  const inBody = new Set(spans.filter((s) => s.line >= bodyStart).map((s) => s.key));
  const best = new Map();
  for (const s of spans) {
    if (s.line < bodyStart && inBody.has(s.key)) continue;
    const chars = lines.slice(s.line, s.end).join("\n").length;
    const prev = best.get(s.key);
    if (!prev || chars > prev.chars) best.set(s.key, { ...s, chars });
  }
  // An item can continue after a sub-heading that looks like an item ("Item 7. ... continued");
  // order by position so a section never overlaps the one after it.
  const ordered = [...best.values()].sort((a, b) => a.line - b.line);
  ordered.forEach((s, j) => {
    const nextStart = j + 1 < ordered.length ? ordered[j + 1].line : lines.length;
    // Stretch to the next chosen heading: text between a section and the next chosen one belongs to it.
    if (nextStart > s.end) s.end = nextStart;
    s.chars = lines.slice(s.line, s.end).join("\n").length;
  });
  return { lines, sections: ordered };
}

export function resolveSection(query, form, sections) {
  const q = String(query).trim().toLowerCase().replace(/^item\s*/, "").replace(/\s+/g, " ");
  const quarterly = /^10-Q/i.test(form);
  const aliases = SECTION_ALIASES[quarterly ? "10-Q" : "10-K"];
  const keys = new Set(sections.map((s) => s.key));
  const want = aliases[q] ?? (quarterly && /^[0-9]/.test(q) ? (keys.has(`I-${q.toUpperCase()}`) ? `I-${q.toUpperCase()}` : `II-${q.toUpperCase()}`) : q.toUpperCase().replace(/^PART\s*/, ""));
  let hit = sections.find((s) => s.key === want);
  if (!hit) hit = sections.find((s) => s.title.toLowerCase().includes(q));
  return hit ?? null;
}
