// A plugin as a third party would write one: a pack name, what it sends and keeps, and its tools.
import { z } from "zod";

export const pack = "demo";
export const title = "Demo plugin";
export const network = "none";
export const disk = "none";
export function registerTools(server) {
  server.registerTool("demo_moving_sum", {
    title: "Moving sum (demo plugin)",
    description: "Rolling sum of a series over a window: a demonstration plugin tool for weather derivative degree days.",
    inputSchema: z.object({ values: z.array(z.number()).min(1).max(10000), window: z.number().int().min(1).max(1000) }).strict(),
    annotations: { readOnlyHint: true },
  }, async ({ values, window }) => {
    const sums = values.map((_, i) => (i + 1 < window ? null : values.slice(i + 1 - window, i + 1).reduce((a, b) => a + b, 0)));
    return { structuredContent: { window, sums }, content: [{ type: "text", text: JSON.stringify({ window, sums }) }] };
  });
}
