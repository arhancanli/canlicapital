// Check the generated standard and its final build output before publication.
// This checks our static skip-target contract; it is not a browser/WCAG audit.
import { constants, closeSync, fstatSync, openSync, readSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const MAX_STANDARD_HTML_BYTES = 2 * 1024 * 1024;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function refuse(code) {
  throw new Error(`STANDARD_SKIP_FOCUS_${code}`);
}

function openingTags(html) {
  // Our generated page has ordinary HTML attributes. Ignore comments and raw
  // script/style bodies so an example cannot stand in for a document target.
  // Preserve their span: deleting it can join text into a different tag.
  const markup = html.replace(/<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
    (ignored) => " ".repeat(ignored.length));
  const tags = [];
  for (const match of markup.matchAll(/<([a-z][\w:-]*)\b((?:"[^"]*"|'[^']*'|[^'">])*)>/gi)) {
    const text = match[2].replace(/\/\s*$/, "");
    const attrs = new Map();
    const attribute = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+)))?/y;
    let offset = 0;
    while (offset < text.length) {
      while (/\s/.test(text[offset] ?? "") && offset < text.length) offset++;
      if (offset === text.length) break;
      attribute.lastIndex = offset;
      const parsed = attribute.exec(text);
      if (!parsed) refuse("ATTRIBUTE_SYNTAX");
      const name = parsed[1].toLowerCase();
      if (attrs.has(name)) refuse("DUPLICATE_ATTRIBUTE");
      attrs.set(name, parsed[2] ?? parsed[3] ?? parsed[4] ?? null);
      offset = attribute.lastIndex;
    }
    tags.push({ name: match[1].toLowerCase(), attrs });
  }
  return tags;
}

export function assertStandardSkipFocus(html) {
  if (typeof html !== "string") refuse("INPUT_TYPE");
  if (Buffer.byteLength(html, "utf8") > MAX_STANDARD_HTML_BYTES) refuse("INPUT_BYTES");
  const tags = openingTags(html);
  const targets = tags.filter(({ attrs }) => attrs.get("id") === "content");
  if (targets.length !== 1 || targets[0].name !== "main") refuse("TARGET_ID");
  if (targets[0].attrs.get("tabindex") !== "-1") refuse("TARGET_TABINDEX");
  const skips = tags.filter(({ name, attrs }) => name === "a" &&
    (attrs.get("class") ?? "").split(/\s+/).includes("dev-skip"));
  if (skips.length !== 1) refuse("SKIP_COUNT");
  if (!(skips[0].attrs.get("class") ?? "").split(/\s+/).includes("skip-link")) refuse("SKIP_CLASS");
  if (skips[0].attrs.get("href") !== "#content") refuse("SKIP_HREF");
  return { route: "/standards/paper-evidence", target: "content", tabindex: "-1" };
}

export function readStandardHTML(path) {
  let fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || before.size > MAX_STANDARD_HTML_BYTES) refuse("FILE_BYTES");
    const buffer = Buffer.alloc(MAX_STANDARD_HTML_BYTES + 1);
    let bytes = 0;
    while (bytes < buffer.length) {
      const count = readSync(fd, buffer, bytes, buffer.length - bytes, null);
      if (count === 0) break;
      bytes += count;
    }
    if (bytes > MAX_STANDARD_HTML_BYTES) refuse("FILE_BYTES");
    const after = fstatSync(fd);
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || bytes !== after.size) {
      refuse("FILE_CHANGED");
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, bytes));
  } finally {
    const owned = fd;
    fd = undefined;
    closeSync(owned);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const relative of ["standards/paper-evidence.html", "dist/standards/paper-evidence.html"]) {
    assertStandardSkipFocus(readStandardHTML(resolve(ROOT, relative)));
    console.log(`${relative}: generated skip link and focus target verified`);
  }
}
