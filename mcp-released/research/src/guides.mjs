// Guided prompts and code resources for canli-research-mcp.
//
// Prompts are the three questions this server exists to answer: has an idea already been tried
// (and why it died), how honest is Canli Capital's own record, and what does the research say
// about a topic. Resources give each tool's exact JSON Schemas and a working call in Python,
// JavaScript or curl against the hosted endpoint, so an agent can write code against the server
// without guessing; canli://limits states what every result does not establish.
import { ResourceTemplate } from "@modelcontextprotocol/server";
import { z } from "zod";

export const HOSTED_URL = "https://canlicapital.com/mcp/research";
export const EXAMPLE_LANGUAGES = Object.freeze(["python", "javascript", "curl"]);

// Valid arguments for each tool (a test parses every one against the tool's input schema).
export const EXAMPLE_ARGS = Object.freeze({
  search_research: { query: "momentum", limit: 5 },
  list_topics: {},
  get_paper: { slug: "crypto-carry-lineage", section: "Results", max_chars: 4000 },
  trial_ledger: {},
  live_record: {},
  chain_head: {},
});

export function registerPrompts(server) {
  const prompt = (name, title, description, argsSchema, lines) => server.registerPrompt(name, { title, description, argsSchema }, (args) => ({
    messages: [{ role: "user", content: { type: "text", text: lines(args ?? {}).filter(Boolean).join("\n") } }],
  }));
  prompt(
    "preflight_idea",
    "Has this quant idea already been tried?",
    "Before testing an idea: whether Canli Capital already tested it, how it was killed or survived, and what the literature says.",
    { idea: z.string().describe("The idea in a sentence, such as 'buy stocks after insider purchases'") },
    ({ idea }) => [
      `Search Canli Capital's research for "${idea}" with search_research, trying two or three phrasings and its key words.`,
      "For each relevant paper, read its outcome with get_paper (a section such as Results, Verdict or Conclusion) and note whether the candidate was killed, survived, or is still a protocol.",
      "Call trial_ledger, so any published result is judged against how many hypotheses were tried.",
      "Report whether it was tried, what happened and why, what the literature reviews say, which pitfalls apply (look-ahead, survivorship, costs, multiple testing), and what a clean test would need. Quote the limits each result carries.",
    ],
  );
  prompt(
    "audit_canli_record",
    "How honest is Canli Capital's own record?",
    "Hypotheses tried against the declared budget, the live paper record with its limits, and how to check the record was not rewritten.",
    {},
    () => [
      "Call trial_ledger, live_record and chain_head.",
      "Report how many hypotheses were tried, killed and survived against the declared budget; the live paper record's returns, costs and risk with every limit it states; and how to verify the chain head independently.",
      "Say plainly that a paper record is not live money, and quote the limits sentences.",
    ],
  );
  prompt(
    "literature_review",
    "What does the research say about a topic?",
    "Every Canli Capital paper on a topic, summarized with links.",
    { topic: z.string().describe("A topic or keyword, such as 'momentum' or 'treasury auctions'") },
    ({ topic }) => [
      `Call list_topics, pick the topics that match "${topic}", and run search_research for it.`,
      "Read the literature reviews and strategy tests with get_paper, using section to keep each read short.",
      "Summarize what was tested, what held up and what was killed, citing each paper by title and URL, and quote the limits.",
    ],
  );
}

export function exampleCode(language, tool) {
  const args = EXAMPLE_ARGS[tool] ?? {};
  const json = JSON.stringify(args, null, 2);
  if (language === "python") {
    return [
      "# pip install mcp",
      "# The hosted endpoint: no install of this server and no key.",
      "import asyncio",
      "from mcp import ClientSession",
      "from mcp.client.streamable_http import streamablehttp_client",
      "",
      "async def main():",
      `    async with streamablehttp_client("${HOSTED_URL}") as (read, write, _):`,
      "        async with ClientSession(read, write) as session:",
      "            await session.initialize()",
      `            result = await session.call_tool("${tool}", ${json.replace(/\n/g, "\n            ").replace(/\btrue\b/g, "True").replace(/\bfalse\b/g, "False").replace(/\bnull\b/g, "None")})`,
      "            print(result.structuredContent)",
      "",
      "asyncio.run(main())",
      "",
    ].join("\n");
  }
  if (language === "javascript") {
    return [
      "// npm install @modelcontextprotocol/sdk",
      "// The hosted endpoint: no install of this server and no key.",
      'import { Client } from "@modelcontextprotocol/sdk/client/index.js";',
      'import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";',
      "",
      'const client = new Client({ name: "example", version: "1.0.0" });',
      `await client.connect(new StreamableHTTPClientTransport(new URL("${HOSTED_URL}")));`,
      `const result = await client.callTool({ name: "${tool}", arguments: ${json} });`,
      "console.log(result.structuredContent);",
      "await client.close();",
      "",
    ].join("\n");
  }
  if (language === "curl") {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool, arguments: args } });
    return [
      "# The hosted endpoint is stateless: one POST per call, no session and no key.",
      `curl -s ${HOSTED_URL} \\`,
      "  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \\",
      `  --data '${body.replace(/'/g, "'\\''")}'`,
      "",
    ].join("\n");
  }
  throw new Error(`No example language ${language}; choose ${EXAMPLE_LANGUAGES.join(", ")}`);
}

// catalog: { toolName: { description, inputSchema, outputSchema } } for every tool the server lists.
export function registerResources(server, catalog, limits) {
  const names = Object.keys(catalog).sort();
  const complete = (list) => (value) => list.filter((n) => n.startsWith(value ?? ""));
  server.registerResource(
    "tool-schema",
    new ResourceTemplate("canli://schemas/{tool}", { list: undefined, complete: { tool: complete(names) } }),
    { title: "A tool's exact JSON Schemas", description: "Input and output JSON Schema and the description of one tool, for writing code against it.", mimeType: "application/json" },
    (uri, { tool }) => {
      const entry = catalog[tool];
      if (!entry) throw new Error(`No tool ${tool}; tools are ${names.join(", ")}`);
      const body = { tool, description: entry.description, input_schema: z.toJSONSchema(entry.inputSchema, { io: "input" }), output_schema: z.toJSONSchema(entry.outputSchema, { io: "output" }) };
      return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(body, null, 2) }] };
    },
  );
  server.registerResource(
    "example",
    new ResourceTemplate("canli://examples/{language}/{tool}", { list: undefined, complete: { language: complete([...EXAMPLE_LANGUAGES]), tool: complete(names) } }),
    { title: "A working call, in Python, JavaScript or curl", description: "Runnable client code calling one tool on the hosted endpoint with valid example arguments.", mimeType: "text/plain" },
    (uri, { language, tool }) => {
      if (!catalog[tool]) throw new Error(`No tool ${tool}; tools are ${names.join(", ")}`);
      return { contents: [{ uri: uri.href, mimeType: "text/plain", text: exampleCode(language, tool) }] };
    },
  );
  server.registerResource(
    "limits",
    "canli://limits",
    { title: "What a result does not establish", description: "The limits every research result carries; quote them with any finding.", mimeType: "application/json" },
    (uri) => ({ contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify({ limits }, null, 2) }] }),
  );
}
