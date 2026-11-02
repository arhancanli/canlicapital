#!/usr/bin/env node
// What `canli-mcp` runs. Node keeps the compiled code in its temp folder, which takes about a quarter off
// start-up from the second run on (Node 22.1 or later; older ones skip it).
import nodeModule from "node:module";

nodeModule.enableCompileCache?.();
await import("./server.mjs");
