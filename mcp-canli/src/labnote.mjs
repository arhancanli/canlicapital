// mcp-canli/src/labnote.mjs
//
// The Lab's word on every strategy answer. Where the Lab is built on this machine (src/lab.mjs) and a strategy result
// can be dated, the answer says where its Sharpe ranks among the Lab's strategies over the same months, the best of
// them (the bar that simple rules on public data reached, skill or not), and the Lab strategy it most resembles. For
// a sweep that is its best variant, the one a search would keep. It is originality_check, run for the model on what it
// already tested.
//
// Dates come from the tool where it hands them over (breadth_sweep, under TRIAL_DATES, which JSON leaves out), or from
// the call's own dates argument: one per return, or one per price row, the first row having no return. Nothing is
// guessed: a result with no dates of the right length gets no Lab note.
import { createHash } from "node:crypto";

export const TRIAL_DATES = Symbol.for("canli.trial_dates");
const DATE = /^\d{4}-\d{2}(-\d{2})?/;
// One Lab pass is about a second on a laptop: at most this many strategy answers a batch are checked, the first ones.
export const LAB_NOTES_PER_ANSWER = 3;

// The dates of n returns: the tool's own, else the call's dates (one per return, or per price row).
export function datesFor(n, handed, ran) {
  const fit = (d) => {
    if (!Array.isArray(d) || !d.every((x) => typeof x === "string" && DATE.test(x))) return null;
    const out = d.length === n ? d : d.length === n + 1 ? d.slice(1) : null;
    return out ? out.map((x) => x.slice(0, x.length >= 10 && x[7] === "-" ? 10 : 7)) : null;
  };
  const inner = ran?.arguments && typeof ran.arguments === "object" && !Array.isArray(ran.arguments) ? ran.arguments : null;
  return fit(handed) ?? fit(ran?.dates) ?? fit(inner?.dates);
}

const two = (x) => Number(x).toFixed(2);

// The note for one series: compact, since it rides on the answer. lab: the opened Lab; runOriginality from lab.mjs.
export function labNote(lab, runOriginality, returns, dates) {
  let o;
  try { o = runOriginality(lab, { returns: Array.from(returns), dates, nearest: 1 }, { blends: false }); }
  catch (e) { return { checked: false, why: e.message.split(/(?<=\.) /)[0] }; }
  const near = o.nearest.rows[0];
  const ranked = o.rank.against > 0;
  return {
    months: o.months, from: o.first_month, to: o.last_month, sharpe_monthly_annualized: o.sharpe_monthly_annualized,
    ...(ranked ? { beats_percent: o.rank.percentile, of: o.rank.against, lab_best_same_months: { sharpe: o.rank.lab_best_same_months.sharpe, id: o.rank.lab_best_same_months.id } } : {}),
    nearest: near ? { id: near[0], corr: near[1], strategy: near[4] } : null,
    near_copies_corr_0_7: o.near_copies.at_least_0_7,
    reading: `${ranked ? `Over ${o.months} months its Sharpe (${two(o.sharpe_monthly_annualized)}, from monthly returns) beats ${o.rank.percentile.toFixed(1)}% of the ${o.rank.against} Lab strategies covering them; the best of those reached ${two(o.rank.lab_best_same_months.sharpe)}, what the best of that many simple rules shows, skill or not.` : `No Lab strategy covers 90% of these ${o.months} months, so it is not ranked.`}${near ? ` Nearest: Lab ${near[0]} (correlation ${two(near[1])}).` : ""} lab_strategy shows any of them; originality_check gives the full comparison.`,
  };
}

// Per session: each series checked once (an answer run again reads the same note), and the Lab not built said once.
export function createLabNotes({ lab, runOriginality, enabled = true }) {
  const seen = new Map();
  let toldNotBuilt = false;
  return {
    // series: the result's returns (best first for a sweep); returns the note to add, or null.
    note(series, handed, ran) {
      if (!enabled || !lab || !Array.isArray(series) || !series.length) return null;
      const all = series[0];
      if (!all || typeof all.length !== "number" || all.length < 24) return null;
      const dated = datesFor(all.length, handed, ran);
      if (!dated) return null;
      // A rule's warm-up is flat (0) before its first position: those days are not months it traded.
      let start = 0;
      while (start < all.length && all[start] === 0) start += 1;
      const best = Array.prototype.slice.call(all, start), dates = dated.slice(start);
      if (best.length < 24) return null;
      let opened;
      try { opened = lab(); }
      catch {
        if (toldNotBuilt) return null;
        toldNotBuilt = true;
        return { checked: false, why: "The Lab is not built on this machine. Build it once (npx -y canli-mcp lab build) and every dated strategy answer is set against about a million simple strategies over the same months." };
      }
      const key = createHash("sha256").update(new Uint8Array(Float64Array.from(best).buffer)).update(dates.join(",")).digest("base64");
      if (!seen.has(key)) { if (seen.size >= 200) seen.delete(seen.keys().next().value); seen.set(key, labNote(opened, runOriginality, best, dates)); }
      return seen.get(key);
    },
  };
}
