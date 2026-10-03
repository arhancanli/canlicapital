// =============================================================================
// build-identity-files.mjs
// -----------------------------------------------------------------------------
// The files a machine reads to learn who runs a site, before it reads a page:
//
//   /ai.txt                    a plain key-value identity index
//   /ai.json                   what an AI system may and may not do with the content
//                              (ai-visibility.org.uk ai.json schema)
//   /identity.json             the organisation's facts
//                              (ai-visibility.org.uk identity.json schema)
//   /.well-known/security.txt  where to report a vulnerability (RFC 9116)
//
// All four are generated from the same sources as the homepage: the definition
// and opening answer in config/home-answers.json, and config/brand.js. So the
// homepage, llms.txt and these files describe Canli Capital in the same words,
// and none of them can call it a fund while another says it is not one.
//
// Dates come from config/home-answers.json's "reviewed" field, never from the
// clock, so a rebuild with unchanged inputs writes byte-identical files. The
// security.txt expiry is that date plus 364 days (RFC 9116 asks for under a
// year); scripts/build-identity-files.test.mjs fails once it is within 30 days,
// which is the reminder to review the contact and move the date.
// =============================================================================
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BRAND, FACTS } from "../config/brand.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://canlicapital.com";
const REPO = "https://github.com/arhancanli/canlicapital";

export const SECURITY_CONTACT = `${REPO}/security/advisories/new`;
export const QUESTIONS_CONTACT = `${REPO}/issues/new/choose`;
export const SAME_AS = Object.freeze([
  REPO,
  "https://github.com/arhancanli/canli-validation-mcp",
  "https://github.com/arhancanli/canli-research-mcp",
  "https://github.com/arhancanli/canli-fundamentals-mcp",
  "https://www.npmjs.com/package/canli-validation-mcp",
  "https://www.npmjs.com/package/canli-research-mcp",
  "https://www.npmjs.com/package/canli-fundamentals-mcp",
  "https://glama.ai/mcp/servers/arhancanli/canli-validation-mcp",
  "https://www.producthunt.com/products/canli-validation",
]);

// What the project is and is not, in one place. Every file below quotes these.
export function identityFacts(answers) {
  return {
    name: BRAND,
    url: ORIGIN,
    definition: answers.definition,
    summary: `${answers.definition} ${answers.answer}`,
    boundary: "It is an independent research project, not a fund, broker or investment adviser, and it manages no money. Every published strategy record is paper trading.",
    founded: FACTS.founded,
    founder: { name: "Arhan Canli", jobTitle: "Founder and quantitative researcher", url: `${ORIGIN}/founder` },
    reviewed: answers.reviewed,
  };
}

export function securityExpiry(reviewed) {
  const date = new Date(`${reviewed}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 364);
  return date;
}

export function renderAiTxt(facts) {
  const rows = [
    ["Last-Modified", facts.reviewed],
    ["Company-Name", facts.name],
    ["Canonical-Domain", facts.url],
    ["Company-Type", "Open research lab for quantitative finance (independent project; not a fund, broker or investment adviser)"],
    ["Description", facts.summary],
    ["Boundary", facts.boundary],
    ["Disambiguation", `${facts.name} is the open quantitative-finance research project at canlicapital.com, founded by ${facts.founder.name}. It offers no investment product and manages no money.`],
    ["Founder", facts.founder.name],
    ["Founder-Page", facts.founder.url],
    ["Founder-ORCID", "https://orcid.org/0009-0004-4138-7907"],
    ["Founded", `${facts.founded} (engineering began; the public paper record started later)`],
    ["Based-In", "Dubai, United Arab Emirates"],
    ["MCP-Validation", `${ORIGIN}/mcp`],
    ["MCP-Fundamentals", `${ORIGIN}/mcp/fundamentals`],
    ["MCP-Research", `${ORIGIN}/mcp/research`],
    ["MCP-Servers-Page", `${ORIGIN}/mcp-servers`],
    ["API-Status", `${ORIGIN}/api/v1/status`],
    ["Developers", `${ORIGIN}/developers`],
    ["Source-Code", REPO],
    ["Code-License", "MIT"],
    ["Data-License", "CC BY 4.0"],
    ["LLMs-Txt", `${ORIGIN}/llms.txt`],
    ["AI-Json", `${ORIGIN}/ai.json`],
    ["Identity-Json", `${ORIGIN}/identity.json`],
    ["Security-Contact", SECURITY_CONTACT],
    ["Questions-And-Corrections", QUESTIONS_CONTACT],
  ];
  return [`# ${facts.name} identity index`, ...rows.map(([key, value]) => `${key}: ${value}`), ""].join("\n");
}

export function aiJson(facts) {
  return {
    $schema: "https://www.ai-visibility.org.uk/specifications/ai-json/ai-json.schema.json",
    name: facts.name,
    url: facts.url,
    language: "en",
    summaryForAI: `${facts.summary} ${facts.boundary}`,
    permissions: [
      { action: "summarise", description: "Summarise any public page on canlicapital.com." },
      {
        action: "quote-with-attribution",
        description: "Quote text and figures with a link to the page they came from.",
        conditions: ["Quote a number together with the limit the page states beside it."],
      },
      { action: "answer-questions", description: "Answer questions about Canli Capital, its validators, MCP servers, datasets and research." },
      { action: "use-tools", description: "Call the public API and MCP servers within their published fair-use limits." },
      { action: "train-models", description: "Use the published data (CC BY 4.0) and code (MIT) with the attribution those licenses require." },
    ],
    restrictions: [
      { action: "present-paper-results-as-realized-returns", reason: "Every published strategy record is paper trading; no money is managed.", severity: "must-not" },
      { action: "describe-as-a-fund-or-adviser", reason: "Canli Capital is a research project, not a fund, broker or investment adviser.", severity: "must-not" },
      { action: "present-as-investment-advice", reason: "Nothing on the site recommends buying or selling anything.", severity: "must-not" },
      { action: "present-a-validation-result-as-an-endorsement", reason: "A validator result states what a statistic does and does not establish; it does not endorse a strategy.", severity: "must-not" },
    ],
    attribution: {
      required: true,
      format: "Canli Capital (canlicapital.com), with a link to the page cited",
      examples: [`Source: Canli Capital, ${ORIGIN}/how-to-validate-a-backtest`],
    },
    contact: { url: QUESTIONS_CONTACT },
    licensing: {
      contentLicense: "Data: CC BY 4.0. Code: MIT.",
      aiTrainingAllowed: true,
      aiTrainingNotes: "Allowed under CC BY 4.0 (data) and MIT (code), with the attribution those licenses require.",
    },
    metadata: { version: "1.0.0", lastUpdated: facts.reviewed, generator: "scripts/build-identity-files.mjs" },
  };
}

export function identityJson(facts) {
  return {
    $schema: "https://www.ai-visibility.org.uk/specifications/identity-json/identity-json.schema.json",
    name: facts.name,
    url: facts.url,
    type: "Organization",
    description: `${facts.summary} ${facts.boundary}`,
    alternateName: ["canlicapital.com"],
    // The schema takes a year or a full date; the brand config records the month engineering began.
    foundingDate: String(facts.founded).slice(0, 4),
    location: { name: "Founder's base", addressLocality: "Dubai", addressCountry: "AE" },
    founder: facts.founder,
    sameAs: [...SAME_AS],
    areaServed: ["Worldwide"],
    contactPoints: [
      { type: "security", url: SECURITY_CONTACT },
      { type: "questions and corrections", url: QUESTIONS_CONTACT },
    ],
    metadata: { version: "1.0.0", lastUpdated: facts.reviewed },
    language: "en",
  };
}

export function renderSecurityTxt(facts) {
  return [
    `Contact: ${SECURITY_CONTACT}`,
    `Expires: ${securityExpiry(facts.reviewed).toISOString()}`,
    "Preferred-Languages: en",
    `Canonical: ${ORIGIN}/.well-known/security.txt`,
    `Policy: ${REPO}/blob/main/SECURITY.md`,
    "",
  ].join("\n");
}

export function identityFiles(answers) {
  const facts = identityFacts(answers);
  return {
    "public/ai.txt": renderAiTxt(facts),
    "public/ai.json": `${JSON.stringify(aiJson(facts), null, 2)}\n`,
    "public/identity.json": `${JSON.stringify(identityJson(facts), null, 2)}\n`,
    "public/.well-known/security.txt": renderSecurityTxt(facts),
  };
}

function main() {
  const answers = JSON.parse(readFileSync(resolve(ROOT, "config", "home-answers.json"), "utf8"));
  const files = identityFiles(answers);
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(resolve(ROOT, path)), { recursive: true });
    writeFileSync(resolve(ROOT, path), body);
  }
  console.log(`build-identity-files: wrote ${Object.keys(files).join(", ")}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
