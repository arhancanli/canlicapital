// Extracts every class name that appears anywhere in a CSS selector list (including inside
// descendant/combinator selectors, e.g. `.ledger__what .small` yields both "ledger__what" and
// "small"), so a guard test can check that a component never emits a class the stylesheet
// does not style.
import { readFileSync } from "node:fs";

export function extractClassSelectors(cssText) {
  // Strip comments and declaration bodies, leaving only selector lists.
  const withoutComments = cssText.replace(/\/\*[\s\S]*?\*\//g, "");
  // Collapse only the innermost, brace-free blocks (the actual property:value declaration
  // lists) to ";". Deliberately a single pass: a second pass would also swallow an @media
  // wrapper's now brace-free body, which still contains real nested selectors (e.g.
  // `@media (...) { .foo { ... } .bar { ... } }` becomes `@media (...) { .foo ; .bar ; }`
  // after one pass, a string a second pass would wrongly treat as one more declaration body
  // and collapse away, taking ".foo" and ".bar" with it).
  const withoutBodies = withoutComments.replace(/\{[^{}]*\}/g, ";");
  const classes = new Set();
  const re = /\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)/g;
  let match;
  while ((match = re.exec(withoutBodies))) {
    classes.add(match[1]);
  }
  return classes;
}

export function loadStylesheetClasses(cssPath) {
  const cssText = readFileSync(cssPath, "utf8");
  return extractClassSelectors(cssText);
}

/** Every class token used in a `className="a b c"` string. */
export function classNamesFromHtml(html) {
  const classes = new Set();
  const re = /class="([^"]*)"/g;
  let match;
  while ((match = re.exec(html))) {
    for (const token of match[1].split(/\s+/).filter(Boolean)) classes.add(token);
  }
  return classes;
}
