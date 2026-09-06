import * as React from "react";

/**
 * Turns a single-root-element HTML string into a React element with the SAME tag name,
 * the SAME attributes (in the same order) and the SAME inner HTML, instead of wrapping it
 * in an extra container. This is what lets ShellHeader/ShellFooter render byte-identical
 * markup to scripts/product-shell.mjs's string output: no attribute is retyped by hand
 * (which could drift), and no wrapper element is introduced (which would not).
 */
export function rawElementFromHtml(html: string): React.ReactElement {
  const trimmed = html.trim();
  const openMatch = trimmed.match(/^<([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^<>]*)?)>/);
  if (!openMatch) {
    throw new Error("rawElementFromHtml: expected a single root element, found none");
  }
  const [openTag, tagName, attrString] = openMatch;
  const closeTag = `</${tagName}>`;
  if (!trimmed.endsWith(closeTag)) {
    throw new Error(`rawElementFromHtml: expected the string to end with ${closeTag}`);
  }
  const inner = trimmed.slice(openTag.length, trimmed.length - closeTag.length);
  const props = attributesToProps(attrString);
  return React.createElement(tagName, { ...props, dangerouslySetInnerHTML: { __html: inner } });
}

function attributesToProps(attrString: string): Record<string, string> {
  const props: Record<string, string> = {};
  const re = /([a-zA-Z_:][a-zA-Z0-9_:.-]*)(?:="([^"]*)")?/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(attrString))) {
    const name = match[1];
    const value = match[2] ?? "";
    if (name === "class") props.className = value;
    else props[name] = value;
  }
  return props;
}
