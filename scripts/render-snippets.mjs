// scripts/render-snippets.mjs
// One request example, three languages. Every renderer embeds the SAME JSON text (the manifest's
// requestExample, or an explicit override) on its own line, so a test can pull it back out with a
// regex and prove curl, Python and JavaScript cannot silently drift from each other or from what
// the handler accepts. $CANLI_KEY is the placeholder every snippet on /developers shares; the
// inline script in build-standards-and-developers.mjs substitutes it into every pre.dev-code block
// at once, curl and Python and JavaScript alike.
//
// A route can declare `modes`: a discriminated union of input shapes (deflated-sharpe's "seven
// contract fields" OR "a return series plus its trials") rather than one flattened example. The
// renderers below know nothing about modes themselves; they render whatever example they are
// given. build-standards-and-developers.mjs calls renderAll(m, mode.example) once per mode for a
// moded route, so each mode gets its own labelled curl/Python/JavaScript trio instead of one
// example that could only ever show a single shape.
const ORIGIN = "https://canlicapital.com";
const jsonLine = (example) => JSON.stringify(example);

export function renderCurl(m, example = m.requestExample) {
  const authLine = m.keyed ? ` \\\n  -H "Authorization: Bearer $CANLI_KEY"` : "";
  return `curl -X POST ${ORIGIN}${m.path}${authLine} \\\n  -H "Content-Type: application/json" \\\n  -d '${jsonLine(example)}'`;
}

export function renderPython(m, example = m.requestExample) {
  const authLine = m.keyed ? `\nreq.add_header("Authorization", "Bearer $CANLI_KEY")` : "";
  return [
    "import json",
    "import urllib.request",
    "",
    `body = ${jsonLine(example)}`,
    `req = urllib.request.Request("${ORIGIN}${m.path}", data=json.dumps(body).encode("utf-8"), method="POST")`,
    `req.add_header("Content-Type", "application/json")${authLine}`,
    "with urllib.request.urlopen(req) as response:",
    "    print(response.read().decode(\"utf-8\"))",
  ].join("\n");
}

export function renderJs(m, example = m.requestExample) {
  const authLine = m.keyed ? `, "Authorization": "Bearer $CANLI_KEY"` : "";
  return [
    `const body = ${jsonLine(example)};`,
    `const response = await fetch("${ORIGIN}${m.path}", {`,
    "  method: \"POST\",",
    `  headers: { "Content-Type": "application/json"${authLine} },`,
    "  body: JSON.stringify(body),",
    "});",
    "console.log(await response.json());",
  ].join("\n");
}

/** curl, Python and JavaScript for one manifest route (or one of its modes), in that order. */
export function renderAll(m, example = m.requestExample) {
  return [
    { lang: "curl", code: renderCurl(m, example) },
    { lang: "python", code: renderPython(m, example) },
    { lang: "javascript", code: renderJs(m, example) },
  ];
}
