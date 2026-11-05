// A company named in words that matched more than one filer ("Delta", "Apollo"): the person picks, where their
// client can be asked (MCP elicitation), instead of the server taking the first match. Clients on the 2026-07-28
// protocol get an input_required result and retry with the answer; earlier clients are asked while the call
// waits. A client that cannot be asked, a person who declines, or CANLI_ASK=0 leaves the best match standing
// with the others listed, as before. One question a request.
import { acceptedContent, inputRequired, SdkErrorCode } from "@modelcontextprotocol/server";

export const ASK_KEY = "company";
const ASK_MS = 120000;
const CAPS_KEY = "io.modelcontextprotocol/clientCapabilities";
// The arguments a company is named in, in the order tools use them.
const NAMED_BY = ["company", "issuer", "manager", "fund", "entity", "name", "query", "symbol", "ticker"];
// Where tools put the company they matched.
const MATCHED_IN = ["company", "issuer", "manager", "fund", "entity", "filer"];

// The matches a result names when its company came from words: the one taken first, then the others.
export function matches(result) {
  if (!result || typeof result !== "object") return null;
  for (const k of [null, ...MATCHED_IN]) {
    const o = k === null ? result : result[k];
    if (!o || typeof o !== "object" || o.matched_by !== "name" || !Array.isArray(o.other_matches) || !o.other_matches.length) continue;
    const pick = (m) => (m && m.cik != null ? { cik: String(m.cik), name: String(m.name ?? m.cik), ticker: m.ticker ?? null } : null);
    const options = [pick(o), ...o.other_matches.map(pick)].filter(Boolean).slice(0, 5);
    if (options.length > 1 && new Set(options.map((x) => x.cik)).size === options.length) return options;
  }
  return null;
}

// What to ask about one call, or null: its company argument, the words given and the companies they matched.
export function question(call, result) {
  const options = matches(result);
  if (!options) return null;
  const args = call?.arguments ?? {};
  const arg = NAMED_BY.find((k) => typeof args[k] === "string" && args[k].trim());
  if (!arg) return null;
  const label = (o) => `${o.name}${o.ticker ? ` (${o.ticker})` : ""}, CIK ${o.cik}`;
  return {
    arg, options,
    message: `"${args[arg]}" names more than one company at the SEC. Which one do you mean?`,
    requestedSchema: { type: "object", properties: { [ASK_KEY]: { type: "string", title: "Company", oneOf: options.map((o) => ({ const: o.cik, title: label(o) })) } }, required: [ASK_KEY] },
  };
}

// The client's capabilities: per request on the 2026-07-28 protocol, from its initialize before that.
function canAsk(server, req) {
  const caps = req?.envelope?.[CAPS_KEY] ?? req?.envelope?.clientCapabilities ?? req?._meta?.[CAPS_KEY] ?? server?.server?.getClientCapabilities?.();
  return Boolean(caps?.elicitation);
}

// After a batch has run: the first call whose company matched several is put to the person. Returns an
// input_required result for the handler to send (2026-07-28), or null once the batch's results are settled.
// rerun(i, args) runs call i again with new arguments and returns its result.
export async function askWhich({ server, extra, calls, done, rerun, env = process.env }) {
  if (env.CANLI_ASK === "0") return null;
  const req = extra?.mcpReq ?? extra ?? {};
  for (let i = 0; i < done.length; i += 1) {
    const d = done[i];
    if (!d || d.result === undefined || d.error) continue;
    const q = question(calls[i], d.result);
    if (!q) continue;
    // A retry that carries the person's answer (2026-07-28).
    let answer = acceptedContent(req.inputResponses, ASK_KEY)?.[ASK_KEY];
    let how = answer === undefined ? null : "answered";
    if (answer === undefined) {
      if (!canAsk(server, req)) return null;
      const ask = typeof req.elicitInput === "function" ? req.elicitInput : (p, o) => server.server.elicitInput(p, o);
      try {
        const got = await ask({ mode: "form", message: q.message, requestedSchema: q.requestedSchema }, { timeout: ASK_MS });
        if (got?.action !== "accept") { d.result = { ...d.result, asked: { question: q.message, answer: got?.action ?? "none", kept: q.options[0].name } }; return null; }
        answer = got.content?.[ASK_KEY];
        how = "answered";
      } catch (err) {
        // The 2026-07-28 protocol asks by answering the call with input_required; the client retries with the answer.
        if (err?.code === SdkErrorCode.MethodNotSupportedByProtocolVersion) return inputRequired({ inputRequests: { [ASK_KEY]: inputRequired.elicit({ message: q.message, requestedSchema: q.requestedSchema }) } });
        return null;
      }
    }
    // Only one of the companies offered is taken; anything else leaves the call as it ran.
    const chosen = q.options.find((o) => o.cik === String(answer));
    if (!chosen) return null;
    if (chosen !== q.options[0]) {
      const args = { ...(calls[i].arguments ?? {}), [q.arg]: chosen.cik };
      try { d.result = await rerun(i, args); calls[i].arguments = args; } catch (err) { done[i] = { name: d.name, error: err.message }; return null; }
    }
    if (d.result && typeof d.result === "object") d.result = { ...d.result, asked: { question: q.message, answer: chosen.name, how } };
    return null;
  }
  return null;
}
