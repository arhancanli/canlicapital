// Loaded with --import in the offline test: any network call, or loading a pack that uses the
// network, throws. Offline tools must still work.
import * as loaderApi from "node:module";

globalThis.fetch = () => { throw new Error("network used in offline mode"); };
function resolve(specifier, context, next) {
    if (/^canli-(fundamentals|research|backtest|paper-trading|markets)-mcp/.test(specifier) || /^node:(net|http|https|tls|dns|http2)$/.test(specifier)) throw new Error("offline mode loaded " + specifier);
    return next(specifier, context);
}
// Keep the synchronous hook on newer Node and use the Node 20 loader API otherwise.
if (typeof loaderApi.registerHooks === "function") loaderApi.registerHooks({ resolve });
else loaderApi.register("data:text/javascript," + encodeURIComponent("export " + resolve.toString()), import.meta.url);
