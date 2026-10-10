import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { ARMS } from "./arms.mjs";
for (const [arm, servers] of Object.entries(ARMS)) {
  for (const [key, cmd, args, env] of servers) {
    const t0 = Date.now();
    try {
      const c = new Client({ name: "list", version: "0" });
      await c.connect(new StdioClientTransport({ command: cmd, args, env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env }, stderr: "ignore" }));
      const tools = (await c.listTools()).tools;
      console.log(arm, key, tools.length, "tools", Date.now() - t0, "ms:", tools.map((t) => t.name).join(", ").slice(0, 700));
      await c.close();
    } catch (e) { console.log(arm, key, "ERROR", e.message.slice(0, 300)); }
  }
}
