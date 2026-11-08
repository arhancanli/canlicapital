// A plugin whose tool counts how many times it ran, slowly enough for two calls to overlap.
import { z } from "zod";

export const pack = "counter";
export const network = "none";
export const disk = "none";
let runs = 0, running = 0;
export function registerTools(server) {
  server.registerTool("counter_slow", {
    title: "Count runs slowly (test plugin)",
    description: "Waits a little (ms, 50 unless given) and says how many times it has run: a test of identical calls sharing one run.",
    inputSchema: z.object({ label: z.string().max(20), ms: z.number().int().min(0).max(1000).optional() }).strict(),
    annotations: { readOnlyHint: true },
  }, async ({ label, ms = 50 }) => {
    runs += 1;
    running += 1;
    const seen = runs, alongside = running;
    await new Promise((r) => setTimeout(r, ms));
    running -= 1;
    return { structuredContent: { label, runs: seen, alongside }, content: [{ type: "text", text: JSON.stringify({ label, runs: seen, alongside }) }] };
  });
}
