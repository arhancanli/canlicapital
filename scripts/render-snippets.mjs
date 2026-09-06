// scripts/render-snippets.mjs
// One request example, three languages. Every renderer embeds the SAME JSON text from the
// manifest's requestExample, on its own line, so a test can pull it back out with a regex and
// prove curl, Python and JavaScript cannot silently drift from each other or from what the
// handler accepts. $CANLI_KEY is the placeholder every snippet on /developers shares; the inline
// script in build-standards-and-developers.mjs substitutes it into every pre.dev-code block at
// once, curl and Python and JavaScript alike.
const ORIGIN = "https://canlicapital.com";
const jsonLine = (example) => JSON.stringify(example);

export function renderCurl(m) {
  const authLine = m.keyed ? ` \\\n  -H "Authorization: Bearer $CANLI_KEY"` : "";
  return `curl -X POST ${ORIGIN}${m.path}${authLine} \\\n  -H "Content-Type: application/json" \\\n  -d '${jsonLine(m.requestExample)}'`;
}

export function renderPython(m) {
  const authLine = m.keyed ? `\nreq.add_header("Authorization", "Bearer $CANLI_KEY")` : "";
  return [
    "import json",
    "import urllib.request",
    "",
    `body = ${jsonLine(m.requestExample)}`,
    `req = urllib.request.Request("${ORIGIN}${m.path}", data=json.dumps(body).encode("utf-8"), method="POST")`,
    `req.add_header("Content-Type", "application/json")${authLine}`,
    "with urllib.request.urlopen(req) as response:",
    "    print(response.read().decode(\"utf-8\"))",
  ].join("\n");
}

export function renderJs(m) {
  const authLine = m.keyed ? `, "Authorization": "Bearer $CANLI_KEY"` : "";
  return [
    `const body = ${jsonLine(m.requestExample)};`,
    `const response = await fetch("${ORIGIN}${m.path}", {`,
    "  method: \"POST\",",
    `  headers: { "Content-Type": "application/json"${authLine} },`,
    "  body: JSON.stringify(body),",
    "});",
    "console.log(await response.json());",
  ].join("\n");
}

/** curl, Python and JavaScript for one manifest route, in that order. */
export function renderAll(m) {
  return [
    { lang: "curl", code: renderCurl(m) },
    { lang: "python", code: renderPython(m) },
    { lang: "javascript", code: renderJs(m) },
  ];
}
