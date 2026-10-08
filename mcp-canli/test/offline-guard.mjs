// Loaded with --import in the offline test: any network call, or loading a pack that uses the
// network, throws. Offline tools must still work.
import { registerHooks } from "node:module";

globalThis.fetch = () => { throw new Error("network used in offline mode"); };
registerHooks({
  resolve(specifier, context, next) {
    if (/^canli-(fundamentals|research|backtest|paper-trading)-mcp/.test(specifier) || /^node:(net|http|https|tls|dns|http2)$/.test(specifier)) throw new Error(`offline mode loaded ${specifier}`);
    return next(specifier, context);
  },
});
