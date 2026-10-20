import { Buffer } from "node:buffer";

// A per-session text cache with a fixed budget: at most `maxEntries` entries and `maxBytes` of
// UTF-8 text in all (no single entry above half of it), each kept for `ttlMs`. Insertion order is
// least-recently-used order. An entry's size is measured once, when it is admitted, so lookups
// stay cheap however much is cached (market-wide frames and company histories run to megabytes).
export class BoundedCache extends Map {
  #maxEntries;
  #maxBytes;
  #ttl;
  #bytes = 0;

  constructor({ maxEntries = 96, maxBytes = 96 * 1024 * 1024, ttlMs = 10 * 60 * 1000 } = {}) {
    super();
    this.#maxEntries = maxEntries;
    this.#maxBytes = maxBytes;
    this.#ttl = ttlMs;
  }

  get bytes() {
    return this.#bytes;
  }

  #drop(key) {
    const entry = super.get(key);
    if (entry === undefined) return;
    this.#bytes -= entry.bytes;
    super.delete(key);
  }

  #expired(entry, now) {
    const age = now - entry.at;
    return !Number.isFinite(age) || age < 0 || age >= this.#ttl;
  }

  lookup(key, now) {
    const entry = super.get(key);
    if (entry === undefined) return undefined;
    if (!Number.isFinite(now) || this.#expired(entry, now)) {
      this.#drop(key);
      return undefined;
    }
    super.delete(key);
    super.set(key, entry);
    return entry;
  }

  set(key, entry) {
    // An unusable admission time is no cache evidence and cannot replace a healthy entry.
    if (!entry || !Number.isFinite(entry.at) || typeof entry.text !== "string") return this;
    const bytes = Buffer.byteLength(entry.text, "utf8");
    if (bytes > this.#maxBytes / 2) return this;
    this.#drop(key);
    for (const [k, e] of super.entries()) if (this.#expired(e, entry.at)) this.#drop(k);
    while (this.size >= this.#maxEntries || this.#bytes + bytes > this.#maxBytes) this.#drop(super.keys().next().value);
    super.set(key, { ...entry, bytes });
    this.#bytes += bytes;
    return this;
  }
}
