// Pure logic for /annotate: the volunteer's judgements live in a plain object keyed by item id, and
// these functions turn them into the gold-packet format that scripts/datasets/filing-facts/agreement.mjs
// reads. Nothing here touches the DOM, the network or storage, so it runs under node --test.
import { packetContent } from "./filing-facts-packet.js";

export const JUDGEMENTS = ["question_clear", "answer_matches_filing", "citation_correct"];
export const DRAFT_SCHEMA = "canli.filing-facts-annotation-draft.v1";
export const DRAFT_STORE_PREFIX = "canli.annotate.filing-facts.v1.";
export const LEGACY_STORE = "canli.annotate.filing-facts-v0";
const CHOICES = { question_clear: ["yes", "no"], answer_matches_filing: ["yes", "no", "cannot_find"], citation_correct: ["yes", "no"] };
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const binding = (value) => {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new RangeError("a canonical packet SHA-256 is required");
  return value;
};

export function validatePacket(packet) {
  if (packet?.schema !== "canli.filing-facts-gold-packet.v0" || !Array.isArray(packet.labels) || !packet.labels.length) throw new RangeError("expected a non-empty FilingFacts gold packet");
  for (const key of JUDGEMENTS) {
    if (JSON.stringify(packet.judgements?.[key]) !== JSON.stringify(CHOICES[key])) throw new RangeError(`invalid packet choices for ${key}`);
  }
  const seen = new Set();
  for (const label of packet.labels) {
    if (!object(label) || ["id", "template", "company", "question", "answer"].some((key) => typeof label[key] !== "string" || !label[key].trim()) || seen.has(label.id)) throw new RangeError("invalid or duplicate packet item");
    seen.add(label.id);
    if (!Array.isArray(label.filings) || !label.filings.length || label.filings.some((value) => {
      try {
        const url = new URL(value);
        return typeof value !== "string" || url.protocol !== "https:" || url.hostname !== "www.sec.gov" || !url.pathname.startsWith("/Archives/edgar/data/") || url.username || url.password || url.port;
      } catch { return true; }
    })) throw new RangeError("packet items must cite SEC filing URLs");
  }
  return packet;
}

export async function packetFingerprint(packet, crypto = globalThis.crypto) {
  validatePacket(packet);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(packetContent(packet)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Legacy or changed-source drafts remain available for recovery; they cannot silently supply
// judgements about the current questions. Copy only known fields from a matching bound draft.
export function restoreDraft(packet, packetSha256, stored) {
  binding(packetSha256);
  const fresh = { index: 0, annotator: "", answers: {} };
  if (stored === undefined) return { state: fresh, status: "new" };
  if (!object(stored)) return { state: fresh, status: "invalid" };
  if (stored.schema !== DRAFT_SCHEMA) return { state: fresh, status: "legacy" };
  if (stored.packet_sha256 !== packetSha256) return { state: fresh, status: "source_mismatch" };
  const index = Number.isInteger(stored.index) && stored.index >= 0 && stored.index < packet.labels.length ? stored.index : 0;
  const answers = {};
  const source = object(stored.answers) ? stored.answers : {};
  for (const label of packet.labels) {
    if (!Object.hasOwn(source, label.id) || !object(source[label.id])) continue;
    const answer = source[label.id];
    const safe = Object.fromEntries(JUDGEMENTS.filter((key) => CHOICES[key].includes(answer[key])).map((key) => [key, answer[key]]));
    if (typeof answer.notes === "string") safe.notes = answer.notes;
    Object.defineProperty(answers, label.id, { value: safe, enumerable: true, configurable: true, writable: true });
  }
  const state = { index, annotator: typeof stored.annotator === "string" ? stored.annotator : "", answers };
  const sanitized = index !== stored.index || state.annotator !== stored.annotator || JSON.stringify(answers) !== JSON.stringify(stored.answers);
  return { state, status: sanitized ? "sanitized" : "restored" };
}

export function storedDraft(packet, packetSha256, state) {
  const draft = { ...state, schema: DRAFT_SCHEMA, packet_sha256: binding(packetSha256) };
  return { schema: DRAFT_SCHEMA, packet_sha256: packetSha256, ...restoreDraft(packet, packetSha256, draft).state };
}

// An item is complete when all three judgements are chosen; notes are optional except where the
// guidelines ask for one (a "no" or "cannot_find" should say what was found).
export function itemStatus(packet, answers, id) {
  const answer = answers[id] ?? {};
  const chosen = JUDGEMENTS.filter((key) => packet.judgements[key].includes(answer[key]));
  if (chosen.length < JUDGEMENTS.length) return "incomplete";
  const needsNote = JUDGEMENTS.some((key) => answer[key] === "no" || answer[key] === "cannot_find");
  return needsNote && !String(answer.notes ?? "").trim() ? "needs_note" : "complete";
}

export function progress(packet, answers) {
  const statuses = packet.labels.map((label) => itemStatus(packet, answers, label.id));
  return {
    total: statuses.length,
    complete: statuses.filter((status) => status === "complete").length,
    needsNote: statuses.filter((status) => status === "needs_note").length,
  };
}

// The packet with this volunteer's labels filled in: same schema, same item order, only the
// judgement and notes fields changed. Unanswered fields stay empty strings, as in the blank packet.
export function filledPacket(packet, answers, annotator, packetSha256) {
  return {
    ...packet,
    packet_sha256: binding(packetSha256),
    annotator: String(annotator ?? "").trim(),
    labels: packet.labels.map((label) => {
      const answer = answers[label.id] ?? {};
      const out = { ...label };
      for (const key of JUDGEMENTS) out[key] = packet.judgements[key].includes(answer[key]) ? answer[key] : "";
      out.notes = String(answer.notes ?? "").trim();
      return out;
    }),
  };
}

// A compact form for a GitHub comment: only answered items, only the fields that carry judgement.
export function commentBody(packet, answers, annotator, packetSha256) {
  const filled = filledPacket(packet, answers, annotator, packetSha256);
  if (!filled.annotator) throw new RangeError("completed reviews need a name or stable handle");
  const answered = filled.labels
    .filter((label) => itemStatus(packet, answers, label.id) === "complete")
    .map(({ id, question_clear, answer_matches_filing, citation_correct, notes }) => ({ id, question_clear, answer_matches_filing, citation_correct, notes }));
  const header = `FilingFacts ${packet.schema.split(".").at(-1)} labels by ${filled.annotator || "(name not given)"}: ${answered.length} of ${packet.labels.length} items.`;
  return `${header}\n\n\`\`\`json\n${JSON.stringify({ schema: packet.schema, packet_sha256: filled.packet_sha256, annotator: filled.annotator, labels: answered }, null, 1)}\n\`\`\`\n`;
}
