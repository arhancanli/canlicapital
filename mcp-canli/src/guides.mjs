// Published pack prompts and resources, forwarded through their own MCP handlers.
// Listing interfaces reads the build-time catalog; no pack code loads until use.
import { readFileSync } from "node:fs";

import { McpServer, ResourceTemplate, completable } from "@modelcontextprotocol/server";
import { z } from "zod";

import { OMITTED, PACKS, RENAMES } from "./packs.mjs";

const clients = new Map();
const GUIDE_PACKS = ["quant", "validation", "fundamentals", "research"];

export const loadedGuidePacks = () => [...clients.keys()];

async function connectPack(pack) {
  const [{ Client }, { InMemoryTransport }, source] = await Promise.all([
    import("@modelcontextprotocol/client"),
    import("@modelcontextprotocol/server"),
    import(`${PACKS[pack].package}/src/server.mjs`),
  ]);
  const server = new McpServer({ name: `canli-${pack}-guides`, version: "1" });
  const session = pack === "validation" ? source.createSession({ local: true }) : source.createSession?.();
  source.registerAll(server, session);
  const client = new Client({ name: "canli-mcp-guides", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(a);
    await client.connect(b);
  } catch (error) {
    await Promise.allSettled([client.close(), server.close()]);
    throw error;
  }
  return { client, server };
}

function guideClient(pack) {
  if (!GUIDE_PACKS.includes(pack)) throw new Error(`No pack guides for ${pack}.`);
  if (!clients.has(pack)) {
    const pending = connectPack(pack).catch((error) => { clients.delete(pack); throw error; });
    clients.set(pack, pending);
  }
  return clients.get(pack).then(({ client }) => client);
}

export async function closeGuideClients() {
  const pending = [...clients.values()];
  clients.clear();
  await Promise.all(pending.map(async (p) => {
    const { client, server } = await p;
    await Promise.all([client.close(), server.close()]);
  }));
}

async function pages(client, method, key) {
  const rows = [];
  let cursor;
  do {
    const result = await client[method](cursor ? { cursor } : {});
    rows.push(...result[key]);
    cursor = result.nextCursor;
  } while (cursor);
  return rows;
}

export async function discoverPackGuides() {
  const catalog = {};
  for (const pack of GUIDE_PACKS) {
    const client = await guideClient(pack);
    catalog[pack] = {
      prompts: await pages(client, "listPrompts", "prompts"),
      resources: await pages(client, "listResources", "resources"),
      templates: await pages(client, "listResourceTemplates", "resourceTemplates"),
    };
  }
  // Keep the wire JSON shape: SDK result schemas can add undefined metadata.
  return JSON.parse(JSON.stringify(catalog));
}

const scheme = (uri) => uri.slice(0, uri.indexOf("://"));
const publicUri = (pack, uri) => uri.replace(/^[^:]+:\/\//, `canli-${pack}://`);

function remapText(pack, text, originalScheme) {
  let result = text.replaceAll(`${originalScheme}://`, `canli-${pack}://`);
  for (const [oldName, newName] of Object.entries(RENAMES[pack] ?? {})) {
    result = result.replace(new RegExp(`\\b${oldName}\\b`, "g"), newName);
  }
  return result;
}

function sourceText(pack, text) {
  let result = text;
  for (const [oldName, newName] of Object.entries(RENAMES[pack] ?? {})) result = result.replace(new RegExp(`\\b${newName}\\b`, "g"), oldName);
  return result;
}

export function registerPackGuides(server, packs) {
  const catalog = JSON.parse(readFileSync(new URL("./guides.json", import.meta.url), "utf8"));
  for (const [pack, guides] of Object.entries(catalog)) {
    if (!packs.includes(pack)) continue;
    for (const prompt of guides.prompts) {
      const shape = Object.fromEntries((prompt.arguments ?? []).map((argument) => {
        let field = z.string().describe(argument.description ?? argument.name);
        if (!argument.required) field = field.optional();
        field = completable(field, async (value, context) => {
          const result = await (await guideClient(pack)).complete({
            ref: { type: "ref/prompt", name: prompt.name },
            argument: { name: argument.name, value },
            ...(context ? { context } : {}),
          });
          return result.completion.values;
        });
        return [argument.name, field];
      }));
      const { arguments: ignored, name, ...metadata } = prompt;
      server.registerPrompt(`${pack}.${name}`, { ...metadata, argsSchema: z.object(shape).strict() }, async (args) => {
        const result = await (await guideClient(pack)).getPrompt({ name, arguments: args });
        const originalScheme = pack === "quant" ? "canli-quant" : "canli";
        return { ...result, messages: result.messages.map((message) => message.content.type === "text" ? {
          ...message, content: { ...message.content, text: `Use canli-mcp's run_tool for each tool below: {"name": "tool_name", "arguments": {...}}.\n${remapText(pack, message.content.text, originalScheme)}` },
        } : message) };
      });
    }
    for (const resource of [...guides.resources, ...guides.templates]) {
      const original = resource.uri ?? resource.uriTemplate;
      const uri = publicUri(pack, original);
      const sourceTemplate = resource.uriTemplate ? new ResourceTemplate(original, { list: undefined }).uriTemplate : null;
      const { name, uri: ignoredUri, uriTemplate: ignoredTemplate, ...metadata } = resource;
      const read = async (requested, variables) => {
        const sourceVariables = sourceTemplate ? Object.fromEntries(Object.entries(variables).map(([key, value]) => [key, Array.isArray(value) ? value.map((v) => sourceText(pack, decodeURIComponent(v))) : sourceText(pack, decodeURIComponent(value))])) : {};
        const sourceUri = sourceTemplate ? sourceTemplate.expand(sourceVariables) : requested.href.replace(`canli-${pack}://`, `${scheme(original)}://`);
        const targetTool = sourceVariables.tool ?? null;
        if (resource.uriTemplate && Object.hasOwn(OMITTED[pack] ?? {}, targetTool)) throw new Error(`Tool ${targetTool} is omitted from canli-mcp: ${OMITTED[pack][targetTool]}.`);
        const result = await (await guideClient(pack)).readResource({ uri: sourceUri });
        return { ...result, contents: result.contents.map((content) => ({
          ...content, uri: remapText(pack, content.uri, scheme(original)),
          ...(typeof content.text === "string" && name !== "example" ? { text: remapText(pack, content.text, scheme(original)) } : {}),
        })) };
      };
      if (resource.uri) server.registerResource(`${pack}.${name}`, uri, metadata, read);
      else {
        const template = new ResourceTemplate(uri, { list: undefined });
        const complete = Object.fromEntries(template.uriTemplate.variableNames.map((variable) => [variable, async (value, context) => {
          const rename = RENAMES[pack] ?? {};
          const values = [value, ...Object.entries(rename).filter(([, alias]) => alias.startsWith(value)).map(([name]) => name)];
          const args = context?.arguments ? Object.fromEntries(Object.entries(context.arguments).map(([key, v]) => [key, sourceText(pack, v)])) : undefined;
          const completions = await Promise.all([...new Set(values)].map(async (prefix) => {
            const result = await (await guideClient(pack)).complete({
              ref: { type: "ref/resource", uri: original },
              argument: { name: variable, value: prefix },
              ...(args ? { context: { arguments: args } } : {}),
            });
            return result.completion.values.map((v) => Object.hasOwn(rename, v) ? rename[v] : v);
          }));
          return [...new Set(completions.flat())].filter((v) => v.startsWith(value) && !(variable === "tool" && Object.hasOwn(OMITTED[pack] ?? {}, v)));
        }]));
        server.registerResource(`${pack}.${name}`, new ResourceTemplate(uri, { list: undefined, complete }), metadata, read);
      }
    }
  }
}
