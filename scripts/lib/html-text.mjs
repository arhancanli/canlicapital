import { parseHTML } from 'linkedom';

// Extract prose with the HTML parser, including entity decoding. Re-escape it
// before placing it in generated markup; text extraction is not sanitization.
export function htmlText(source) {
  const { document } = parseHTML(`<!doctype html><html><head></head><body>${source}</body></html>`);
  for (const node of document.querySelectorAll('script,style')) node.remove();
  return document.body.textContent;
}

export function escapeHtml(text) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(text).replace(/[&<>"']/g, character => entities[character]);
}

export function htmlWithoutElements(source, selectors) {
  const { document } = parseHTML(source);
  for (const node of document.querySelectorAll(selectors)) node.remove();
  return document.toString();
}
