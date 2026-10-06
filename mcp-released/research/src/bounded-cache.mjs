import { Buffer } from "node:buffer";

const MAX_ENTRIES = 32;
const MAX_TEXT_BYTES = 8 * 1024 * 1024;
const TTL_MS = 10 * 60 * 1000;

function weight(entry, now) {
  if (!Number.isFinite(now) || !entry || !Number.isFinite(entry.at) || typeof entry.text !== "string") return null;
  const age = now - entry.at;
  if (!Number.isFinite(age) || age < 0 || age >= TTL_MS || entry.text.length > MAX_TEXT_BYTES) return null;
  const bytes = Buffer.byteLength(entry.text, "utf8");
  return bytes <= MAX_TEXT_BYTES ? bytes : null;
}

// Map inspection stays ordinary. Admission and lookup enforce a fixed per-session text
// budget; insertion order is LRU order. Recompute weights during these bounded operations,
// rather than trusting counters that a mutable test entry could leave out of date.
export class BoundedCache extends Map {
  #sweep(now) {
    let retained = 0;
    for (const [key, entry] of super.entries()) {
      const bytes = weight(entry, now);
      if (bytes === null) super.delete(key);
      else retained += bytes;
    }
    while (this.size > MAX_ENTRIES || retained > MAX_TEXT_BYTES) {
      const key = super.keys().next().value;
      retained -= Buffer.byteLength(super.get(key).text, "utf8");
      super.delete(key);
    }
    return retained;
  }

  lookup(key, now) {
    this.#sweep(now);
    const entry = super.get(key);
    if (entry !== undefined) {
      super.delete(key);
      super.set(key, entry);
    }
    return entry;
  }

  set(key, entry) {
    // Unusable admission time is no cache evidence and cannot replace a healthy entry.
    if (!entry || !Number.isFinite(entry.at)) return this;
    let retained = this.#sweep(entry.at);
    const bytes = weight(entry, entry.at);
    if (bytes === null) return this;
    const previous = super.get(key);
    if (super.delete(key)) retained -= Buffer.byteLength(previous.text, "utf8");
    while (this.size >= MAX_ENTRIES || retained + bytes > MAX_TEXT_BYTES) {
      const oldest = super.keys().next().value;
      retained -= Buffer.byteLength(super.get(oldest).text, "utf8");
      super.delete(oldest);
    }
    super.set(key, entry);
    return this;
  }
}
