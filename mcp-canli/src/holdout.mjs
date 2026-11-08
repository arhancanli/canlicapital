// mcp-canli/src/holdout.mjs
//
// The holdout vault. A researcher who tests a strategy on every year of data has no years left to check it on,
// and one who keeps the last years aside can still look at them by accident, or a hundred times on purpose.
// Here the server keeps them: holdout_set hides every date from a day on from every tool for the rest of the
// session, under the time machine's locks (arguments held to the day before, later rows dropped, a tool that
// cannot be held is off), and holdout_test runs one call on the hidden years, once. The test is recorded with
// its hashes, and the period stays hidden after it, so a second look is refused rather than counted.
//
// It hides what this server's tools read. Data a caller passes in itself, files it names, and the model's own
// memory of those years are not hidden, and the answers say so.
import { z } from "zod";

const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date as YYYY-MM-DD");
const dayBefore = (d) => new Date(Date.parse(`${d}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);

export const HOLDOUT_TOOLS = Object.freeze([
  { name: "holdout_set", pack: "desk", toolset: "desk", title: "Hide a holdout period until it is tested once", annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    input: z.object({ from: DAY.describe("The first hidden day; every later date is hidden too."), note: z.string().max(200).optional().describe("What the holdout is for, kept with it.") }).strict(),
    description: "Keep the years from a date aside for the rest of this session: every tool answers as of the day before, and a tool that cannot be held to that date is off. Results kept so far are cleared, since they may show the hidden years. holdout_test then runs one call on them, once. Local server only.",
    keywords: "holdout out of sample hold out test set hidden period vault reserve last years one test final test",
    args: "from: date, note?: string" },
  { name: "holdout_test", pack: "desk", toolset: "desk", title: "Run the one test on the holdout", annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    input: z.object({ name: z.string().min(1).max(100).describe("The tool to run, as find_tool names it."), arguments: z.record(z.string(), z.unknown()).optional() }).strict(),
    description: "Run one tool call that sees the hidden holdout years, once per session, and record it with the hashes of what was asked and answered. A second test is refused: the holdout stays hidden after its test.",
    keywords: "holdout test out of sample final test once open vault evaluate hidden period",
    args: "name: string, arguments?: object" },
  { name: "holdout_status", pack: "desk", toolset: "desk", title: "The holdout vault's state", annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    input: z.object({}).strict(),
    description: "Whether a holdout is set, from when, what ran before it was set, and the one test if it has run.",
    keywords: "holdout status vault hidden period test recorded",
    args: "" },
]);
export const HOLDOUT_NAMES = new Set(HOLDOUT_TOOLS.map((t) => t.name));

export const HOLDOUT_LIMITS = "It hides what this server's tools read. Data passed in by the caller, files it names, and the model's own memory of the hidden years are not hidden.";

// onSet: what to clear when the vault closes (the results kept so far). now: the clock.
export function createVault({ onSet = () => {}, now = () => new Date().toISOString() } = {}) {
  let vault = null, seen = 0;
  return {
    // The last visible day while the vault is closed, or null.
    until: () => (vault ? vault.until : null),
    from: () => vault?.from ?? null,
    // A call that read the world before the vault was set, which may have seen the years it hides.
    saw() { if (!vault) seen += 1; },
    set(args) {
      const a = HOLDOUT_TOOLS[0].input.parse(args ?? {});
      const today = now().slice(0, 10);
      if (Number.isNaN(Date.parse(`${a.from}T00:00:00Z`))) throw new Error(`${a.from} is not a date.`);
      if (a.from > today) throw new Error(`The holdout must start on or before today (${today}); nothing after today can be read anyway.`);
      if (vault?.tested) throw new Error(`The holdout from ${vault.from} was tested at ${vault.tested.at}; it cannot be moved after its test.`);
      if (vault && a.from >= vault.from) throw new Error(`A holdout from ${vault.from} is set; it can start earlier, hiding more, never later.`);
      vault = { from: a.from, until: dayBefore(a.from), set_at: now(), ...(a.note ? { note: a.note } : {}), calls_before: seen, tested: null };
      onSet();
      return { ...this.status(), cleared: "Results kept before now were cleared: they may show the hidden years." };
    },
    status() {
      if (!vault) return { holdout: null, calls_so_far: seen, how: "holdout_set with a from date hides every date from it for the rest of this session; holdout_test then runs one call on them, once." };
      return {
        holdout: { from: vault.from, visible_until: vault.until, set_at: vault.set_at, ...(vault.note ? { note: vault.note } : {}) },
        calls_before_it: vault.calls_before,
        ...(vault.calls_before ? { caution: `${vault.calls_before} call${vault.calls_before === 1 ? "" : "s"} read the world before the holdout was set and may have shown the hidden years.` } : {}),
        test: vault.tested ?? "not yet run: holdout_test runs one call on the hidden years, once.",
        limits: HOLDOUT_LIMITS,
      };
    },
    // The one test: refused without a vault or after its test; recorded with its hashes.
    check() {
      if (!vault) throw new Error("No holdout is set. holdout_set with a from date sets one; until then every call already sees every date.");
      if (vault.tested) throw new Error(`The holdout from ${vault.from} was tested once at ${vault.tested.at} (${vault.tested.tool}); a second test would make it part of the search.`);
    },
    record(test) { vault.tested = { ...test, at: now() }; return vault.tested; },
  };
}
