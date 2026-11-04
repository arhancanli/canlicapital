// mcp-canli/src/tripwire.mjs
//
// The network tripwire. A pack that says it sends nothing (quant, validation, a plugin whose network is "none")
// runs each tool in a scope where fetch is refused, so the claim is held while the tool runs and not only
// stated. It sees fetch, the way these packs could reach the network; a tool that opened a socket through node:net
// itself would not be seen, and the privacy test reads the packs' sources for that instead. An answer whose every
// call ran so says network "none" in its receipt.
import { AsyncLocalStorage } from "node:async_hooks";

const scope = new AsyncLocalStorage();
let installed = false;

export function installTripwire() {
  if (installed || typeof globalThis.fetch !== "function") return;
  installed = true;
  const real = globalThis.fetch;
  globalThis.fetch = function guardedFetch(...args) {
    const s = scope.getStore();
    if (!s) return real.apply(this, args);
    return Promise.reject(new Error(`${s.tool} is in ${s.pack}, a pack that sends nothing, and tried to reach the network; refused.`));
  };
}

// fn run with fetch refused.
export const withoutNetwork = (tool, pack, fn) => scope.run({ tool, pack }, fn);
