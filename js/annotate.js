// /annotate: step through the FilingFacts gold packet, record three judgements per item, then download
// the filled packet or copy it for the GitHub review task. Answers are kept in this browser only
// (localStorage) so a volunteer can stop and come back; nothing is sent anywhere by this page.
import { JUDGEMENTS, commentBody, filledPacket, itemStatus, progress } from "./annotate-core.js";

const PACKET_URL = "/datasets/filing-facts/v0/gold-packet-v0.json";
const STORE = "canli.annotate.filing-facts-v0";
const LABELS = {
  question_clear: { title: "Is the question clear?", options: { yes: "Yes", no: "No" } },
  answer_matches_filing: { title: "Does the stated answer match the filing?", options: { yes: "Yes", no: "No", cannot_find: "Cannot find it" } },
  citation_correct: { title: "Is the citation the right filing?", options: { yes: "Yes", no: "No" } },
};

const root = document.getElementById("annotate-app");
const load = () => { try { return JSON.parse(localStorage.getItem(STORE) ?? "{}"); } catch { return {}; } };
const save = (state) => { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch { /* private window: keep in memory */ } };
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

async function start() {
  if (!root) return;
  let packet;
  try {
    const response = await fetch(PACKET_URL);
    if (!response.ok) throw new Error(String(response.status));
    packet = await response.json();
  } catch {
    root.replaceChildren(el("p", { text: `The gold packet could not be loaded. It is also available at ${PACKET_URL}.` }));
    return;
  }
  const state = { index: 0, annotator: "", answers: {}, ...load() };
  const render = () => {
    save(state);
    const label = packet.labels[state.index];
    const answer = (state.answers[label.id] ??= {});
    const counts = progress(packet, state.answers);
    const status = itemStatus(packet, state.answers, label.id);
    const fieldset = (key) => el("fieldset", { class: "annotate__judgement" }, [
      el("legend", { text: LABELS[key].title }),
      ...packet.judgements[key].map((value) => el("label", {}, [
        el("input", { type: "radio", name: key, value, ...(answer[key] === value ? { checked: "" } : {}), onchange: () => { answer[key] = value; render(); } }),
        ` ${LABELS[key].options[value] ?? value}`,
      ])),
    ]);
    const notes = el("textarea", { id: "annotate-notes", rows: "3", placeholder: "What you found, where you looked, or what is ambiguous" });
    notes.value = answer.notes ?? "";
    notes.addEventListener("input", () => { answer.notes = notes.value; save(state); });
    notes.addEventListener("change", render);
    const name = el("input", { id: "annotate-name", type: "text", autocomplete: "off", placeholder: "your GitHub username", value: state.annotator });
    name.addEventListener("input", () => { state.annotator = name.value; save(state); });
    const download = () => {
      const blob = new Blob([`${JSON.stringify(filledPacket(packet, state.answers, state.annotator), null, 1)}\n`], { type: "application/json" });
      const link = el("a", { href: URL.createObjectURL(blob), download: `filing-facts-v0-labels-${(state.annotator || "anonymous").replace(/[^A-Za-z0-9_-]/g, "")}.json` });
      link.click();
      URL.revokeObjectURL(link.href);
    };
    const copy = async (event) => {
      try { await navigator.clipboard.writeText(commentBody(packet, state.answers, state.annotator)); event.target.textContent = "Copied"; }
      catch { event.target.textContent = "Copy failed: use Download"; }
    };
    root.replaceChildren(
      el("p", { class: "annotate__progress", text: `Item ${state.index + 1} of ${counts.total} · ${counts.complete} complete${counts.needsNote ? ` · ${counts.needsNote} need a note` : ""}` }),
      el("article", { class: "annotate__item" }, [
        el("p", { class: "annotate__meta", text: `${label.company} · ${label.template.replace("_", " ")}` }),
        el("p", { class: "annotate__question", text: label.question }),
        el("p", {}, [el("strong", { text: "Stated answer: " }), label.answer]),
        el("p", {}, ["Cited filings: ", ...label.filings.flatMap((url, i) => [i ? " · " : "", el("a", { href: url, target: "_blank", rel: "noreferrer", text: `SEC folder ${i + 1}` })])]),
        ...JUDGEMENTS.map(fieldset),
        el("label", { for: "annotate-notes", text: "Notes" }),
        notes,
        status === "needs_note" ? el("p", { class: "annotate__warn", text: "Please add a note: say what the filing reports or where you looked." }) : null,
      ]),
      el("nav", { class: "annotate__nav", "aria-label": "Items" }, [
        el("button", { type: "button", ...(state.index === 0 ? { disabled: "" } : {}), onclick: () => { state.index -= 1; render(); }, text: "Previous" }),
        el("button", { type: "button", ...(state.index === counts.total - 1 ? { disabled: "" } : {}), onclick: () => { state.index += 1; render(); }, text: "Next" }),
      ]),
      el("section", { class: "annotate__send" }, [
        el("label", { for: "annotate-name", text: "Name for credit (optional)" }),
        name,
        el("p", {}, [
          el("button", { type: "button", onclick: download, text: "Download my labels" }),
          " ",
          el("button", { type: "button", onclick: copy, text: "Copy for GitHub" }),
        ]),
      ]),
    );
  };
  render();
}

start();
