// The cap covers bytes accepted from the native body, before decoding. The transport may
// already have allocated a supplied chunk; neither its memory nor a blocked event loop is ours.
export class ResponseReadError extends Error {
  constructor(code, status) {
    super(code);
    this.name = "ResponseReadError";
    this.code = code;
    this.status = status;
  }
}

function checkAbort(signal) {
  if (signal.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
}

// Both fetch and each read share the caller's deadline. A transport that ignores abort may
// finish later; observe its rejection, and dispose of a late response without reading it.
function untilAbort(pending, signal, onLate) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", aborted);
      fn(value);
    };
    const aborted = () => finish(reject, signal.reason ?? new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", aborted, { once: true });
    if (signal.aborted) aborted();
    Promise.resolve(pending).then(
      (value) => {
        if (settled) {
          onLate?.(value);
          return;
        }
        if (signal.aborted) {
          aborted();
          onLate?.(value);
          return;
        }
        finish(resolve, value);
      },
      (error) => finish(reject, error),
    );
  });
}

function closeReader(reader, failed) {
  try {
    // Do not extend the deadline by awaiting an untrusted cancellation promise.
    if (failed) Promise.resolve(reader.cancel()).catch(() => {});
  } catch {
    // Disposal cannot replace the original HTTP, byte, decode or abort failure.
  } finally {
    try { reader.releaseLock(); } catch { /* The transport owns any remaining lock failure. */ }
  }
}

function discardResponse(response) {
  try {
    const reader = response.body?.getReader();
    if (reader) closeReader(reader, true);
  } catch {
    // A late response is never read or admitted to the cache.
  }
}

function advertisedOversize(value, maxBytes) {
  if (value === null || !/^\d+$/.test(value.trim())) return false;
  const digits = value.trim().replace(/^0+/, "") || "0";
  const limit = String(maxBytes);
  return digits.length > limit.length || (digits.length === limit.length && digits > limit);
}

export async function readBoundedResponse(response, { signal, maxBytes }) {
  let reader;
  let failed = true;
  try {
    reader = response.body?.getReader();
    checkAbort(signal);
    if (response.status >= 400) throw new ResponseReadError("HTTP", response.status);
    if (advertisedOversize(response.headers.get("content-length"), maxBytes)) {
      throw new ResponseReadError("TOO_LARGE");
    }
    if (!reader) {
      failed = false;
      return "";
    }
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const parts = [];
    let accepted = 0;
    for (;;) {
      checkAbort(signal);
      const { value, done } = await untilAbort(reader.read(), signal);
      checkAbort(signal);
      if (done) break;
      if (!(value instanceof Uint8Array)) throw new ResponseReadError("NON_BYTE_BODY");
      if (value.byteLength > maxBytes - accepted) throw new ResponseReadError("TOO_LARGE");
      accepted += value.byteLength;
      try {
        parts.push(decoder.decode(value, { stream: true }));
      } catch {
        throw new ResponseReadError("INVALID_UTF8");
      }
    }
    try {
      parts.push(decoder.decode());
    } catch {
      throw new ResponseReadError("INVALID_UTF8");
    }
    checkAbort(signal);
    const text = parts.join("");
    failed = false;
    return text;
  } finally {
    if (reader) closeReader(reader, failed);
  }
}

export async function fetchBoundedText(fetchImpl, url, { signal, maxBytes, headers }) {
  checkAbort(signal);
  const response = await untilAbort(
    fetchImpl(url, { signal, redirect: "error", ...(headers ? { headers } : {}) }),
    signal,
    discardResponse,
  );
  return readBoundedResponse(response, { signal, maxBytes });
}
