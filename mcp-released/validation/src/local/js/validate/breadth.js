// js/validate/breadth.js
// The pure computation behind POST /api/v1/validate/breadth, shared by the API route and the
// MCP package's local mode (mcp/src/local mirrors it byte for byte), so the two cannot disagree.
import { bookSharpe, breadthCeiling, ceilingCaptured, maxSleeves, sleevesRequired } from "../breadth-core.js";

export function compute(body) {
  const sleeveSharpe = Number(body.sleeve_sharpe);
  const correlation = Number(body.average_pairwise_correlation);
  if (!Number.isFinite(sleeveSharpe) || sleeveSharpe <= 0) throw new RangeError("sleeve_sharpe must be a positive number");
  if (!Number.isFinite(correlation) || correlation < -1 || correlation > 1) throw new RangeError("average_pairwise_correlation must be between -1 and 1");
  const sleeves = body.sleeves === undefined ? null : Number(body.sleeves);
  if (sleeves !== null && (!Number.isInteger(sleeves) || sleeves < 1 || sleeves > 500)) throw new RangeError("sleeves must be an integer from 1 to 500");
  const target = body.target === undefined ? null : Number(body.target);
  if (target !== null && !(target > 0)) throw new RangeError("target must be a positive Sharpe");
  const ceiling = breadthCeiling({ sleeveSharpe, correlation });
  const cap = maxSleeves(correlation);
  const bounded = Number.isFinite(ceiling);
  // A negative shared correlation admits only so many sleeves, so the ceiling is the book at that
  // count and is reached; a positive one gives a limit no finite book reaches; zero gives none.
  const kind = !bounded ? "unbounded" : correlation > 0 ? "limit" : "maximum";
  const out = {
    identity: "S_book = s_bar * sqrt(N / (1 + (N - 1) * rho_bar)); for rho_bar > 0 the ceiling is the limit s_bar / sqrt(rho_bar); for rho_bar < 0 only N < 1 - 1 / rho_bar is possible, and the ceiling is the book at the largest such N",
    ceiling: bounded ? ceiling : null,
    ceiling_is_unbounded: !bounded,
    ceiling_kind: kind,
    ...(Number.isFinite(cap) ? { max_sleeves: cap } : {}),
  };
  if (sleeves !== null) {
    if (sleeves > cap) throw new RangeError(`a shared correlation of ${correlation} admits at most ${cap} sleeves: with more, 1 + (N - 1) * rho is not positive and no real set of returns has that correlation`);
    out.book = { sleeves, book_sharpe: bookSharpe({ sleeveSharpe, sleeves, correlation }), ceiling_captured: bounded ? ceilingCaptured({ sleeveSharpe, sleeves, correlation }) : null };
  }
  if (target !== null) {
    const req = sleevesRequired({ sleeveSharpe, correlation, target });
    const n = req.sleeves;
    out.target = {
      target,
      reachable: req.reachable,
      sleeves_required: n,
      note: req.reachable
        ? `${n} sleeve${n === 1 ? "" : "s"} of this quality at this correlation reach a book Sharpe of ${target}; ${n === 1 ? "one sleeve already does" : `${n - 1} fall short`}.`
        : kind === "maximum"
          ? `At most ${cap} sleeves can share this correlation, and ${cap} of them reach only ${ceiling.toFixed(3)}; raise per-sleeve quality.`
          : "No number of sleeves of this quality at this correlation reaches the target; raise per-sleeve quality or lower correlation.",
    };
  }
  out.plain_reading = kind === "unbounded"
    ? "With average pairwise correlation of zero the book Sharpe grows with the square root of the sleeve count and has no ceiling from breadth alone; independence this clean is rare and should be checked in stress."
    : kind === "maximum"
      ? `A shared correlation of ${correlation} is possible for at most ${cap} sleeves, and ${cap} of them are worth a book Sharpe of ${ceiling.toFixed(3)}; a negative average correlation this strong is rare and should be checked in stress.`
      : `Adding sleeves of this quality can never take the book above a Sharpe of ${ceiling.toFixed(3)}. Quality and correlation set the ceiling; count only approaches it.`;
  return out;
}
