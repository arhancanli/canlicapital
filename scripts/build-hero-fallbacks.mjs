// =============================================================================
// build-hero-fallbacks.mjs
// -----------------------------------------------------------------------------
// The homepage's status strip is the FIRST text in the document, and it shipped
// as four "Loading..." placeholders. JavaScript replaces them a moment later, so
// a person with a browser never notices. A crawler without JS, a reader with
// scripts blocked, and every social-card and search-snippet generator sees
// "Record basis Loading... Broker execution Loading..." as the opening line of
// the site.
//
// This writes the real values into that markup at build time, computed from the
// SAME public-claims contract js/home.js reads, with the SAME formatters, so the
// static text and the hydrated text are identical rather than merely similar.
//
// The site already enforces this discipline for brand facts through data-fact
// spans, whose static text verify-papers checks against config/brand.js. This is
// the same rule applied to the claim contract, and audit-homepage.py asserts the
// two agree in a real browser.
// =============================================================================

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { curveStatistics } from "../js/curve-stats.js";
import { formatCompactCurrency } from "../js/format.js";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLAIMS = resolve(ROOT, "public", "contracts", "public-claims.json");
const CHAIN = resolve(ROOT, "public", "glassbox", "transparency_log.json");
const BROKER = resolve(ROOT, "public", "glassbox", "alpaca_broker_reconciliation.json");
const PAGE = resolve(ROOT, "index.html");
const STATE = resolve(ROOT, "public", "paper-state.json");
const RESEARCH_INDEX = resolve(ROOT, "public", "research-index.json");
const TRIALS = resolve(ROOT, "public", "glassbox", "trial-packets", "index.json");
const COSTS = resolve(ROOT, "public", "glassbox", "cost_model_realism.json");
const CONSOLE_STATS = resolve(ROOT, "public", "glassbox", "live_console_statistics.json");
const ENGINEERING = resolve(ROOT, "public", "glassbox", "engineering_open_source.json");
const EVIDENCE_MAP = resolve(ROOT, "public", "glassbox", "stanford_cs_evidence_map.json");
const FILM_STATE = resolve(ROOT, "public", "system-films", "state.json");

// Mirrors js/home.js exactly. If either side changes, audit-homepage.py catches
// it in a browser, because it compares the static text against the hydrated text.
const integer = new Intl.NumberFormat("en-GB");
const fullDate = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const dateTime = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

const compactCurrency = { format: formatCompactCurrency };

// The same formatter js/home.js uses for the three live-console figures.
const percentSigned = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "always",
});
const percentPlain = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const formatPercent = (value, unsigned = false) =>
  `${(unsigned ? percentPlain : percentSigned).format(value).replace("-", "\u2212")}%`;

const shortDate = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });

export function heroFallbacks(claimsPayload, chainPayload, brokerPayload, extra = {}) {
  const value = (id) => {
    const claim = claimsPayload.claims.find((c) => c.id === id);
    if (!claim) throw new Error(`hero fallbacks: the claim contract has no ${id}`);
    return claim.value;
  };
  const claim = (id) => {
    const found = claimsPayload.claims.find((c) => c.id === id);
    if (!found) throw new Error(`hero fallbacks: the claim contract has no ${id}`);
    return found;
  };
  const percentFromClaim = (id) => {
    const found = claim(id);
    const unit = String(found.unit ?? "");
    if (!/decimal/.test(unit)) {
      throw new Error(
        `hero fallbacks: ${id} declares unit "${unit}", which this renderer does not know how to ` +
        "convert to a percentage. Refusing to guess: guessing wrong here is a factor of a hundred.",
      );
    }
    return `${(Number(found.value) * 100).toFixed(2)}%`;
  };
  const capitalKind = value("forward.capital-kind");
  if (capitalKind !== "PAPER_ONLY") {
    // Not a formatting concern. If the record ever stops being paper-only, the
    // homepage's opening line is a capital claim and must be written by a person.
    throw new Error(
      `hero fallbacks: capital kind is ${capitalKind}, not PAPER_ONLY. The static ` +
        "hero text states the record's basis and may not be generated for a funded record.",
    );
  }
  const firstMark = new Date(`${value("forward.first-mark")}T00:00:00Z`);
  if (Number.isNaN(firstMark.valueOf())) throw new Error("hero fallbacks: unparseable first mark");

  // The signed head moves every publish. A fallback is therefore the head AS OF
  // PUBLICATION, which is exactly what a static page should say: the site
  // redeploys hourly, so it is never far behind, and a real timestamp an hour old
  // is worth incomparably more to a reader than the word "Loading" forever.
  const head = chainPayload?.head ?? chainPayload?.entries?.at(-1);
  const signedAt = head?.generated_at ?? head?.signed_at ?? head?.timestamp ?? head?.date;
  const signedDate = signedAt ? new Date(signedAt) : new Date(Number.NaN);
  const signedText = Number.isNaN(signedDate.valueOf())
    ? "Signed head unavailable"
    : dateTime.format(signedDate);

  // The live console's three figures are computed from the published curve with
  // the SAME function the browser calls, imported rather than reimplemented, so
  // the static text cannot drift from the hydrated text.
  const composite = (extra.state?.algorithms ?? []).find((a) => a.key === "alphac")
    ?? (extra.state?.algorithms ?? [])[0];
  const stats = curveStatistics(composite?.live_curve);
  const curve = composite?.live_curve ?? [];
  const curveDate = (point) => {
    const parsed = new Date(`${point?.date ?? point?.as_of ?? ""}T00:00:00Z`);
    return Number.isNaN(parsed.valueOf()) ? null : shortDate.format(parsed);
  };

  return {
    "hero-record-basis": "Observed paper",
    "hero-broker-execution":
      `${integer.format(Number(value("broker.reconciled-alpaca-sleeves")))} Alpaca paper sleeves`,
    "hero-paper-since": `Since ${fullDate.format(firstMark)}`,
    "hero-grade": `Self-grade ${value("validation.internal-grade")}`,
    // The rest of the page carried the same placeholders below the fold. Same
    // rule, same source: whatever JavaScript is about to render, rendered here.
    "console-book":
      `${integer.format(Number(value("broker.open-positions")))} positions` +
      ` \u00b7 ${integer.format(Number(value("broker.open-orders")))} orders`,
    "evidence-status": value("broker.reconciliation-passes") === true ? "Broker pass" : "Broker check open",
    "console-broker": value("broker.reconciliation-passes") === true
      ? `${integer.format(Number(value("broker.reconciled-alpaca-sleeves")))} dedicated accounts \u00b7 PASS`
      : "Reconciliation check open",
    // Everything below shipped as "Pending" -- twenty-four times -- which is what
    // a crawler and every language model read as the homepage's evidence table.
    // A browser never showed it, so nothing looked wrong to a person.
    ...(stats ? {
      "metric-live-return": formatPercent(stats.returnPercent),
      "metric-live-drawdown": formatPercent(stats.drawdownPercent),
      "metric-live-vol": formatPercent(stats.annualizedVolatilityPercent, true),
    } : {}),
    ...(curveDate(curve[0]) ? { "chart-start": curveDate(curve[0]) } : {}),
    ...(curveDate(curve.at(-1)) ? { "chart-end": curveDate(curve.at(-1)) } : {}),
    "metric-grade": String(value("validation.internal-grade")),
    "evidence-observations": integer.format(Number(value("forward.return-observations"))),
    "evidence-accounts": `${integer.format(Number(value("broker.reconciled-alpaca-sleeves")))} / paper`,
    "evidence-positions":
      `${integer.format(Number(value("broker.open-positions")))} / ${integer.format(Number(value("broker.open-orders")))}`,
    "objective-forward-sharpe": Number(value("objective.forward-sharpe")).toFixed(2),
    "objective-max-drawdown": percentFromClaim("objective.expected-max-drawdown"),
    "model-expected-drawdown": percentFromClaim("model.expected-max-drawdown"),
    "model-p95-drawdown": percentFromClaim("model.p95-max-drawdown"),
    "current-sleeve-count": integer.format(Number(value("sleeves.current"))),
    "core-sleeve-count": integer.format(Number(value("sleeves.current"))),
    "target-sleeve-count": integer.format(Number(value("sleeves.target"))),
    "core-trial-count": integer.format(Number(value("research.identities-observed"))),
    "correlation-reading": Number(value("diversification.average-pairwise-correlation")).toFixed(4)
      .replace(/^(?!-)/, "+").replace("-", "\u2212"),
    ...(extra.research ? {
      "research-documents": integer.format(Number(extra.research.count ?? 0)),
    } : {}),
    ...(typeof extra.killedCount === "number" ? {
      "research-killed": integer.format(extra.killedCount),
      "core-kill-count": integer.format(extra.killedCount),
    } : {}),
    // The entry-point cards. Each figure comes from the artifact behind the link
    // it sits under, so a card cannot advertise a corpus the destination does not
    // have.
    ...(extra.cards ?? {}),
    ...(typeof extra.chainEntries === "number" ? {
      "core-signed-count": integer.format(extra.chainEntries),
    } : {}),
    "evidence-forward-window":
      `${shortDate.format(firstMark)} to ${shortDate.format(new Date(`${value("forward.last-mark")}T00:00:00Z`))}`,
    "evidence-validation-label":
      value("broker.reconciliation-passes") === true
        ? `Broker pass / forward goals open / ${value("validation.internal-grade")}`
        : String(value("forward.validation-status")),
    ...(extra.grossRange ? { "evidence-gross-range": extra.grossRange } : {}),
    ...(extra.chainHead ? { "evidence-chain-head": extra.chainHead } : {}),
    ...(extra.slippageState ? {
      "evidence-slippage-state": extra.slippageState,
      "evidence-slippage-note": extra.slippageState === "Not measurable"
        ? "Equity fills lack a decision-price reference. The measured crypto component predates the current forward window."
        : "Only the components supported by recorded reference prices are treated as observed.",
    } : {}),
    "header-broker-status": value("broker.reconciliation-passes") === true
      ? `${integer.format(Number(value("broker.reconciled-alpaca-sleeves")))} Alpaca paper accounts reconciled`
      : "Broker reconciliation open",
    "evidence-forward-days":
      `${integer.format(Number(value("forward.live-days")))} paper-trading days, ` +
      `${integer.format(Number(value("forward.return-observations")))} return observations.`,
    "evidence-validation-reason": value("broker.reconciliation-passes") === true
      ? "Broker reconciliation passes. The forward record is still too young to establish the performance objectives."
      : "The public contract and broker reconciliation are being checked.",
    ...(extra.netRange ? { "evidence-net-range": extra.netRange } : {}),
    ...(composite ? {
      "chart-title": `${composite.name} paper equity curve`,
      "chart-description":
        `${composite.name} has ${curve.length} published paper equity marks` +
        (curveDate(curve[0]) && curveDate(curve.at(-1))
          ? ` from ${curveDate(curve[0])} through ${curveDate(curve.at(-1))}.` : "."),
    } : {}),
    "evidence-signed-time": signedText,
    "console-time": signedText === "Signed head unavailable" ? signedText : `Signed ${signedText}`,
    // Per-sleeve broker state, from the same reconciliation artifact js/home.js
    // fetches. Spread last so a sleeve appearing or disappearing upstream changes
    // this map rather than being quietly dropped.
    ...Object.fromEntries(
      Object.entries(brokerPayload?.sleeves ?? {}).map(([key, sleeve]) => [
        `sleeve-${key}-state`,
        sleeve.passes
          ? `${compactCurrency.format(Number(sleeve.current_equity))} equity` +
            ` \u00b7 ${integer.format(Number(sleeve.open_position_count || 0))} positions`
          : "Latest reconciliation open",
      ]),
    ),
  };
}

// Every number on the four entry cards, read from the artifact behind that
// card's own link. A missing artifact omits its figures rather than guessing,
// and the placeholder guard then fails the build rather than shipping a stale
// count that a reader would find contradicted one click later.
function cardFigures() {
  const figures = {};
  const state = JSON.parse(readFileSync(STATE, "utf8"));
  const composite = (state.algorithms ?? []).find((a) => a.key === "alphac") ?? (state.algorithms ?? [])[0];
  if (Array.isArray(composite?.live_curve)) {
    figures["card-equity-marks"] = integer.format(composite.live_curve.length);
  }
  const claims = JSON.parse(readFileSync(CLAIMS, "utf8"));
  const claimValue = (id) => claims.claims.find((c) => c.id === id)?.value;
  const accounts = claimValue("broker.reconciled-alpaca-sleeves");
  if (accounts != null) figures["card-broker-accounts"] = integer.format(Number(accounts));

  const research = JSON.parse(readFileSync(RESEARCH_INDEX, "utf8"));
  const documents = research.count ?? (research.papers ?? []).length;
  if (documents) figures["card-research-docs"] = integer.format(Number(documents));
  const killed = (research.papers ?? research.documents ?? [])
    .filter((paper) => /kill/i.test(paper.slug ?? "") || /killed/i.test(paper.verdict ?? "")).length;
  if (killed) figures["card-research-kills"] = integer.format(killed);
  const trials = JSON.parse(readFileSync(TRIALS, "utf8"));
  const trialCount = (trials.packets ?? trials).length;
  if (trialCount) figures["card-trial-ids"] = integer.format(trialCount);

  if (existsSync(ENGINEERING)) {
    const engineering = JSON.parse(readFileSync(ENGINEERING, "utf8"));
    // The manifest publishes these totals itself. Re-deriving them here would put
    // a number on the page that appears in no file, which is exactly what the
    // published-numbers audit exists to catch.
    const tests = Number(engineering.totals?.tests_passing ?? 0);
    const typed = Number(engineering.totals?.typed_source_files ?? 0);
    if (tests) figures["card-tests"] = integer.format(tests);
    if (typed) figures["card-typed-files"] = integer.format(typed);
  }

  if (existsSync(EVIDENCE_MAP)) {
    const external = JSON.parse(readFileSync(EVIDENCE_MAP, "utf8")).contribution_map?.external_validation;
    if (external) {
      figures["card-external-reviews"] = integer.format(Number(external.completed_reviews ?? 0));
      figures["card-replications"] = integer.format(Number(external.independent_replications ?? 0));
    }
  }

  // The authorship and portfolio sections. Same rule: read from the artifact the
  // card's own link leads to.
  const firstMark = new Date(`${claimValue("forward.first-mark")}T00:00:00Z`);
  if (!Number.isNaN(firstMark.valueOf())) figures["trust-record-start"] = fullDate.format(firstMark);
  const current = claimValue("sleeves.current");
  const target = claimValue("sleeves.target");
  if (current != null) figures["trust-sleeves"] = integer.format(Number(current));
  if (target != null) figures["trust-target"] = integer.format(Number(target));
  if (accounts != null) figures["trust-accounts"] = integer.format(Number(accounts));
  // Funded accounts. Asserted against the capital kind rather than typed, so if
  // the record ever stops being paper-only this figure cannot stay at zero.
  figures["trust-funded"] = claimValue("forward.capital-kind") === "PAPER_ONLY" ? "0" : "see status";
  const correlation = claimValue("diversification.average-pairwise-correlation");
  if (correlation != null) {
    const value = Number(correlation).toFixed(4);
    figures["sleeves-correlation"] = (Number(correlation) >= 0 ? "+" : "\u2212") + value.replace("-", "");
  }

  return figures;
}

function main() {
  const claims = JSON.parse(readFileSync(CLAIMS, "utf8"));
  const chain = JSON.parse(readFileSync(CHAIN, "utf8"));
  const broker = JSON.parse(readFileSync(BROKER, "utf8"));
  const state = JSON.parse(readFileSync(STATE, "utf8"));
  const research = JSON.parse(readFileSync(RESEARCH_INDEX, "utf8"));
  const trials = JSON.parse(readFileSync(TRIALS, "utf8"));
  const killedCount = (research.papers ?? research.documents ?? [])
    .filter((paper) => /kill/i.test(paper.slug ?? "") || /killed/i.test(paper.verdict ?? "")).length;
  const chainEntries = chain?.entry_count ?? chain?.entries?.length ?? chain?.count ?? null;

  // Same derivations js/home.js performs, from the same artifacts. Each is
  // guarded: an artifact that does not carry the shape simply omits its cell,
  // and the placeholder guard below then fails the build rather than shipping
  // the word "Pending" to a crawler.
  const sleeves = Object.values(broker?.sleeves ?? {});
  const gross = sleeves.map((sleeve) => Number(sleeve.holdings?.gross_pct)).filter(Number.isFinite);
  const grossRange = gross.length
    ? `${Math.min(...gross).toFixed(1)}% to ${Math.max(...gross).toFixed(1)}% gross`
    : null;
  const head = chain?.head ?? chain?.entries?.at(-1);
  const chainHead = head?.seq != null
    ? `seq ${integer.format(Number(head.seq))} / ${String(head.chain_hash || "hash unavailable").slice(0, 16)}\u2026`
    : null;
  const net = sleeves.map((sleeve) => Number(sleeve.holdings?.net_pct)).filter(Number.isFinite);
  const netRange = net.length
    ? `${formatPercent(Math.min(...net))} to ${formatPercent(Math.max(...net))} net across dedicated broker accounts. Not a composite exposure.`
    : null;
  let slippageState = null;
  try {
    const costs = JSON.parse(readFileSync(COSTS, "utf8"));
    const equity = Object.values(costs?.equity_sleeves ?? {});
    slippageState = equity.length
      ? (equity.every((sleeve) => String(sleeve.slippage_vs_decision_price || "").startsWith("NOT MEASURABLE"))
          ? "Not measurable" : "Partially measured")
      : null;
  } catch { slippageState = null; }
  const fallbacks = heroFallbacks(claims, chain, broker, {
    state,
    research,
    trials,
    killedCount: killedCount || undefined,
    chainEntries: chainEntries ?? undefined,
    grossRange, chainHead, slippageState, netRange,
    cards: cardFigures(),
  });
  let html = readFileSync(PAGE, "utf8");

  for (const [id, text] of Object.entries(fallbacks)) {
    // These cells are strong, small, time, span and dd. Capture the tag NAME and
    // close it with a backreference rather than listing the tags: a cell that
    // changes element then either still matches or fails the build loudly, where
    // a fixed list would quietly stop filling it and restore the placeholder.
    const pattern = new RegExp(`(<([a-z]+)(?:\\s[^>]*?)? id="${id}"[^>]*>)([^<]*)(</\\2>)`);
    const found = html.match(pattern);
    if (!found) throw new Error(`hero fallbacks: no element with id="${id}" on the homepage`);
    // A REPLACER FUNCTION, not a replacement string. Compact currency renders
    // "$1.0M", and in a replacement string "$1" is a backreference: it silently
    // substituted the captured opening tag and produced a broken element that
    // looked merely empty. A function treats the text literally.
    html = html.replace(pattern, (_, open, __, ___, close) => `${open}${text}${close}`);
  }
  writeFileSync(PAGE, html);
  // The broker rows address their cells by attribute rather than by id, so they
  // need their own pass. Same source, same formatters, same rule.
  for (const [key, sleeve] of Object.entries(broker?.sleeves ?? {})) {
    const observedAt = new Date(sleeve.current_equity_as_of);
    const positions = integer.format(Number(sleeve.open_position_count || 0));
    const text = Number.isNaN(observedAt.valueOf())
      ? `${positions} open positions`
      : `${positions} positions / ${dateTime.format(observedAt)}`;
    const pattern = new RegExp(
      `(<div data-broker-row="${key}"[\\s\\S]{0,400}?<span data-broker-observation>)([^<]*)(</span>)`,
    );
    if (!pattern.test(html)) {
      throw new Error(`hero fallbacks: no broker observation cell for sleeve ${key}`);
    }
    // A REPLACER FUNCTION, not a replacement string. Compact currency renders
    // "$1.0M", and in a replacement string "$1" is a backreference: it silently
    // substituted the captured opening tag and produced a broken element that
    // looked merely empty. A function treats the text literally.
    html = html.replace(pattern, (_, open, __, close) => `${open}${text}${close}`);

    // The state cell beside it. js/home.js writes "Pass" or "Open"; the static
    // page said "Checking" forever, which reads to a crawler and to a language
    // model as a system that never finished checking.
    const statePattern = new RegExp(
      `(<div data-broker-row="${key}"[\\s\\S]{0,600}?<em data-broker-state[^>]*>)([^<]*)(</em>)`,
    );
    if (!statePattern.test(html)) {
      throw new Error(`hero fallbacks: no broker state cell for sleeve ${key}`);
    }
    const stateText = sleeve.passes ? "Pass" : "Open";
    html = html.replace(statePattern, (_, open, __, close) => `${open}${stateText}${close}`);
  }

  // The system films' artifact timestamps. These cells are addressed by attribute
  // rather than by id, and they shipped reading "Printed in poster" -- a
  // placeholder standing exactly where the artifact's own time belongs, on the
  // page that argues a figure should always arrive with its provenance.
  if (existsSync(FILM_STATE)) {
    const films = JSON.parse(readFileSync(FILM_STATE, "utf8")).films ?? [];
    if (!films.length) throw new Error("hero fallbacks: system-films state carries no films");
    for (const film of films) {
      const at = new Date(film.timestamp);
      if (Number.isNaN(at.valueOf())) {
        throw new Error(`hero fallbacks: film ${film.id} has an unparseable timestamp`);
      }
      const pattern = new RegExp(
        `(<article[^>]*data-film-card="${film.id}"[\\s\\S]{0,2200}?<time)[^>]*(>)[^<]*(</time>)`,
      );
      if (!pattern.test(html)) throw new Error(`hero fallbacks: no timestamp cell for film ${film.id}`);
      html = html.replace(pattern, (_, open, close, end) =>
        `${open} datetime="${film.timestamp}" data-film-timestamp${close}${dateTime.format(at)}${end}`);
    }
  }
  writeFileSync(PAGE, html);

  const compositeAlgorithm = (state?.algorithms ?? []).find((a) => a.key === "alphac")
    ?? (state?.algorithms ?? [])[0];
  const compositeCurve = compositeAlgorithm?.live_curve ?? [];
  const consoleStats = curveStatistics(compositeCurve);
  if (consoleStats) {
    writeFileSync(CONSOLE_STATS, `${JSON.stringify({
      schema: "canli.live-console-statistics.v1",
      claim_boundary:
        "Three figures computed from the published composite paper curve by js/curve-stats.js, " +
        "the same function the browser runs. Paper marks, not funded returns, and a volatility " +
        "estimated over a window too short to be a forecast.",
      source: "paper-state.json",
      algorithm_key: compositeAlgorithm?.key ?? null,
      curve_points: compositeCurve.length,
      cumulative_return_pct: Number(consoleStats.returnPercent.toFixed(2)),
      max_drawdown_pct: Number(consoleStats.drawdownPercent.toFixed(2)),
      annualized_volatility_pct: Number(consoleStats.annualizedVolatilityPercent.toFixed(2)),
      // The rendered strings, not only the values. A reader checking the page
      // against this file compares what they can see, and "-2.6" in JSON does not
      // obviously answer for "2.60%" on screen: the sign is rendered with a minus
      // sign rather than a hyphen, and the trailing zero is significant to a
      // two-decimal display. Recording both makes the page checkable character by
      // character rather than approximately.
      displayed: {
        cumulative_return: formatPercent(consoleStats.returnPercent),
        max_drawdown: formatPercent(consoleStats.drawdownPercent),
        annualized_volatility: formatPercent(consoleStats.annualizedVolatilityPercent, true),
      },
    }, null, 2)}\n`);
  }

  // A placeholder is a CLASS of text meaning "a value belongs here and has not
  // arrived", not one particular word. The previous version of this check matched
  // capital-L "Loading" and nothing else, so twenty-four "Pending" cells, nine
  // "loading" sentences, five "Checking" states and one "unavailable" passed it
  // for as long as it had been running -- on the page that matters most, in the
  // text only crawlers and language models ever see.
  const PLACEHOLDER = /^(?:loading|pending|checking(?:\s+scope)?|unavailable|tbd|n\/a|\u2014|--)\b|\b(?:loading|unavailable)\b\.?$/i;
  const cells = [...html.matchAll(/<(strong|small|span|time|dd|td)\b[^>]*\bid="([^"]+)"[^>]*>([^<]*)</g)]
    .map(([, , id, text]) => ({ id, text: text.trim() }))
    .filter((cell) => cell.text && PLACEHOLDER.test(cell.text));
  if (cells.length) {
    throw new Error(
      `hero fallbacks: ${cells.length} placeholder cell(s) remain on the homepage, ` +
      `which is exactly what a crawler and a language model will read as the record:\n  ` +
      cells.map((cell) => `#${cell.id} = "${cell.text}"`).join("\n  "),
    );
  }
  const remaining = cells.length;
  console.log(`  homepage fallbacks written: ${Object.keys(fallbacks).length} element(s)`);
  console.log(`  loading placeholders still in index.html: ${remaining}`);
}

main();
