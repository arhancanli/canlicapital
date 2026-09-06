const GENESIS = "0".repeat(64);
const TRANSPARENCY_SCHEMA = "glassbox.transparency_log/2";
const PAYLOAD_SCHEMA = "canli.alphac-track-record-daily-digest.v1";

const encoder = new TextEncoder();

export function hexToBytes(hex) {
  if (typeof hex !== "string" || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) {
    throw new TypeError("Expected an even-length hexadecimal string");
  }
  return Uint8Array.from(hex.match(/.{2}/g), (byte) => Number.parseInt(byte, 16));
}

export function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(value, cryptoApi = globalThis.crypto) {
  if (!cryptoApi?.subtle) throw new Error("Web Crypto is unavailable");
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  return bytesToHex(await cryptoApi.subtle.digest("SHA-256", bytes));
}

export function signedFields(entry) {
  return `${entry.prev_chain_hash}|${entry.payload_sha256}|${entry.date}|${entry.seq}`;
}

async function importPublicKey(publicKeyHex, cryptoApi) {
  try {
    return await cryptoApi.subtle.importKey(
      "raw",
      hexToBytes(publicKeyHex),
      { name: "Ed25519" },
      false,
      ["verify"],
    );
  } catch (error) {
    throw new Error(`Ed25519 verification is unavailable: ${error.message}`);
  }
}

export async function validateEvidenceChain(document, anchorsDocument, cryptoApi = globalThis.crypto) {
  if (document?.schema !== TRANSPARENCY_SCHEMA) {
    throw new Error("Transparency schema mismatch");
  }
  const entries = document.entries;
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error("Transparency chain is empty");
  }
  if (document.entry_count !== entries.length) {
    throw new Error("Published entry count does not match the chain");
  }
  const publicKey = await importPublicKey(document.public_key_ed25519_hex, cryptoApi);
  let previous = GENESIS;
  let firstDisclosed = null;
  let disclosedEntries = 0;

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry.seq !== index) throw new Error(`Non-contiguous sequence at ${index}`);
    if (entry.prev_chain_hash !== previous) throw new Error(`Predecessor mismatch at ${index}`);
    const expectedChainHash = await sha256Hex(signedFields(entry), cryptoApi);
    if (entry.chain_hash !== expectedChainHash) throw new Error(`Chain hash mismatch at ${index}`);
    const signatureValid = await cryptoApi.subtle.verify(
      { name: "Ed25519" },
      publicKey,
      hexToBytes(entry.signature),
      hexToBytes(expectedChainHash),
    );
    if (!signatureValid) throw new Error(`Signature mismatch at ${index}`);
    if (Object.hasOwn(entry, "payload")) {
      if (entry.payload_schema !== PAYLOAD_SCHEMA) {
        throw new Error(`Payload schema mismatch at ${index}`);
      }
      if (firstDisclosed === null) firstDisclosed = index;
      disclosedEntries += 1;
    } else if (firstDisclosed !== null) {
      throw new Error(`Opaque entry after disclosure boundary at ${index}`);
    }
    previous = expectedChainHash;
  }

  const disclosure = document.payload_disclosure;
  const opaqueEntries = entries.length - disclosedEntries;
  if (
    firstDisclosed === null ||
    disclosure?.first_disclosed_seq !== firstDisclosed ||
    disclosure?.disclosed_entries !== disclosedEntries ||
    disclosure?.opaque_historical_entries !== opaqueEntries
  ) {
    throw new Error("Payload disclosure boundary mismatch");
  }

  const anchors = anchorsDocument?.anchors;
  if (!Array.isArray(anchors) || anchors.length !== anchorsDocument.anchor_count) {
    throw new Error("OpenTimestamps anchor manifest mismatch");
  }
  let bitcoinConfirmed = 0;
  let calendarPending = 0;
  for (const anchor of anchors) {
    const entry = entries[anchor.seq];
    if (!entry || entry.chain_hash !== anchor.chain_hash || entry.date !== anchor.date) {
      throw new Error(`OpenTimestamps checkpoint mismatch at ${anchor.seq}`);
    }
    if (anchor.status === "bitcoin") bitcoinConfirmed += 1;
    else if (anchor.status === "pending") calendarPending += 1;
    else throw new Error(`Unknown OpenTimestamps status at ${anchor.seq}`);
  }
  if (
    bitcoinConfirmed !== anchorsDocument.bitcoin_confirmed_count ||
    calendarPending !== anchorsDocument.calendar_pending_count
  ) {
    throw new Error("OpenTimestamps status count mismatch");
  }

  return {
    status: "PASS",
    entries: entries.length,
    first_date: entries[0].date,
    last_date: entries.at(-1).date,
    head_seq: entries.at(-1).seq,
    head_chain_hash: entries.at(-1).chain_hash,
    signatures_verified: entries.length,
    links_verified: entries.length,
    first_disclosed_seq: firstDisclosed,
    disclosed_entries: disclosedEntries,
    opaque_historical_entries: opaqueEntries,
    anchors: anchors.length,
    bitcoin_confirmed_anchors: bitcoinConfirmed,
    calendar_pending_anchors: calendarPending,
    payload_rehash: "REQUIRES_PUBLISHED_PYTHON_VERIFIER",
  };
}
