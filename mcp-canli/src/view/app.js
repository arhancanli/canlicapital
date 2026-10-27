// The viewer in the host's sandboxed frame (MCP Apps, 2026-01-26): the ui/initialize handshake,
// the theme the host sends, the tool's input and result, and the frame's height reported back.
// Rendering is render.js and studio.js, placed before this script in the same page. Interactive
// views reach the server only through the host: tools/call (which the host may ask the person to
// allow), ui/message (a message in the conversation) and ui/update-model-context (what the model
// knows of the view next turn).
(function () {
  const root = document.getElementById("root");
  let nextId = 1, input = {}, hostCaps = {};
  const pending = new Map();
  // The host is the window that framed this page. Its origin is learnt from its answer to the
  // handshake; after that, messages from any other origin are ignored and replies go only there.
  // (A host whose own frame is sandboxed has the opaque origin "null", which cannot be targeted.)
  let hostOrigin = null;
  const send = (msg) => window.parent.postMessage(msg, hostOrigin && hostOrigin !== "null" ? hostOrigin : "*");
  const request = (method, params, wait = 10000) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    send({ jsonrpc: "2.0", id, method, params });
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(`${method} timed out`)); } }, wait);
  });
  // A tool call can wait on the network and on the person allowing it.
  const host = {
    get canCall() { return Boolean(hostCaps.serverTools); },
    canMessage: true,
    call: (name, args) => request("tools/call", { name, arguments: args }, 120000),
    message: (text) => request("ui/message", { role: "user", content: { type: "text", text } }, 30000),
    context: (text) => request("ui/update-model-context", { content: [{ type: "text", text }] }).catch(() => {}),
  };
  // Full screen, when the host offers it: a button that asks for it and back.
  let mode = "inline", fsButton = null;
  const displayModes = (ctx) => {
    if (ctx && typeof ctx.displayMode === "string") mode = ctx.displayMode;
    if (ctx && Array.isArray(ctx.availableDisplayModes) && ctx.availableDisplayModes.includes("fullscreen") && !fsButton) {
      fsButton = document.createElement("button");
      fsButton.type = "button"; fsButton.className = "fs";
      fsButton.addEventListener("click", () => { request("ui/request-display-mode", { mode: mode === "fullscreen" ? "inline" : "fullscreen" }).then((r) => { if (r && typeof r.mode === "string") mode = r.mode; label(); }).catch(() => {}); });
      document.body.prepend(fsButton);
    }
    label();
  };
  const label = () => { if (fsButton) { fsButton.textContent = mode === "fullscreen" ? "Exit full screen" : "⤢ Full screen"; fsButton.setAttribute("aria-pressed", String(mode === "fullscreen")); } };
  const theme = (ctx) => {
    if (!ctx) return;
    displayModes(ctx);
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
        studioReset(input);
        root.innerHTML = renderRunResult(data, input);
        mountStudio(root, host);
      }
    } catch (err) {
      root.innerHTML = `<p class="error">This result could not be drawn: ${esc(err && err.message)}</p>`;
    }
    report();
  };
  window.addEventListener("message", (event) => {
    if (event.source !== window.parent) return;
    if (hostOrigin !== null && event.origin !== hostOrigin) return;
    const m = event.data;
    if (!m || m.jsonrpc !== "2.0") return;
    if (m.id !== undefined && pending.has(m.id) && (m.result !== undefined || m.error !== undefined)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (hostOrigin === null) hostOrigin = event.origin;
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
    .then((r) => { hostCaps = (r && r.hostCapabilities) || {}; theme(r && r.hostContext); send({ jsonrpc: "2.0", method: "ui/notifications/initialized", params: {} }); })
    .catch(() => send({ jsonrpc: "2.0", method: "ui/notifications/initialized", params: {} }));
})();
