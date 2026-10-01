// Review drafts stay in the browser. New drafts and exported reviews bind the exact source
// packet; earlier or damaged drafts remain visible and downloadable without being reinterpreted.
import { DRAFT_STORE_PREFIX, JUDGEMENTS, LEGACY_STORE, commentBody, filledPacket, itemStatus, packetFingerprint, progress, restoreDraft, storedDraft } from "./annotate-core.js";

const PACKET_URL = "/datasets/filing-facts/v0/gold-packet-v0.json";
const LABELS = {
  question_clear: { title: "Is the question clear?", options: { yes: "Yes", no: "No" } },
  answer_matches_filing: { title: "Does the stated answer match the filing?", options: { yes: "Yes", no: "No", cannot_find: "Cannot find it" } },
  citation_correct: { title: "Is the citation the right filing?", options: { yes: "Yes", no: "No" } },
};

const root = document.getElementById("annotate-app");
const el = (tag, attrs = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "text") node.textContent = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) if (child) node.append(child);
  return node;
};
const downloadText = (text, filename) => {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = el("a", { href: url, download: filename });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

async function start() {
  if (!root) return;
  let packet, packetSha256;
  try {
    const response = await fetch(PACKET_URL);
    if (!response.ok) throw new Error(String(response.status));
    packet = await response.json();
    packetSha256 = await packetFingerprint(packet);
  } catch {
    root.replaceChildren(el("p", {}, ["The review packet could not be loaded and checked. You can ", el("a", { href: PACKET_URL, text: "download the original packet" }), " and fill it in by hand."]));
    return;
  }

  const storeKey = DRAFT_STORE_PREFIX + packetSha256;
  let raw;
  let storageNotice = "";
  let recoveryNotice = "";
  let canSave = true;
  const recoveries = new Map();
  try {
    raw = localStorage.getItem(storeKey) ?? undefined;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key !== storeKey && (key === LEGACY_STORE || key?.startsWith(DRAFT_STORE_PREFIX))) {
        const prior = localStorage.getItem(key);
        if (prior !== null) recoveries.set(key, prior);
      }
    }
  } catch {
    storageNotice = "This browser cannot save your draft. Download your work before leaving this page.";
    canSave = false;
  }
  let parsed;
  try { parsed = raw === undefined ? undefined : JSON.parse(raw); } catch { parsed = null; }
  const restored = restoreDraft(packet, packetSha256, parsed);
  const state = restored.state;
  if (!["new", "restored"].includes(restored.status)) {
    recoveryNotice = restored.status === "sanitized"
      ? "Some saved draft fields were invalid. Valid answers are restored; the original draft is kept below so you can recover the rest."
      : "The saved draft could not be matched safely to these questions. It is kept below for download; its answers have not been applied.";
    // Preserve the exact original bytes before a subsequent user action can replace this key.
    const priorRecovery = [...recoveries].find(([, original]) => original === raw);
    const recoveryKey = priorRecovery?.[0] ?? `${storeKey}.recovery.${Date.now()}`;
    recoveries.set(recoveryKey, raw);
    try { if (!priorRecovery) localStorage.setItem(recoveryKey, raw); } catch {
      canSave = false;
      storageNotice = "Download the original draft below before leaving. This browser could not preserve it or save new work.";
    }
  } else if (recoveries.size) {
    recoveryNotice = "Earlier drafts are still saved below. Their answers have not been applied to these questions; download them to recover your earlier work.";
  }

  const updateStatus = () => {
    const counts = progress(packet, state.answers);
    const current = root.querySelector(".annotate__progress");
    if (current) current.textContent = `Item ${state.index + 1} of ${counts.total} · ${counts.complete} complete${counts.needsNote ? ` · ${counts.needsNote} need a note` : ""}`;
    const note = root.querySelector(".annotate__warn");
    if (note) note.hidden = itemStatus(packet, state.answers, packet.labels[state.index].id) !== "needs_note";
    const storage = root.querySelector(".annotate__storage");
    if (storage) { storage.textContent = storageNotice; storage.hidden = !storageNotice; }
  };
  const save = () => {
    if (canSave) {
      try { localStorage.setItem(storeKey, JSON.stringify(storedDraft(packet, packetSha256, state))); }
      catch {
        storageNotice = "This browser could not save your latest changes. Download your work before leaving this page.";
        canSave = false;
      }
    }
    updateStatus();
  };

  const render = (focusId = document.activeElement?.id) => {
    const label = packet.labels[state.index];
    if (!Object.hasOwn(state.answers, label.id)) Object.defineProperty(state.answers, label.id, { value: {}, enumerable: true, writable: true, configurable: true });
    const answer = state.answers[label.id];
    const fieldset = (key) => el("fieldset", { class: "annotate__judgement" }, [
      el("legend", { text: LABELS[key].title }),
      ...packet.judgements[key].map((value) => el("label", {}, [
        el("input", { id: `annotate-${key}-${value}`, type: "radio", name: key, value, ...(answer[key] === value ? { checked: "" } : {}), onchange: () => { answer[key] = value; save(); render(); } }),
        ` ${LABELS[key].options[value] ?? value}`,
      ])),
    ]);
    const notes = el("textarea", { id: "annotate-notes", rows: "3", placeholder: "What you found, where you looked, or what is ambiguous", "aria-describedby": "annotate-note-help" });
    notes.value = answer.notes ?? "";
    notes.addEventListener("input", () => { answer.notes = notes.value; save(); });
    const name = el("input", { id: "annotate-name", type: "text", autocomplete: "off", placeholder: "your GitHub username", value: state.annotator });
    name.addEventListener("input", () => { state.annotator = name.value; save(); });
    const download = () => downloadText(`${JSON.stringify(filledPacket(packet, state.answers, state.annotator, packetSha256), null, 1)}\n`, `filing-facts-v0-draft-${(state.annotator || "anonymous").replace(/[^A-Za-z0-9_-]/g, "") || "anonymous"}.json`);
    const copy = async (event) => {
      if (!state.annotator.trim()) {
        event.target.textContent = "Add your name before copying";
        document.getElementById("annotate-name").focus();
        return;
      }
      try { await navigator.clipboard.writeText(commentBody(packet, state.answers, state.annotator, packetSha256)); event.target.textContent = "Copied completed reviews"; }
      catch { event.target.textContent = "Copy failed: use Download"; }
    };
    root.replaceChildren(...[
      el("p", { class: "annotate__progress", role: "status" }),
      el("p", { class: "annotate__storage", role: "status" }),
      recoveries.size ? el("section", { class: "annotate__recovery", "aria-label": "Earlier drafts" }, [
        el("p", { text: recoveryNotice }),
        ...Array.from(recoveries.values(), (original, i) => el("button", { type: "button", text: `Download earlier draft ${i + 1}`, onclick: () => downloadText(original, `filing-facts-earlier-draft-${i + 1}.json`) })),
      ]) : null,
      el("article", { class: "annotate__item" }, [
        el("p", { class: "annotate__meta", text: `${label.company} · ${label.template.replaceAll("_", " ")}` }),
        el("p", { id: "annotate-question", class: "annotate__question", tabindex: "-1", text: label.question }),
        el("p", {}, [el("strong", { text: "Stated answer: " }), label.answer]),
        el("p", {}, ["Cited filings: ", ...label.filings.flatMap((url, i) => [i ? " · " : "", el("a", { href: url, target: "_blank", rel: "noreferrer", text: `SEC folder ${i + 1}` })])]),
        ...JUDGEMENTS.map(fieldset),
        el("label", { for: "annotate-notes", text: "Notes" }),
        el("p", { id: "annotate-note-help", text: "A No or Cannot find it answer needs a note describing the source or where you looked." }),
        notes,
        el("p", { class: "annotate__warn", role: "status", text: "Please add a note: say what the filing reports or where you looked." }),
      ]),
      el("nav", { class: "annotate__nav", "aria-label": "Items" }, [
        el("button", { type: "button", ...(state.index === 0 ? { disabled: "" } : {}), onclick: () => { state.index -= 1; save(); render("annotate-question"); }, text: "Previous" }),
        el("button", { type: "button", ...(state.index === packet.labels.length - 1 ? { disabled: "" } : {}), onclick: () => { state.index += 1; save(); render("annotate-question"); }, text: "Next" }),
      ]),
      el("section", { class: "annotate__send" }, [
        el("label", { for: "annotate-name", text: "Name for credit (optional for a draft)" }),
        name,
        el("p", { text: "Download keeps all your work, including incomplete answers. Copy includes only completed reviews, with a source note for every No or Cannot find it. Submitted reviews need a name or stable handle." }),
        el("p", {}, [
          el("button", { type: "button", onclick: download, text: "Download my draft" }),
          " ",
          el("button", { type: "button", onclick: copy, text: "Copy completed reviews" }),
        ]),
      ]),
    ].filter(Boolean));
    updateStatus();
    if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
  };
  render();
}

start();
