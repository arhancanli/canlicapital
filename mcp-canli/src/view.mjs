// The result viewer as an MCP App: one HTML page, served as the resource ui://canli/view, that
// hosts supporting MCP Apps draw run_tool results in, as tables, charts, statements, checked
// claims and guidance against results. Everything is inline (no network, no external scripts), so
// the default sandbox policy is enough. Hosts without MCP Apps ignore it.
import { readFileSync } from "node:fs";

export const VIEW_URI = "ui://canli/view";
export const VIEW_MIME = "text/html;profile=mcp-app";

const CSS = `
:root{--bg:var(--color-background-primary,#fff);--fg:var(--color-text-primary,#171717);--muted:var(--color-text-secondary,#6b6b6b);--line:var(--color-border-primary,#e3e3e3);--soft:var(--color-background-secondary,#f6f6f4);--ok:#1f7a4d;--bad:#b42318;--warn:#a15c07;--info:#1d5fa7;--s0:#2563eb;--s1:#d97706;--s2:#059669;--s3:#9333ea;font-family:var(--font-sans,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif);color-scheme:light}
:root[data-theme="dark"]{--bg:var(--color-background-primary,#171717);--fg:var(--color-text-primary,#f2f2f2);--muted:var(--color-text-secondary,#a3a3a3);--line:var(--color-border-primary,#333);--soft:var(--color-background-secondary,#222);--ok:#4ade80;--bad:#f87171;--warn:#fbbf24;--info:#60a5fa;--s0:#60a5fa;--s1:#fbbf24;--s2:#34d399;--s3:#c084fc;color-scheme:dark}
*{box-sizing:border-box}body{margin:0;padding:12px 14px;background:var(--bg);color:var(--fg);font-size:13px;line-height:1.45}
h2{font-size:14px;margin:4px 0 8px}h2 small{color:var(--muted);font-weight:400}h3{font-size:12px;margin:12px 0 6px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
article+article{border-top:1px solid var(--line);margin-top:14px;padding-top:10px}.lead{margin:0 0 6px;font-weight:600}
.scroll{overflow-x:auto;max-width:100%}table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}
th,td{padding:4px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top;white-space:nowrap}th{font-weight:600;color:var(--muted);position:sticky;top:0;background:var(--bg)}
td.num,th.num{text-align:right}td.text{white-space:normal;min-width:12em;overflow-wrap:anywhere}.clamp{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}td.obj{color:var(--muted);font-family:ui-monospace,monospace;font-size:11px}tr.heading td{font-weight:600;background:var(--soft);white-space:normal}
a{color:var(--info)}.note{color:var(--muted);font-size:11.5px;margin:6px 0}.error{color:var(--bad)}.sub{color:var(--muted);font-size:11.5px;font-weight:400}.line{display:block}.tally{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:2px 0 10px}
.badge{display:inline-block;padding:1px 7px;border-radius:9px;font-size:11.5px;font-weight:600}.badge.ok{color:var(--ok);background:color-mix(in srgb,var(--ok) 14%,transparent)}.badge.bad{color:var(--bad);background:color-mix(in srgb,var(--bad) 14%,transparent)}.badge.warn{color:var(--warn);background:color-mix(in srgb,var(--warn) 16%,transparent)}.badge.info{color:var(--info);background:color-mix(in srgb,var(--info) 14%,transparent)}.badge.muted{color:var(--muted);background:var(--soft)}
svg{width:100%;max-width:760px;height:auto;display:block}.grid{stroke:var(--line);stroke-width:1}.axis{fill:var(--muted);font-size:11px}.line{fill:none;stroke-width:1.8}.line.s0{stroke:var(--s0)}.line.s1{stroke:var(--s1)}.line.s2{stroke:var(--s2)}.line.s3{stroke:var(--s3)}.pt{fill:var(--s0);stroke:var(--bg);stroke-width:1.5}
.legend{display:flex;gap:12px;flex-wrap:wrap;color:var(--muted);font-size:11.5px;margin-top:4px}.legend i{display:inline-block;width:10px;height:3px;margin-right:5px;vertical-align:middle}.legend i.s0{background:var(--s0)}.legend i.s1{background:var(--s1)}.legend i.s2{background:var(--s2)}.legend i.s3{background:var(--s3)}
.ranges{margin:6px 0 10px}.range{margin:8px 0 12px}.top{display:flex;justify-content:space-between;flex-wrap:wrap;gap:2px 12px}.vals{color:var(--muted);font-variant-numeric:tabular-nums}.track{position:relative;height:10px;margin-top:6px;background:var(--soft);border-radius:5px}.bar{position:absolute;top:0;bottom:0;background:color-mix(in srgb,var(--s0) 55%,transparent);border-radius:5px}.dot{position:absolute;top:-3px;width:16px;height:16px;margin-left:-8px;border-radius:50%;background:var(--fg);border:3px solid var(--bg)}
dl.facts{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px 16px;margin:0}.facts div{min-width:0}.facts .wide{grid-column:1/-1}dt{color:var(--muted);font-size:11px}dd{margin:0;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}pre{white-space:pre-wrap;font-size:11.5px}
@media (max-width:480px){body{padding:10px}}`;

let page = null;
// The page: styles, the rendering functions (render.js, its exports made plain), then the app,
// without their comment lines.
const code = (file) => readFileSync(new URL(file, import.meta.url), "utf8").replace(/^[ \t]*\/\/.*\n/gm, "");
export function viewHtml() {
  if (page) return page;
  const render = code("./view/render.js").replace(/^export\s+/gm, "");
  const app = code("./view/app.js");
  page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Canli result</title><style>${CSS}</style></head><body><main id="root"><p class="note">Waiting for the result…</p></main><script>${render}\n${app}</script></body></html>`;
  return page;
}

// Whether the connected client draws MCP Apps (it says so in its initialize capabilities).
export function clientDrawsApps(server) {
  const caps = server?.server?.getClientCapabilities?.();
  const ui = caps?.extensions?.["io.modelcontextprotocol/ui"];
  return Boolean(ui && (!Array.isArray(ui.mimeTypes) || ui.mimeTypes.includes(VIEW_MIME)));
}

export function registerView(server) {
  server.registerResource("view", VIEW_URI, { title: "Result viewer", description: "Draws run_tool results as tables, charts, statements, guidance ranges and verdicts in hosts that support MCP Apps.", mimeType: VIEW_MIME },
    (uri) => ({ contents: [{ uri: uri.href, mimeType: VIEW_MIME, text: viewHtml(), _meta: { ui: { prefersBorder: true } } }] }));
}
