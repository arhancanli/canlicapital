#!/usr/bin/env node
// canli-research-mcp: Canli Capital's open research record as MCP tools. Every paper, every killed
// candidate, the count of hypotheses tried, the live paper record and the chain that shows it was
// not rewritten, read from the static files canlicapital.com publishes. Nothing here computes or
// writes; each result carries the limits its source states.
//
// Built to the family's cost and latency rules: six tools, so the tool list an agent re-reads every
// turn stays small and byte-identical (providers cache it); only static, CDN-served files are read;
// each file is cached in memory for the session; results are compact JSON.
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import { fetchBoundedText, ResponseReadError } from "./bounded-response.mjs";

export const SERVER_NAME = "canli-research-mcp";
export const SERVER_VERSION = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
// Sent once in initialize; clients such as Claude Code put it in the system prompt, so the model
// knows the first call to make even when tool definitions are deferred. Byte-stable across runs.
export const SERVER_INSTRUCTIONS = "Canli Capital's open research record. Find papers with search_research or list_topics, then read one with get_paper, using section for one part. trial_ledger says how many hypotheses were tried, which any published result should be judged against, and live_record is the paper-trading record. Each result carries its source's own limits; quote them with any finding.";

// How the server introduces itself in initialize: a readable title, the page that documents it
// and its icon, so clients and directories that read serverInfo show more than a package name.
export const SERVER_INFO = Object.freeze({
  name: SERVER_NAME,
  version: SERVER_VERSION,
  title: "Canli Research",
  websiteUrl: "https://canlicapital.com/developers#mcp-research",
  icons: [
    { src: "https://canlicapital.com/icon-512.png", mimeType: "image/png", sizes: ["512x512"] },
    { src: "https://canlicapital.com/favicon.svg", mimeType: "image/svg+xml", sizes: ["any"] },
  ],
});
const DEFAULT_BASE = "https://canlicapital.com";
const REQUEST_TIMEOUT_MS = 15000;
const MAX_BYTES = 4 * 1024 * 1024;
const CACHE_MS = 10 * 60 * 1000;

// The boundary every research result carries, beside the source's own limits.
export const RESEARCH_LIMITS = Object.freeze([
  "These are research documents as Canli Capital published them; each paper states its own claim boundary, and a finding holds only within it.",
  "Paper execution only: nothing here is funded performance or investment advice.",
]);

export function createSession({ base, fetchImpl, now = () => Date.now() } = {}) {
  return { base: base ?? process.env.CANLI_API_BASE ?? DEFAULT_BASE, fetchImpl: fetchImpl ?? fetch, now, cache: new Map() };
}

function deadlineError(session, path) {
  return new Error(path + " exceeded the request deadline at " + session.base + ". The research files are static; retry in a moment.");
}

async function fetchText(session, path, validate = (text) => text) {
  const hit = session.cache.get(path);
  const age = hit ? session.now() - hit.at : NaN;
  if (hit && Number.isFinite(age) && age >= 0 && age < CACHE_MS) {
    try {
      return validate(hit.text);
    } catch (error) {
      // Only evict the exact invalid hit; a newer concurrent result remains valid.
      if (session.cache.get(path) === hit) session.cache.delete(path);
      throw error;
    }
  }
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  let text;
  try {
    text = await fetchBoundedText(session.fetchImpl, session.base + path, { signal, maxBytes: MAX_BYTES });
  } catch (error) {
    if (signal.aborted) throw deadlineError(session, path);
    if (error instanceof ResponseReadError) {
      if (error.code === "HTTP" && error.status === 404) throw new Error(path + " was not found.");
      if (error.code === "HTTP") throw new Error(path + " returned HTTP " + error.status + ".");
      if (error.code === "TOO_LARGE") throw new Error(path + " is larger than expected; response omitted.");
      if (error.code === "INVALID_UTF8") throw new Error(path + " did not return valid UTF-8.");
    }
    throw new Error(path + " could not be reached at " + session.base + ". The research files are static; retry in a moment.");
  }
  const value = validate(text);
  if (signal.aborted) throw deadlineError(session, path);
  session.cache.set(path, { at: session.now(), text });
  return value;
}

async function fetchJson(session, path) {
  return fetchText(session, path, (text) => {
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(path + " did not return JSON.");
    }
  });
}

const asText = (value) => ({
  content: [{ type: "text", text: JSON.stringify(value) }],
  ...(value && typeof value === "object" && !Array.isArray(value) ? { structuredContent: value } : {}),
});

function parse(schema, args, tool) {
  const parsed = schema.safeParse(args ?? {});
  if (!parsed.success) throw new Error(`${tool}: ${parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ")}`);
  return parsed.data;
}

// ---------------------------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------------------------

export const searchInput = z.object({
  query: z.string().min(1).max(200).describe("Words to find in paper titles and summaries, for example 'momentum' or 'insider'."),
  limit: z.number().int().min(1).max(50).optional().describe("Most papers to return; default 10."),
}).strict();

const words = (s) => String(s).toLowerCase().match(/[a-z0-9]+/g) ?? [];

export async function toolSearchResearch(session, args) {
  const { query, limit = 10 } = parse(searchInput, args, "search_research");
  const index = await fetchJson(session, "/research-index.json");
  const terms = [...new Set(words(query))];
  // Archival entries are earlier publications: a title and a page, no slug or summary; they are
  // found by title and returned with their page, since get_paper reads only research papers.
  const papers = [...(index.papers ?? []), ...(index.archival_papers ?? []).map((p) => ({ ...p, slug: null, archival: true }))];
  const scored = papers
    .map((p) => {
      const title = words(`${p.title} ${p.slug ?? ""}`);
      const text = words(p.description ?? "");
      const hits = terms.filter((t) => title.includes(t) || text.includes(t));
      return { p, all: hits.length === terms.length, score: terms.reduce((s, t) => s + (title.includes(t) ? 2 : 0) + (text.includes(t) ? 1 : 0), 0) };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => Number(b.all) - Number(a.all) || b.score - a.score || String(a.p.slug ?? a.p.path).localeCompare(String(b.p.slug ?? b.p.path)))
    .slice(0, limit);
  return asText({
    query,
    matched: scored.length,
    columns: ["slug", "title", "year", "url", "archival"],
    rows: scored.map(({ p }) => [p.slug, p.title, p.publication_year ?? null, `${session.base}${p.path}`, Boolean(p.archival)]),
    next: "get_paper with a slug returns the paper, which states its own claim boundary; an archival publication has no slug and is read at its url.",
    limits: RESEARCH_LIMITS,
  });
}

export async function toolListTopics(session) {
  const index = await fetchJson(session, "/research-index.json");
  return asText({
    papers: index.count ?? (index.papers ?? []).length,
    columns: ["slug", "label", "papers", "about"],
    rows: (index.topics ?? []).map((t) => [t.slug, t.label, t.count, t.blurb]),
    url: `${session.base}/research`,
    limits: RESEARCH_LIMITS,
  });
}

export const paperInput = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,159}$/, "A slug is lowercase letters, digits and hyphens, as search_research returns it").describe("The paper's slug, from search_research."),
  section: z.string().min(1).max(200).optional().describe("Return only the section whose heading contains this text; the result lists every heading."),
  max_chars: z.number().int().min(500).max(60000).optional().describe("Most characters of text to return; default 12000."),
}).strict();

function sections(markdown) {
  const lines = markdown.split("\n");
  const out = [];
  lines.forEach((line, i) => { if (/^#{2,3} /.test(line)) out.push({ heading: line.replace(/^#+ /, "").trim(), line: i, level: line.match(/^#+/)[0].length }); });
  return { lines, out };
}

export async function toolGetPaper(session, args) {
  const { slug, section, max_chars: maxChars = 12000 } = parse(paperInput, args, "get_paper");
  let markdown;
  try {
    markdown = await fetchText(session, `/research/${slug}.md`);
  } catch (err) {
    if (/was not found\.$/.test(err.message)) throw new Error(`get_paper: no paper has the slug ${slug}. search_research or list_topics returns the slugs.`);
    throw err;
  }
  const { lines, out } = sections(markdown);
  let text = markdown;
  let chosen = null;
  if (section !== undefined) {
    const i = out.findIndex((s) => s.heading.toLowerCase().includes(section.toLowerCase()));
    if (i === -1) throw new Error(`get_paper: no heading in ${slug} contains "${section}"; headings are listed by get_paper without a section.`);
    chosen = out[i].heading;
    // A section runs to the next heading of its own level or higher, so a "##" section keeps its
    // "###" subsections.
    const next = out.slice(i + 1).find((h) => h.level <= out[i].level);
    text = lines.slice(out[i].line, next ? next.line : lines.length).join("\n");
  }
  const truncated = text.length > maxChars;
  return asText({
    slug,
    url: `${session.base}/research/${slug}`,
    citation: `${session.base}/research/citations/${slug}.bib`,
    ...(chosen ? { section: chosen } : {}),
    headings: out.map((s) => s.heading),
    total_chars: text.length,
    truncated,
    text: truncated ? text.slice(0, maxChars) : text,
    limits: RESEARCH_LIMITS,
  });
}

// The read API's envelopes, reduced to what a model reads: the data and the limits stated beside it.
const envelopeData = (env) => ({ generated_at: env.generated_at, data: env.data, limits: env.limits ?? [], page: env.canonical_human_page });

export async function toolTrialLedger(session) {
  const env = await fetchJson(session, "/api/v1/trials/summary.json");
  return asText({
    ...envelopeData(env),
    meaning: "How many distinct hypotheses were tried against the declared budget, and how many were killed or survived. A strategy's statistics mean little without this count.",
  });
}

export async function toolLiveRecord(session) {
  const [record, sleeves] = await Promise.all([fetchJson(session, "/api/v1/record.json"), fetchJson(session, "/api/v1/sleeves.json")]);
  return asText({
    record,
    sleeves: envelopeData(sleeves),
    limits: [...RESEARCH_LIMITS, ...(sleeves.limits ?? [])],
  });
}

export async function toolChainHead(session) {
  const env = await fetchJson(session, "/api/v1/chain/head.json");
  return asText({ ...envelopeData(env), verify: `${session.base}/verify` });
}

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

export const TOOL_DESCRIPTIONS = Object.freeze({
  search_research: "Find Canli Capital research papers (strategy tests, killed candidates, literature reviews, feasibility protocols) by words in their titles and summaries. Use it to find a paper's slug, then read it with get_paper; to browse by subject instead, use list_topics.",
  list_topics: "The research topics, with how many papers each holds and what it covers.",
  get_paper: "A research paper's text as published, by slug, with its headings; send section for one part, and max_chars to cap the length. Find the slug with search_research or list_topics first.",
  trial_ledger: "How many distinct hypotheses Canli Capital has tried against its declared budget, and how many were killed or survived. Use it to judge any published result against the size of the search behind it.",
  live_record: "The live paper-trading record (returns, costs, risk, corrections, provenance) and each sleeve's paper equity, with their limits. Use it for how the strategies are doing now; for why they exist, read the papers.",
  chain_head: "The head of the tamper-evident chain that shows the published record was not rewritten after publication, with where to verify it. Use it to check that a figure you read was not changed later.",
});

// Output schemas: published OPEN (extra fields always pass), every field optional, one sentence
// each on what to read. A client validates a result against the schema it listed, and a closed
// schema turns any field a later version adds into a failed call.
const loose = z.looseObject({}).optional();
const table = { columns: z.array(z.string()).optional(), rows: z.array(z.unknown()).optional() };
const limits = z.array(z.string()).optional();
export const OUTPUT_SCHEMAS = Object.freeze({
  search_research: z.looseObject({ query: z.string().optional(), matched: z.number().optional(), ...table, next: z.string().optional(), limits })
    .describe("rows are the matching papers, one per row in the order of columns; next says how to read one with get_paper."),
  list_topics: z.looseObject({ papers: z.number().optional(), ...table, url: z.string().optional(), limits })
    .describe("rows are the topics, one per row in the order of columns, with how many papers each holds."),
  get_paper: z.looseObject({ slug: z.string().optional(), url: z.string().optional(), headings: z.array(z.unknown()).optional(), total_chars: z.number().optional(), truncated: z.boolean().optional(), text: z.string().optional(), limits })
    .describe("text is the paper as published (or the requested section); headings list its sections; truncated says whether max_chars cut it."),
  trial_ledger: z.looseObject({ data: loose, limits, page: z.string().optional(), meaning: z.string().optional() })
    .describe("data counts the distinct hypotheses tried against the budget, and how many were killed or survived."),
  live_record: z.looseObject({ record: loose, sleeves: loose, limits })
    .describe("record is the live paper record (returns, costs, risk, corrections, provenance, claim maturity); sleeves each sleeve's paper equity."),
  chain_head: z.looseObject({ data: loose, limits, page: z.string().optional(), verify: z.string().optional() })
    .describe("data.head is the latest entry of the tamper-evident chain; verify says how to check it."),
});

export function registerTools(server, session) {
  const tool = (name, title, inputSchema, fn) => server.registerTool(name, { title, annotations: { title, ...READ_ONLY }, description: TOOL_DESCRIPTIONS[name], inputSchema, outputSchema: OUTPUT_SCHEMAS[name] }, fn);
  tool("search_research", "Search research", searchInput, (args) => toolSearchResearch(session, args));
  tool("list_topics", "Research topics", z.object({}).strict(), () => toolListTopics(session));
  tool("get_paper", "Read a paper", paperInput, (args) => toolGetPaper(session, args));
  tool("trial_ledger", "Trial ledger", z.object({}).strict(), () => toolTrialLedger(session));
  tool("live_record", "Live paper record", z.object({}).strict(), () => toolLiveRecord(session));
  tool("chain_head", "Verification chain head", z.object({}).strict(), () => toolChainHead(session));
}

const isMain = (() => {
  try {
    return realpathSync(process.argv[1] ?? "") === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (isMain) {
  const server = new McpServer(SERVER_INFO, { instructions: SERVER_INSTRUCTIONS });
  registerTools(server, createSession());
  await server.connect(new StdioServerTransport());
}
