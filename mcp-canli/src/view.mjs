// The result viewer as an MCP App: one HTML page, served as the resource ui://canli/view, that
// hosts supporting MCP Apps draw run_tool results in, as tables, charts, statements, checked
// claims and guidance against results, and as interactive views (studio.js): candlesticks with
// indicators, option chains, backtest dashboards with sliders, sweep heatmaps, treemaps and the
// paper order ticket, and (atlas.js) the market map, the yield curve through time, statements as
// charts, correlations, the volatility surface and several prices compared. Everything is inline (no network, no external scripts), so
// the default sandbox policy is enough. Hosts without MCP Apps ignore it.
import { readFileSync } from "node:fs";

export const VIEW_URI = "ui://canli/view";
export const VIEW_MIME = "text/html;profile=mcp-app";

const CSS = `
:root{--up:#0f7b5f;--dn:#c2410c;--bg:var(--color-background-primary,#fff);--fg:var(--color-text-primary,#171717);--muted:var(--color-text-secondary,#6b6b6b);--line:var(--color-border-primary,#e3e3e3);--soft:var(--color-background-secondary,#f6f6f4);--ok:#1f7a4d;--bad:#b42318;--warn:#a15c07;--info:#1d5fa7;--s0:#2563eb;--s1:#d97706;--s2:#059669;--s3:#9333ea;--k0:#2a78d6;--k1:#eb6834;--k2:#1baf7a;--k3:#eda100;--k4:#e87ba4;--k5:#008300;--k6:#6250d6;--k7:#e34948;font-family:var(--font-sans,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif);color-scheme:light}
:root[data-theme="dark"]{--up:#34d399;--dn:#fb923c;--bg:var(--color-background-primary,#171717);--fg:var(--color-text-primary,#f2f2f2);--muted:var(--color-text-secondary,#a3a3a3);--line:var(--color-border-primary,#333);--soft:var(--color-background-secondary,#222);--ok:#4ade80;--bad:#f87171;--warn:#fbbf24;--info:#60a5fa;--s0:#60a5fa;--s1:#fbbf24;--s2:#34d399;--s3:#c084fc;--k0:#3987e5;--k1:#d95926;--k2:#199e70;--k3:#c98500;--k4:#d55181;--k5:#008300;--k6:#9085e9;--k7:#e66767;color-scheme:dark}
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
.w{position:relative;margin:6px 0 14px}.ctl{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;margin:0 0 8px}.grp{display:inline-flex;flex-wrap:wrap;gap:2px}
button,select{font:inherit;font-size:12px;color:var(--fg);background:var(--soft);border:1px solid var(--line);border-radius:6px;padding:3px 8px;cursor:pointer}button[aria-pressed="true"]{background:color-mix(in srgb,var(--s0) 18%,var(--bg));border-color:color-mix(in srgb,var(--s0) 55%,var(--line))}
button.primary{background:var(--s0);border-color:var(--s0);color:#fff;font-weight:600;padding:6px 14px}button:disabled,select:disabled{opacity:.5;cursor:default}button:focus-visible,select:focus-visible,input:focus-visible,.plot:focus-visible{outline:2px solid var(--s0);outline-offset:1px}
.plot{position:relative;touch-action:pan-y;user-select:none;cursor:crosshair;overflow:hidden}.plot svg{max-width:none;width:100%}.xh{position:absolute;width:1px;background:var(--muted);opacity:.55;pointer-events:none}
.tip{position:absolute;z-index:3;pointer-events:none;background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:6px 8px;font-size:11.5px;line-height:1.5;box-shadow:0 2px 10px rgba(0,0,0,.14);white-space:nowrap;font-variant-numeric:tabular-nums}
.cd-up{fill:var(--bg);stroke:var(--up);stroke-width:1}.cd-dn{fill:var(--dn);stroke:var(--dn);stroke-width:1}.wk-up{stroke:var(--up)}.wk-dn{stroke:var(--dn)}.v-up{fill:var(--up);opacity:.4}.v-dn{fill:var(--dn);opacity:.4}
.line.thin{stroke-width:1.3}.band{fill:var(--s3);opacity:.09}.pane{fill:none;stroke:var(--line)}.guide{stroke:var(--muted);stroke-dasharray:3 3;opacity:.6}.dd{fill:color-mix(in srgb,var(--bad) 20%,transparent);stroke:var(--bad);stroke-width:1.2}
.mk-buy{fill:var(--up)}.mk-sell{fill:var(--dn)}.tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(128px,1fr));gap:8px;margin:4px 0 10px}.tile{background:var(--soft);border-radius:8px;padding:8px 10px}.tile .k{color:var(--muted);font-size:11px}.tile .v{font-size:18px;font-weight:600;font-variant-numeric:tabular-nums}.tile .b{color:var(--muted);font-size:11px}
.sliders{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:6px 16px;margin:4px 0 8px}.sliders label{display:block;font-size:12px;color:var(--muted)}.sliders output{color:var(--fg);font-weight:600;margin-left:4px}input[type=range]{width:100%;accent-color:var(--s0)}
table.chain td,table.chain th{padding:3px 6px}.chain .k{text-align:center;font-weight:700;background:var(--soft)}.chain td.itm{background-color:color-mix(in srgb,var(--s0) 8%,transparent)}.chain tr[data-k]{cursor:pointer}.chain tr.sel td{box-shadow:inset 0 0 0 1px var(--s0)}.chain tr.spot td{padding:1px 6px;border-bottom:2px solid var(--s1);text-align:center}.chain th.side{text-align:center;color:var(--fg)}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 8px}.chip{background:var(--soft);border-radius:12px;padding:2px 9px;font-size:11.5px}.chip b{font-weight:600}.ticket{border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin:8px 0}.acts{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:10px}
.side-buy{color:var(--up);font-weight:600}.side-sell{color:var(--dn);font-weight:600}.tm text{font-size:11.5px;font-weight:600;pointer-events:none}.tm text.small{font-size:10.5px;font-weight:400}.on-dark{fill:#fff}.on-light{fill:var(--fg)}.tm rect{stroke:var(--bg);stroke-width:2}
table.hm th.c{text-align:center}table.hm td.cell{text-align:center;min-width:46px;cursor:pointer}table.hm td.best{box-shadow:inset 0 0 0 2px var(--fg)}th.sort{cursor:pointer}th.sort:hover{color:var(--fg)}.warn-text{color:var(--warn)}
button.fs{float:right;margin:0 0 4px 8px;font-size:11.5px}table.sortable th{cursor:pointer}table.sortable th:hover{color:var(--fg)}th[aria-sort="ascending"]::after{content:" ↑"}th[aria-sort="descending"]::after{content:" ↓"}input.filter{font:inherit;font-size:12px;color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:3px 8px;margin:0 0 6px;width:min(260px,100%)}
.mtiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(122px,1fr));gap:4px}.mt{display:flex;flex-direction:column;align-items:flex-start;gap:1px;text-align:left;border:1px solid var(--line);border-radius:8px;padding:6px 8px;min-width:0}.mt .n{font-size:11.5px;font-weight:600;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mt .v{font-size:15px;font-weight:700;font-variant-numeric:tabular-nums}.mt:hover{border-color:var(--fg)}
.wrap{position:relative}.scrub{display:flex;align-items:center;gap:10px;margin:6px 0}.scrub input{flex:1}.scrub b{font-variant-numeric:tabular-nums;min-width:6.5em}
table.stmt tr.pick{cursor:pointer}table.stmt tr.pick:hover td{background:var(--soft)}table.stmt tr.sel td:first-child{box-shadow:inset 3px 0 0 var(--s0);font-weight:600}table.stmt tr.base td{font-weight:600}svg.mini{display:inline-block;width:auto;vertical-align:middle}.bars svg{max-width:none;width:100%}.b0{fill:var(--s0)}.b1{fill:var(--s1)}.b2{fill:var(--s2)}.b3{fill:var(--s3)}.bn{fill:var(--dn)}
table.corr td.cell{min-width:40px;cursor:default}table.corr td.dot{min-width:14px;height:14px;padding:0}.sw{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:-1px}
.line.k0{stroke:var(--k0)}.legend i.k0,.sw.k0{background:var(--k0)}.line.k1{stroke:var(--k1)}.legend i.k1,.sw.k1{background:var(--k1)}.line.k2{stroke:var(--k2)}.legend i.k2,.sw.k2{background:var(--k2)}.line.k3{stroke:var(--k3)}.legend i.k3,.sw.k3{background:var(--k3)}.line.k4{stroke:var(--k4)}.legend i.k4,.sw.k4{background:var(--k4)}.line.k5{stroke:var(--k5)}.legend i.k5,.sw.k5{background:var(--k5)}.line.k6{stroke:var(--k6)}.legend i.k6,.sw.k6{background:var(--k6)}.line.k7{stroke:var(--k7)}.legend i.k7,.sw.k7{background:var(--k7)}
@media (max-width:480px){body{padding:10px}}`;

let page = null;
// The page: styles, the rendering functions (render.js, its exports made plain), then the app,
// without their comment lines.
const code = (file) => readFileSync(new URL(file, import.meta.url), "utf8").replace(/^[ \t]*\/\/.*\n/gm, "").replace(/^import .*\n/gm, "").replace(/^export\s+/gm, "");
export function viewHtml() {
  if (page) return page;
  const render = code("./view/render.js"), studio = code("./view/studio.js"), atlas = code("./view/atlas.js"), app = code("./view/app.js");
  page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Canli result</title><style>${CSS}</style></head><body><main id="root"><p class="note">Waiting for the result…</p></main><script>${render}\n${studio}\n${atlas}\n${app}</script></body></html>`;
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
