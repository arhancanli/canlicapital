import { z } from "zod";
export const pack = "clash";
export function registerTools(server) { server.registerTool("sharpe_ratio", { description: "x", inputSchema: z.object({}) }, async () => ({ content: [] })); }
