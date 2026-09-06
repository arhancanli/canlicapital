// Quoted artifact text inside a page. An element carrying data-verbatim-source="<artifact>"
// says: this text is copied, character for character, from that published artifact under
// public/, and is not prose anyone on this site wrote. The writing audit excludes such an
// element from its em dash count ONLY after checking that claim against the artifact. A marked
// element whose text is NOT in the artifact is reported as a failure, not silently counted, so
// the marker cannot be used to hide prose. Nothing else is exempt.
const ELEMENT = /<([a-z][\w-]*)\b([^>]*?)\sdata-verbatim-source="([^"]+)"([^>]*)>([\s\S]*?)<\/\1>/g;

export function unescapeHtml(text) {
  return String(text)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Every string value anywhere inside a parsed JSON artifact. */
export function artifactStrings(node, out = new Set()) {
  if (typeof node === "string") out.add(node);
  else if (Array.isArray(node)) for (const item of node) artifactStrings(item, out);
  else if (node && typeof node === "object") for (const value of Object.values(node)) artifactStrings(value, out);
  return out;
}

/**
 * Split marked elements out of an HTML string. `loadArtifact(name)` returns the Set of strings
 * in public/<name> (or null if the artifact does not exist). Returns the HTML with every
 * VERIFIED element removed, plus a failure line for every marked element that is not verbatim.
 */
export function stripVerifiedVerbatim(html, loadArtifact) {
  const failures = [];
  const kept = html.replace(ELEMENT, (whole, _tag, _pre, artifact, _post, inner) => {
    const strings = loadArtifact(artifact);
    if (!strings) {
      failures.push(`data-verbatim-source="${artifact}" names an artifact that does not exist under public/`);
      return whole;
    }
    const text = unescapeHtml(inner.replace(/<[^>]+>/g, "")).trim();
    if (strings.has(text)) return "";
    failures.push(`data-verbatim-source="${artifact}" element is not verbatim in that artifact: ${text.slice(0, 80)}`);
    return whole;
  });
  return { kept, failures };
}
