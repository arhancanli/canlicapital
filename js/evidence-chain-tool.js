import { sha256Hex, signedFields, validateEvidenceChain } from "./evidence-chain-core.js";

const config = JSON.parse(document.querySelector("#evidence-chain-config").textContent);
const byId = (id) => document.getElementById(id);
const range = byId("chain-range");
const canvas = byId("chain-canvas");
const context = canvas.getContext("2d");

let log = null;
let anchors = null;
let anchorBySequence = new Map();
let selectedSequence = config.facts.head_seq;
let verificationPassed = false;

const shorten = (value, sides = 10) =>
  value && value.length > sides * 2 + 1 ? `${value.slice(0, sides)}…${value.slice(-sides)}` : value;

function querySequence() {
  const requested = Number.parseInt(new URLSearchParams(window.location.search).get("seq"), 10);
  return Number.isInteger(requested) && requested >= 0 && requested <= config.facts.head_seq
    ? requested
    : config.facts.head_seq;
}

function updateUrl(sequence) {
  const url = new URL(window.location.href);
  if (sequence === config.facts.head_seq) url.searchParams.delete("seq");
  else url.searchParams.set("seq", String(sequence));
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function setProof(id, state, label) {
  const item = byId(id);
  item.dataset.state = state;
  item.querySelector("b").textContent = label;
}

function anchorLabel(anchor) {
  if (!anchor) return "NO CHECKPOINT";
  return anchor.status === "bitcoin" ? `BITCOIN BLOCK ${anchor.bitcoin_block_height}` : "CALENDAR PENDING";
}

function renderEntry(sequence, { updateHistory = true } = {}) {
  if (!log) return;
  selectedSequence = Math.max(0, Math.min(log.entries.length - 1, Number(sequence)));
  const entry = log.entries[selectedSequence];
  const anchor = anchorBySequence.get(selectedSequence);
  const disclosed = Object.hasOwn(entry, "payload");
  range.value = String(selectedSequence);
  byId("entry-seq").textContent = String(entry.seq);
  byId("entry-date").textContent = entry.date;
  byId("entry-disclosure").textContent = disclosed ? "PUBLIC PAYLOAD" : "OPAQUE COMMITMENT";
  byId("entry-disclosure").dataset.state = disclosed ? "public" : "opaque";
  byId("entry-anchor").textContent = anchorLabel(anchor);
  byId("entry-anchor").dataset.state = anchor?.status || "none";
  byId("entry-prev").textContent = entry.prev_chain_hash;
  byId("entry-payload").textContent = entry.payload_sha256;
  byId("entry-coordinate").textContent = `${entry.date} | ${entry.seq}`;
  byId("entry-hash").textContent = entry.chain_hash;
  byId("entry-signature").textContent = entry.signature;
  byId("mutation-original-date").textContent = entry.date;
  byId("mutation-original-hash").textContent = entry.chain_hash;
  byId("mutation-test-date").textContent = "Awaiting experiment";
  byId("mutation-test-hash").textContent = "Awaiting experiment";
  byId("mutation-result").textContent = "No mutation has been run.";
  byId("mutation-lab").dataset.state = "idle";

  const baseState = verificationPassed ? "pass" : "waiting";
  setProof("proof-sequence", baseState, verificationPassed ? "PASS" : "WAIT");
  setProof("proof-hash", baseState, verificationPassed ? "PASS" : "WAIT");
  setProof("proof-signature", baseState, verificationPassed ? "PASS" : "WAIT");
  const anchorState = anchor?.status === "bitcoin" ? "pass" : anchor?.status === "pending" ? "pending" : "info";
  setProof("proof-anchor", anchorState, anchor?.status === "bitcoin" ? "PASS" : anchor?.status === "pending" ? "PENDING" : "N/A");
  byId("proof-anchor-note").textContent = anchor
    ? anchor.status === "bitcoin"
      ? `Confirmed at Bitcoin block ${anchor.bitcoin_block_height}`
      : "Calendar attested, not yet Bitcoin confirmed"
    : "Not every entry has an OpenTimestamps checkpoint";
  byId("entry-proof-score").textContent = verificationPassed ? `${anchor?.status === "bitcoin" ? 4 : 3} / 4` : "0 / 4";
  byId("chain-prev").disabled = selectedSequence === 0;
  byId("chain-next").disabled = selectedSequence === log.entries.length - 1;
  if (updateHistory) updateUrl(selectedSequence);
  drawChain();
}

function drawChain() {
  if (!log || !context) return;
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width * ratio));
  const height = Math.max(1, Math.round(rect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  const cssWidth = width / ratio;
  const cssHeight = height / ratio;
  const left = 8;
  const right = cssWidth - 8;
  const y = cssHeight * 0.56;
  const xFor = (sequence) => left + (sequence / (log.entries.length - 1)) * (right - left);
  const boundaryX = xFor(config.facts.first_disclosed_seq);

  context.clearRect(0, 0, cssWidth, cssHeight);
  context.lineWidth = 2;
  context.strokeStyle = "rgba(111, 133, 143, .34)";
  context.beginPath();
  context.moveTo(left, y);
  context.lineTo(right, y);
  context.stroke();
  context.strokeStyle = "#46d7ce";
  context.beginPath();
  context.moveTo(boundaryX, y);
  context.lineTo(right, y);
  context.stroke();

  for (const anchor of anchors.anchors) {
    const x = xFor(anchor.seq);
    context.fillStyle = anchor.status === "bitcoin" ? "#b78a55" : "#e7bc4f";
    context.fillRect(x - 1, y - 14, 2, 28);
  }

  const selectedX = xFor(selectedSequence);
  context.shadowColor = "rgba(70, 215, 206, .7)";
  context.shadowBlur = 18;
  context.fillStyle = "#f2f7f6";
  context.beginPath();
  context.arc(selectedX, y, 5, 0, Math.PI * 2);
  context.fill();
  context.shadowBlur = 0;
}

async function runVerification() {
  if (!log || !anchors) return;
  const button = byId("chain-verify");
  const status = byId("chain-verification-status");
  button.disabled = true;
  status.dataset.state = "loading";
  status.textContent = "RUN";
  byId("chain-verification-label").textContent = `Checking ${log.entries.length} signatures`;
  try {
    const result = await validateEvidenceChain(log, anchors);
    verificationPassed = true;
    status.dataset.state = "pass";
    status.textContent = "PASS";
    byId("chain-verification-label").textContent =
      `${result.links_verified} links + ${result.signatures_verified} signatures + ${result.anchors} anchors`;
    renderEntry(selectedSequence, { updateHistory: false });
  } catch (error) {
    verificationPassed = false;
    status.dataset.state = "fail";
    status.textContent = "FAIL";
    byId("chain-verification-label").textContent = error.message;
    renderEntry(selectedSequence, { updateHistory: false });
  } finally {
    button.disabled = false;
  }
}

async function runMutation() {
  const entry = log.entries[selectedSequence];
  const mutated = { ...entry, date: `${entry.date}T` };
  const changedHash = await sha256Hex(signedFields(mutated));
  byId("mutation-test-date").textContent = mutated.date;
  byId("mutation-test-hash").textContent = changedHash;
  byId("mutation-lab").dataset.state = "broken";
  byId("mutation-result").textContent =
    `BREAK AT SEQ ${entry.seq}: the recomputed hash is ${shorten(changedHash)}. ` +
    "The published signature targets the original hash, and the next entry still names the original predecessor.";
}

async function copyEntry() {
  const button = byId("chain-copy");
  await navigator.clipboard.writeText(JSON.stringify(log.entries[selectedSequence], null, 2));
  const original = button.textContent;
  button.textContent = "Copied";
  window.setTimeout(() => { button.textContent = original; }, 1400);
}

async function load() {
  try {
    const [logResponse, anchorResponse] = await Promise.all([
      fetch(config.source_urls.log, { cache: "no-store" }),
      fetch(config.source_urls.anchors, { cache: "no-store" }),
    ]);
    if (!logResponse.ok || !anchorResponse.ok) throw new Error("A public source could not be loaded");
    [log, anchors] = await Promise.all([logResponse.json(), anchorResponse.json()]);
    anchorBySequence = new Map(anchors.anchors.map((anchor) => [anchor.seq, anchor]));
    selectedSequence = querySequence();
    renderEntry(selectedSequence, { updateHistory: false });
    await runVerification();
  } catch (error) {
    const status = byId("chain-verification-status");
    status.dataset.state = "fail";
    status.textContent = "FAIL";
    byId("chain-verification-label").textContent = error.message;
  }
}

range.addEventListener("input", () => renderEntry(Number(range.value)));
byId("chain-prev").addEventListener("click", () => renderEntry(selectedSequence - 1));
byId("chain-next").addEventListener("click", () => renderEntry(selectedSequence + 1));
byId("chain-boundary-jump").addEventListener("click", () => renderEntry(config.facts.first_disclosed_seq));
byId("chain-head-jump").addEventListener("click", () => renderEntry(config.facts.head_seq));
byId("chain-verify").addEventListener("click", runVerification);
byId("chain-mutate").addEventListener("click", runMutation);
byId("chain-copy").addEventListener("click", copyEntry);
window.addEventListener("resize", drawChain, { passive: true });

load();
