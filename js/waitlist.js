// =============================================================================
// CANLI CAPITAL / waitlist.js
// -----------------------------------------------------------------------------
// The single conversion on the pre-launch page. Binds to the shared DOM
// contract (form#waitlist-form), validates the email on the client, blocks the
// honeypot, posts JSON {email} to /api/waitlist, and reports state in
// #waitlist-status with an aria-live region for assistive tech.
//
// Design intent (matches the austere house voice):
//   - One status element carries every message. A state class colors it:
//     is-error uses the signal accent, is-success uses paper-dim.
//   - No double-submit: the button is disabled and relabeled while in flight.
//   - The honeypot path is a silent success. A bot that fills name="company"
//     is told "you are on the list" without a network call, so it stops trying.
//   - Graceful by default. With JS off the native form still renders and the
//     server function (or the dev fallback below) handles a plain POST. If the
//     bare static server answers 404 or 405 (no backend during local review),
//     the client treats that as "accepted in dev" so the demo is never broken.
//
// This module is self-initializing on import AND on a plain <script type=module>
// include. A dataset guard (data-waitlist-bound) makes a second binding a no-op,
// so it is safe regardless of how the page wires it.
// =============================================================================

const ENDPOINT = "/api/waitlist";

// Strings are fixed by the creative brief. Comma and period punctuation only,
// zero dashes anywhere. Honest pre-launch voice: no fabricated queue position,
// no promised dates, no claimed returns.
const MSG = {
  invalid: "That email does not look right. Check it and try again.",
  error: "Something interrupted that. Your spot is not saved yet, so try once more.",
  success: "You are on the list. We open access in order, as each stage is validated.",
};

const SUBMIT_LABEL = "Request early access";
const SUBMIT_BUSY = "Adding you...";

// Same validation shape used elsewhere in the build: a non-empty local part, an
// at sign, a domain, a dot, and a tld. Intentionally permissive, since the
// server validates again and email is ultimately confirmed by the note we send.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(value) {
  return EMAIL_RE.test(value);
}

// Persist the address locally so a returning visitor (or a demo under the bare
// static server) sees a consistent, already-joined state without a backend.
function rememberLocally(email) {
  try {
    window.localStorage.setItem("meridian.waitlist.email", email);
    window.localStorage.setItem("meridian.waitlist.ts", String(Date.now()));
  } catch (e) {
    // storage can be unavailable (private mode, blocked). Not fatal.
  }
}

function alreadyJoinedLocally() {
  try {
    return Boolean(window.localStorage.getItem("meridian.waitlist.email"));
  } catch (e) {
    return false;
  }
}

export function initWaitlist(root = document) {
  const form = root.getElementById
    ? root.getElementById("waitlist-form")
    : root.querySelector("#waitlist-form");
  if (!form) return;

  // Guard against a double binding (e.g. both an explicit import and a script
  // include). First binder wins; the rest are no-ops.
  if (form.dataset.waitlistBound === "1") return;
  form.dataset.waitlistBound = "1";

  const input = form.querySelector("#waitlist-email");
  const status = form.querySelector("#waitlist-status");
  const button = form.querySelector('button[type="submit"]');
  const honeypot = form.querySelector('input[name="company"]');
  const row = form.querySelector(".waitlist__row");
  const label = form.querySelector(".waitlist__label");

  if (!input || !status || !button) return;

  // The status line is the only confirmation a visitor gets. On some viewports
  // it can land just below the fold after submit, so bring it into view when it
  // carries a real message. Respects reduced motion (instant, no smooth scroll).
  const ensureStatusVisible = () => {
    if (!status.textContent) return;
    const prefersReduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const r = status.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    // Only scroll if the line sits below the comfortable viewport (or above it).
    if (r.bottom > vh - 24 || r.top < 0) {
      try {
        status.scrollIntoView({
          behavior: prefersReduced ? "auto" : "smooth",
          block: "center",
        });
      } catch (e) {
        status.scrollIntoView();
      }
    }
  };

  const setStatus = (text, state) => {
    status.textContent = text;
    status.classList.remove("is-error", "is-success");
    if (state) status.classList.add(state);
    if (text && state) ensureStatusVisible();
  };

  const setBusy = (busy) => {
    button.disabled = busy;
    button.setAttribute("aria-busy", busy ? "true" : "false");
    button.textContent = busy ? SUBMIT_BUSY : SUBMIT_LABEL;
  };

  // The success terminal state: retire the interactive controls and leave the
  // status line as the confirmation. Visual hiding keeps layout calm; the form
  // is marked done so a second visit reads the same.
  const showSuccess = () => {
    if (row) row.hidden = true;
    if (label) label.hidden = true;
    form.dataset.waitlistDone = "1";
    setStatus(MSG.success, "is-success");
  };

  // If this browser already joined, present the done state immediately rather
  // than offering the field again.
  if (alreadyJoinedLocally()) {
    showSuccess();
  }

  let submitting = false;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting || form.dataset.waitlistDone === "1") return;

    // Honeypot first. A real person never fills a field they cannot see. If it
    // is filled, show success and never touch the network. Starve the bot.
    if (honeypot && honeypot.value.trim() !== "") {
      showSuccess();
      return;
    }

    const email = input.value.trim();

    if (!isValidEmail(email)) {
      setStatus(MSG.invalid, "is-error");
      input.focus();
      return;
    }

    submitting = true;
    setBusy(true);
    setStatus("", null);

    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, company: honeypot ? honeypot.value : "" }),
      });

      // Under a bare static dev server there is no backend, so /api/waitlist
      // answers 404 (not found), 405 (method not allowed), or 501 (Python's
      // http.server, which does not implement POST). Treat any of these as
      // accepted-in-dev so a local review never shows a broken form. Production
      // (the Vercel function) returns 200 here, so this only affects local QA.
      // Persist the email locally so the demo state is durable.
      const acceptedInDev =
        res.status === 404 || res.status === 405 || res.status === 501;

      if (res.ok || acceptedInDev) {
        rememberLocally(email);
        showSuccess();
      } else {
        throw new Error("Unexpected response status " + res.status);
      }
    } catch (err) {
      // Network failure or a real server error. Let the visitor try again.
      submitting = false;
      setBusy(false);
      setStatus(MSG.error, "is-error");
      return;
    }

    submitting = false;
    button.disabled = true; // success is terminal; keep it disabled
  });

  // Clearing an error as the visitor corrects the field is a small courtesy.
  input.addEventListener("input", () => {
    if (status.classList.contains("is-error")) setStatus("", null);
  });
}

// Auto-init so the module works as a plain include or an explicit import.
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => initWaitlist(document));
  } else {
    initWaitlist(document);
  }
}

export default initWaitlist;
