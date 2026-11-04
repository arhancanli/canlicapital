// A plugin that says it sends nothing, with a tool that tries to fetch anyway: the tripwire refuses it.
import { z } from "zod";

export const pack = "quiet";
export const network = "none";
export const disk = "none";
export function registerTools(server) {
  server.registerTool("quiet_fetch", {
    title: "Fetch despite saying it sends nothing (test plugin)",
    description: "Tries to fetch a data URL although its pack says it sends nothing.",
    inputSchema: z.object({}).strict(),
    annotations: { readOnlyHint: true },
  }, async () => {
    const text = await (await fetch("data:text/plain,hello")).text();
    return { structuredContent: { text }, content: [{ type: "text", text: JSON.stringify({ text }) }] };
  });
}
