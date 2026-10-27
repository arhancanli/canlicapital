// The /mcp-servers demo: canli-mcp's own view in a sandboxed frame, as an MCP Apps host frames it,
// playing results recorded from the real server. This page is the host: it answers the view's
// handshake, sends the recorded call and result, answers its follow-up calls from the recording
// (mcp-demo-core.js) or, for a backtest, by running the quant pack's own code here, and shows what
// the view would have said to Claude. Nothing is sent anywhere.
import { answer, answerBook, computeLocally } from './mcp-demo-core.js';

// The quant pack's backtests, loaded the first time a slider moves (they rerun here, in the browser).
let quant = null;
const loadQuant = () => (quant ??= Promise.all([import('canli-quant-mcp/src/tools/strategies.mjs'), import('canli-quant-mcp/src/math.mjs')]).then(([s, m]) => ({ tools: s.TOOLS, compact: m.compact })));

const BASE = '/demos/canli-mcp/';
const MAX_INLINE = 820;
const root = document.querySelector('[data-mcp-demo]');
if (root) {
  const frameBox = root.querySelector('.mcp-demo__frame');
  const said = root.querySelector('.mcp-demo__said');
  const tabs = [...root.querySelectorAll('[data-demo]')];
  const facts = root.querySelector('.mcp-demo__facts');
  const integer = new Intl.NumberFormat('en-US');
  let viewHtml = null, current = null, frame = null, demo = null, book = new Map(), followUps = null, follow = null;
  const json = async (path) => { const r = await fetch(BASE + path); if (!r.ok) throw new Error(`${path}: ${r.status}`); return r.json(); };
  const post = (msg) => frame?.contentWindow?.postMessage(msg, '*');
  const tell = (text) => { said.textContent = text; said.hidden = !text; };

  // Follow-ups load the first time a control asks for one.
  const followUpsFor = (id) => (follow ??= json(`${id}-calls.json`).then((list) => { followUps = list; book = answerBook(demo, list); }).catch(() => {}));

  window.addEventListener('message', async (e) => {
    if (!frame || e.source !== frame.contentWindow) return;
    const m = e.data;
    if (!m || m.jsonrpc !== '2.0') return;
    const reply = (result) => post({ jsonrpc: '2.0', id: m.id, result });
    if (m.method === 'ui/initialize') {
      reply({ protocolVersion: '2026-01-26', hostInfo: { name: 'canlicapital.com demo', version: '1' }, hostCapabilities: { serverTools: {} }, hostContext: { theme: 'light', displayMode: root.classList.contains('is-full') ? 'fullscreen' : 'inline', availableDisplayModes: ['inline', 'fullscreen'] } });
    } else if (m.method === 'ui/notifications/initialized') {
      post({ jsonrpc: '2.0', method: 'ui/notifications/tool-input', params: { arguments: demo.input } });
      post({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: demo.result });
    } else if (m.method === 'ui/notifications/size-changed') {
      // A tall view scrolls inside the frame rather than stretching the page; full screen shows it all.
      if (!root.classList.contains('is-full')) frame.style.height = `${Math.min(MAX_INLINE, Math.max(320, Math.ceil(m.params?.height ?? 0) + 4))}px`;
    } else if (m.method === 'tools/call') {
      if (demo.answers && !followUps) await followUpsFor(current);
      if (m.params?.name !== 'run_tool') { reply(answer(new Map(), {})); return; }
      const recorded = answer(book, m.params.arguments);
      if (!recorded.isError) { reply(recorded); return; }
      let local = null;
      try { local = computeLocally(m.params.arguments, book, await loadQuant()); } catch { local = null; }
      reply(local ?? recorded);
    } else if (m.method === 'ui/message') {
      tell(`In a chat, this asks Claude: “${m.params?.content?.text ?? ''}”`);
      reply({});
    } else if (m.method === 'ui/update-model-context') {
      tell(`In a chat, Claude now knows: ${m.params?.content?.[0]?.text ?? ''}`);
      reply({});
    } else if (m.method === 'ui/request-display-mode') {
      const full = m.params?.mode === 'fullscreen';
      root.classList.toggle('is-full', full);
      document.documentElement.classList.toggle('mcp-demo-open', full);
      reply({ mode: full ? 'fullscreen' : 'inline' });
    } else if (m.id !== undefined) {
      post({ jsonrpc: '2.0', id: m.id, error: { code: -32601, message: `${m.method} is not part of this demo` } });
    }
  });

  const show = async (id) => {
    if (id === current) return;
    current = id; follow = null; followUps = null; tell('');
    tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.demo === id)));
    frameBox.setAttribute('aria-busy', 'true');
    try {
      viewHtml ??= await (await fetch(`${BASE}view.txt`)).text();
      const d = await json(`${id}.json`);
      if (current !== id) return;
      demo = d; book = answerBook(d);
      const tab = tabs.find((t) => t.dataset.demo === id);
      facts.textContent = `Claude read ${integer.format(d.result.content[0].text.length)} characters; the view drew ${integer.format(JSON.stringify(d.result.structuredContent).length)}. ${tab?.dataset.prompt ? `Prompt: ${tab.dataset.prompt}. ` : ''}Recorded from canli-mcp ${d.version} on ${d.recorded.slice(0, 10)}.`;
      frame = document.createElement('iframe');
      frame.title = `canli-mcp view: ${tab?.textContent ?? id}`;
      frame.setAttribute('sandbox', 'allow-scripts');
      frame.srcdoc = viewHtml;
      frameBox.replaceChildren(frame);
    } catch (err) {
      frameBox.innerHTML = '<p class="mcp-demo__error">The recording did not load. Reload the page to try again.</p>';
    } finally {
      frameBox.removeAttribute('aria-busy');
    }
  };

  tabs.forEach((t, i) => {
    t.addEventListener('click', () => show(t.dataset.demo));
    t.addEventListener('keydown', (e) => {
      const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      const next = tabs[(i + step + tabs.length) % tabs.length];
      next.focus(); show(next.dataset.demo);
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !root.classList.contains('is-full')) return;
    root.classList.remove('is-full'); document.documentElement.classList.remove('mcp-demo-open');
    post({ jsonrpc: '2.0', method: 'ui/notifications/host-context-changed', params: { displayMode: 'inline' } });
  });
  // The frame loads when the section comes near, not with the page.
  const start = () => show(tabs[0].dataset.demo);
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => { if (entries.some((x) => x.isIntersecting)) { io.disconnect(); start(); } }, { rootMargin: '400px' });
    io.observe(root);
  } else start();
}
