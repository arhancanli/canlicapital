// The viewer in the host's sandboxed frame (MCP Apps, 2026-01-26): the ui/initialize handshake,
// the theme the host sends, the tool's input and result, and the frame's height reported back.
// Rendering is render.js, placed before this script in the same page.
(function () {
  const root = document.getElementById("root");
  let nextId = 1, input = {};
  const pending = new Map();
  const send = (msg) => window.parent.postMessage(msg, "*");
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    send({ jsonrpc: "2.0", id, method, params });
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(`${method} timed out`)); } }, 10000);
  });
  const theme = (ctx) => {
    if (!ctx) return;
    if (ctx.theme) document.documentElement.dataset.theme = ctx.theme;
    const vars = ctx.styles && ctx.styles.variables;
    if (vars) for (const [k, v] of Object.entries(vars)) if (/^--[a-z0-9-]+$/i.test(k) && typeof v === "string") document.documentElement.style.setProperty(k, v);
  };
  const report = () => send({ jsonrpc: "2.0", method: "ui/notifications/size-changed", params: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight } });
  const show = (result) => {
    try {
      if (result && result.isError) {
        root.innerHTML = `<p class="error">${esc((result.content && result.content[0] && result.content[0].text) || "The tool returned an error.")}</p>`;
      } else {
        let data = result && result.structuredContent;
        if (data === undefined && result && result.content && result.content[0] && result.content[0].type === "text") { try { data = JSON.parse(result.content[0].text); } catch { data = result.content[0].text; } }
        root.innerHTML = renderRunResult(data, input);
      }
    } catch (err) {
      root.innerHTML = `<p class="error">This result could not be drawn: ${esc(err && err.message)}</p>`;
    }
    report();
  };
  window.addEventListener("message", (event) => {
    const m = event.data;
    if (!m || m.jsonrpc !== "2.0") return;
    if (m.id !== undefined && pending.has(m.id) && (m.result !== undefined || m.error !== undefined)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) p.reject(new Error(m.error.message || "error")); else p.resolve(m.result);
      return;
    }
    if (m.method === "ui/notifications/tool-input") { input = (m.params && m.params.arguments) || {}; root.innerHTML = `<p class="note">Running ${esc(input.name || (input.calls ? `${input.calls.length} calls` : "the tool"))}…</p>`; report(); }
    else if (m.method === "ui/notifications/tool-result") show(m.params);
    else if (m.method === "ui/notifications/tool-cancelled") { root.innerHTML = "<p class=\"note\">The call was cancelled.</p>"; report(); }
    else if (m.method === "ui/notifications/host-context-changed") theme(m.params);
    else if (m.method === "ping" && m.id !== undefined) send({ jsonrpc: "2.0", id: m.id, result: {} });
    else if (m.method === "ui/resource-teardown" && m.id !== undefined) send({ jsonrpc: "2.0", id: m.id, result: {} });
  });
  if (typeof ResizeObserver === "function") new ResizeObserver(report).observe(document.documentElement);
  request("ui/initialize", { protocolVersion: "2026-01-26", appInfo: { name: "canli-view", version: "1" }, appCapabilities: { availableDisplayModes: ["inline", "fullscreen"] } })
    .then((r) => { theme(r && r.hostContext); send({ jsonrpc: "2.0", method: "ui/notifications/initialized", params: {} }); })
    .catch(() => send({ jsonrpc: "2.0", method: "ui/notifications/initialized", params: {} }));
})();
