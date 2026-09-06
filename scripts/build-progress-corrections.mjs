// =============================================================================
// build-progress-corrections.mjs
// -----------------------------------------------------------------------------
// /progress's nav label and the homepage's "Read the corrections" link both
// point here, but the corrections record itself only ever existed as data:
// public/paper-state.json's `transparency` array. No page rendered it as
// readable text, so a stranger clicking "Corrections" landed on a build log
// and never saw a correction.
//
// This writes every CORRECTION-prefixed (also RETRACTION / WITHDRAWN, if the
// data ever carries one) transparency entry into progress.html as the FIRST
// section after the hero, newest first, verbatim. It runs at PREBUILD, like
// sync-product-shell.mjs and build-hero-fallbacks.mjs, so the section is
// static HTML, current on every hourly rebuild, and never depends on
// JavaScript to appear.
//
// MARKERS, NOT A FULL-BLOCK REPLACE. sync-product-shell.mjs replaces between
// two structural tags because those tags already exist and are unique. There
// is no such tag here, so progress.html carries two literal HTML comments,
// <!-- corrections:start --> and <!-- corrections:end -->, and only the text
// between them is rewritten. The markers themselves are never touched, so
// this script can find them again on every run: that is what makes it
// idempotent.
//
// VERBATIM, NOT PARSED. The entry text is quoted evidence from a signed log,
// not prose this script is allowed to edit, so it is only ever HTML-escaped,
// never reworded, reordered internally, or stripped of the markdown-looking
// emphasis (`**...**`) some entries carry. The one exception is the leading
// "PREFIX YYYY-MM-DD (optional scope)" fragment, which is wrapped in a <time>
// element (and a scope span) for structure; the characters inside it are
// untouched. Each entry is marked data-verbatim-source="paper-state.json" so the writing audit
// can check that claim against the artifact and exclude the quoted text from its em dash count
// (scripts/lib/verbatim-quotes.mjs); prose this site writes gets no such exclusion.
// =============================================================================

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STATE_PATH = resolve(ROOT, "public", "paper-state.json");
const PAGE_PATH = resolve(ROOT, "progress.html");

const START_MARKER = "<!-- corrections:start -->";
const END_MARKER = "<!-- corrections:end -->";

// A transparency entry that discloses a mistake against our own published
// record, rather than merely narrating an event (a fix, a disclosure, a
// status change). CORRECTION is the only prefix the log currently uses;
// RETRACTION and WITHDRAWN are included because the same reader expectation
// applies if either ever appears, and this is a rule, not a list tied to
// today's data.
const CORRECTION_PREFIX = /^(CORRECTION|RETRACTION|WITHDRAWN)\b/;
// The prefix word, the date it names, and an optional "(scope)" that follows
// it directly, exactly as the log writes it, for example "CORRECTION
// 2026-09-06 (engine README)". Captured so the date can drive a <time
// datetime>, not so the text can be reworded.
const HEAD_PATTERN = /^(?:CORRECTION|RETRACTION|WITHDRAWN)\s+(\d{4}-\d{2}-\d{2})(?:\s*\([^)]*\))?/;

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

/**
 * Every transparency entry whose text opens with a correction-class prefix,
 * newest first. "Newest" is the date the correction itself names (the
 * reader's sense of recency), not the entry's position in the append-only
 * log; entries that share a date keep their original log order reversed,
 * since a later log position is a later publication on the same day.
 */
export function selectCorrections(transparency) {
  if (!Array.isArray(transparency)) {
    throw new Error("build-progress-corrections: paper-state.json has no transparency array");
  }
  const matched = transparency
    .map((text, index) => ({ text, index }))
    .filter(({ text }) => CORRECTION_PREFIX.test(text));

  return matched
    .map(({ text, index }) => {
      const head = text.match(HEAD_PATTERN);
      if (!head) {
        throw new Error(
          `build-progress-corrections: entry ${index} starts with a correction prefix but has no ` +
          `"PREFIX YYYY-MM-DD" head: ${JSON.stringify(text.slice(0, 60))}`,
        );
      }
      return { text, index, date: head[1], headLength: head[0].length };
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.index - a.index));
}

/** One <li>: the head (prefix, date, optional scope) wrapped in a <time>, the rest of the
 *  entry appended untouched. The FULL string is present, character for character; the <time>
 *  only adds structure around a substring already there. */
function renderItem({ text, date, headLength }) {
  const head = text.slice(0, headLength);
  const rest = text.slice(headLength);
  return (
    `      <li class="corrections-item">\n` +
    `        <p class="corrections-item__text body-l" data-verbatim-source="paper-state.json"><time class="corrections-item__date mono-label" datetime="${date}">${escapeHtml(head)}</time>${escapeHtml(rest)}</p>\n` +
    `      </li>`
  );
}

export function renderCorrectionsList(entries) {
  if (!entries.length) {
    throw new Error("build-progress-corrections: no CORRECTION-prefixed entries found in the transparency log");
  }
  return (
    `<ol class="corrections-list" aria-label="Corrections, newest first">\n` +
    `${entries.map(renderItem).join("\n")}\n` +
    `      </ol>`
  );
}

function replaceBetweenMarkers(source, inner) {
  const start = source.indexOf(START_MARKER);
  if (start < 0) throw new Error(`progress.html: no ${START_MARKER}`);
  if (source.indexOf(START_MARKER, start + 1) >= 0) throw new Error(`progress.html: ${START_MARKER} appears twice`);
  const contentStart = start + START_MARKER.length;
  const end = source.indexOf(END_MARKER, contentStart);
  if (end < 0) throw new Error(`progress.html: ${START_MARKER} never closes with ${END_MARKER}`);
  return `${source.slice(0, contentStart)}\n      ${inner}\n      ${source.slice(end)}`;
}

function main() {
  if (!existsSync(STATE_PATH)) {
    throw new Error(`build-progress-corrections: missing ${STATE_PATH}`);
  }
  const state = JSON.parse(readFileSync(STATE_PATH, "utf8"));
  const entries = selectCorrections(state.transparency);
  const list = renderCorrectionsList(entries);

  const before = readFileSync(PAGE_PATH, "utf8");
  const after = replaceBetweenMarkers(before, list);

  if (after !== before) {
    writeFileSync(PAGE_PATH, after);
    console.log(`  progress corrections: ${entries.length} entr${entries.length === 1 ? "y" : "ies"} written (newest ${entries[0].date})`);
  } else {
    console.log(`  progress corrections: ok, ${entries.length} entries, unchanged`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
