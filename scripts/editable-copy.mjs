// =============================================================================
// editable-copy.mjs
// -----------------------------------------------------------------------------
// The em-dash publishing contract, defined ONCE.
//
// audit-writing.mjs locks every editable scope at zero em-dash forms, so each
// generator rewrites the dashes in its source documents into ordinary
// punctuation before rendering. That rewrite was previously copy-pasted into
// three generators. All three copies happened to be byte-identical, which is
// luck, not a guarantee: the moment one is edited the site renders a title one
// way and verifies it another.
//
// It also had a second, sharper consequence. verify-papers.mjs asserts that a
// rendered page presents the document's real name, and it read that name
// straight from the markdown, un-normalized. So for the twenty papers whose
// titles contain a literal em dash, the identity check compared a source title
// against a normalized rendering and could never pass, while the writing
// ratchet could never allow the un-normalized form to be published. Two gates,
// both correct in isolation, jointly unsatisfiable.
//
// The rule and the check now read the same definition, from here.
// =============================================================================

/** U+2014, built rather than typed: this file is scanned by the ratchet too. */
export const emDashCharacter = String.fromCharCode(8212);

/** Every spelling of an em dash that can appear in editable copy. */
export const editableDashForms = [emDashCharacter, `&${"mdash"};`, `&#${"8212"};`];

/**
 * Rewrite em-dash forms into ordinary punctuation, preserving the author's
 * intent per position: a heading dash becomes a colon, a matched pair becomes
 * parentheses, a trailing dash becomes a semicolon, and an ordinary interruptive
 * dash becomes a semicolon plus space.
 */
export const normalizeEditableCopy = (value) =>
  editableDashForms.reduce(
    (copy, dash) => copy
      .replace(new RegExp(`(<h[1-6][^>]*>[^\\n]*?)[ \\t]+${dash}[ \\t]+`, "g"), "$1: ")
      .replace(new RegExp(`[ \\t]+${dash}[ \\t\\r\\n]+([^<>]{1,320}?)[ \\t]+${dash}[ \\t\\r\\n]+`, "gs"), " ($1) ")
      .replace(new RegExp(`[ \\t]+${dash}(?=\\r?\\n)`, "g"), ";")
      .replace(new RegExp(`[ \\t]+${dash}[ \\t]+`, "g"), "; ")
      .replaceAll(dash, ": "),
    String(value),
  );
