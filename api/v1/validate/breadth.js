// api/v1/validate/breadth.js
import { bookSharpe, breadthCeiling, ceilingCaptured, sleevesRequired } from "../../../js/breadth-core.js";
import { validatorHandler } from "../../_lib/handler.js";

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
  const out = { identity: "S_book = s_bar * sqrt(N / (1 + (N - 1) * rho_bar)); ceiling as N grows is s_bar / sqrt(rho_bar)", ceiling: Number.isFinite(ceiling) ? ceiling : null, ceiling_is_unbounded: !Number.isFinite(ceiling) };
  if (sleeves !== null) out.book = { sleeves, book_sharpe: bookSharpe({ sleeveSharpe, sleeves, correlation }), ceiling_captured: Number.isFinite(ceiling) ? ceilingCaptured({ sleeveSharpe, sleeves, correlation }) : null };
  if (target !== null) {
    const req = sleevesRequired({ sleeveSharpe, correlation, target });
    out.target = { target, reachable: req.reachable, sleeves_required: req.sleeves, note: req.reachable ? "At this per-sleeve quality and correlation the target is reachable with the stated sleeve count." : "No number of sleeves of this quality at this correlation reaches the target; raise per-sleeve quality or lower correlation." };
  }
  out.plain_reading = out.ceiling_is_unbounded ? "With average pairwise correlation at or below zero the book Sharpe has no ceiling from breadth alone; correlation this low is rare and should be checked in stress." : `Adding sleeves of this quality can never take the book above a Sharpe of ${ceiling.toFixed(3)}. Quality and correlation set the ceiling; count only approaches it.`;
  return out;
}

export default validatorHandler({ endpoint: "validate/breadth", sourcesPaths: ["js/breadth-core.js"], compute });
