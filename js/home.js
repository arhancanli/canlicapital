// The homepage: the canli-mcp film (js/home-film.js), copy buttons on the install
// commands, and the release-notes form. Every word on the page is HTML; the film plays
// behind it and the page reads the same without it.

const byId = (id) => document.getElementById(id);

// Copy buttons for the install commands. The command stays selectable text either way.
for (const figure of document.querySelectorAll(".install .cmd")) {
  const pre = figure.querySelector("pre");
  if (!pre || figure.querySelector(".cmd__copy")) continue;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "cmd__copy";
  button.textContent = "Copy";
  button.setAttribute("aria-label", `Copy the command for ${figure.querySelector("figcaption")?.textContent ?? "your client"}`);
  const status = document.createElement("span");
  status.className = "cmd__status";
  status.setAttribute("role", "status");
  figure.append(button, status);
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(pre.textContent.trim());
      status.textContent = "Copied.";
      button.textContent = "Copied";
      setTimeout(() => { button.textContent = "Copy"; status.textContent = ""; }, 2400);
    } catch {
      status.textContent = "Copy unavailable. Select the command and copy it.";
      pre.focus();
    }
  });
}

// The film loads after the page is usable, and never on a reduced-data connection.
import("./home-film.js").catch(() => document.documentElement.classList.add("no-webgl"));

const form = byId("waitlist-form");
form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = byId("email");
  const status = byId("form-status");
  const button = form.querySelector("button[type='submit']");
  if (button.disabled) return;
  status.dataset.error = "false";
  if (!email.validity.valid) {
    status.textContent = "Enter a valid email address.";
    status.dataset.error = "true";
    email.setAttribute("aria-invalid", "true");
    email.focus();
    return;
  }

  email.removeAttribute("aria-invalid");
  button.disabled = true;
  status.textContent = "Joining research updates…";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let failureMessage = "Could not save your email. Try again shortly.";
  try {
    const payload = Object.fromEntries(new FormData(form));
    const response = await fetch(form.action, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (response.status === 429) failureMessage = "Too many requests. Wait a minute and try again.";
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "Could not save right now.");
    form.reset();
    email.removeAttribute("aria-invalid");
    status.textContent = "You're on the research update list. The public record stays open either way.";
  } catch (error) {
    status.textContent = error.name === "AbortError"
      ? "The request timed out. Your subscription was not confirmed. Try again."
      : failureMessage;
    status.dataset.error = "true";
  } finally {
    clearTimeout(timeout);
    button.disabled = false;
  }
});
