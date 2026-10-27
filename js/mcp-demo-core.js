// The /mcp-servers demo's host logic, without the page: canli-mcp's own view (the page an MCP Apps
// host frames) plays results recorded from the real server (mcp-canli/bench/record-site-demos.mjs).
// A control in the view asks the host for a tool call; here the answer comes from the recording,
// matched on the tool and its arguments with the dates left out (a tile asks for "two years to
// today", and today moves on), or, when nothing was recorded, an error that says so. A backtest's
// sliders run the quant pack's own backtest in the browser (computeLocally) on the recorded prices.

const DATED = new Set(['start', 'end', 'date']);

// The call a run_tool input answers with: the last one in a batch, or the call itself.
export function lastCall(input) {
  if (!input || typeof input !== 'object') return null;
  if (Array.isArray(input.calls)) return input.calls.length ? input.calls.at(-1) : null;
  return typeof input.name === 'string' ? { name: input.name, arguments: input.arguments ?? {} } : null;
}

const sorted = (v) => (Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])])) : v);

export function callKey(input) {
  const c = lastCall(input);
  if (!c) return null;
  const args = Object.fromEntries(Object.entries(c.arguments ?? {}).filter(([k]) => !DATED.has(k)));
  return `${c.name} ${JSON.stringify(sorted(args))}`;
}

// The run_tool result a recorded answer is sent as, the way the server sends one.
export const asResult = (structured) => ({ content: [{ type: 'text', text: JSON.stringify(structured) }], structuredContent: structured });

export const NOT_RECORDED = 'This page plays results recorded from canli-mcp, and this one was not recorded. Add canli-mcp to your agent and the same control runs the tool live.';

// Answers keyed by call: the demo's own call (so Refresh shows it again) and each recorded follow-up.
export function answerBook(demo, followUps = []) {
  const book = new Map();
  const own = demo.result?.structuredContent;
  const key = callKey(demo.input);
  if (key && own !== undefined) book.set(key, Array.isArray(own?.results) ? own.results.at(-1).result : own);
  for (const f of followUps) { const k = callKey(f.call); if (k) book.set(k, f.result); }
  return book;
}

export function answer(book, input) {
  const k = callKey(input);
  return k && book.has(k) ? asResult(book.get(k)) : { isError: true, content: [{ type: 'text', text: NOT_RECORDED }] };
}

// {"$result": i, "path": "a.b"} in a batch's arguments, filled from the recorded answer to call i.
const atPath = (v, path) => String(path ?? '').split('.').filter(Boolean).reduce((x, k) => (x == null ? undefined : x[k]), v);
function resolveRefs(value, calls, book) {
  if (Array.isArray(value)) return value.map((x) => resolveRefs(x, calls, book));
  if (!value || typeof value !== 'object') return value;
  if (Number.isInteger(value.$result)) {
    const k = callKey({ calls: [calls[value.$result]] });
    if (!book.has(k)) throw new Error(NOT_RECORDED);
    const got = atPath(book.get(k), value.path);
    if (got === undefined) throw new Error(NOT_RECORDED);
    return got;
  }
  return Object.fromEntries(Object.entries(value).map(([k, x]) => [k, resolveRefs(x, calls, book)]));
}

// A quant tool in the batch's last call, run here with the quant pack's own code (tools: its TOOLS
// list; compact: its rounding), on the earlier calls' recorded answers. Null when it is not one.
export function computeLocally(input, book, { tools, compact }) {
  const c = lastCall(input), tool = c && tools.find((t) => t.name === c.name);
  if (!tool) return null;
  try {
    const calls = Array.isArray(input.calls) ? input.calls : [c];
    const parsed = tool.input.safeParse(resolveRefs(c.arguments ?? {}, calls, book));
    if (!parsed.success) throw new Error(parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.') || 'arguments'}: ${i.message}`).join('; '));
    const result = compact(tool.run(parsed.data), input.digits ?? 10);
    // A batch answers as the server's does: {results: [{name, result}]}.
    return asResult(Array.isArray(input.calls) ? { results: [{ name: c.name, result }] } : result);
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: err.message }] };
  }
}
