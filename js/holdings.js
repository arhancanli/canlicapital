// =============================================================================
// CANLI CAPITAL / holdings.js
// -----------------------------------------------------------------------------
// The live book, rendered from truth. Reads the same paper-state.json the
// dashboard reads and binds the current holdings into the ledger placeholders
// the page authors: a compact teaser on the landing ("what the book holds right
// now") and the full long/short ledger on the performance page.
//
// This is a genuine transparency surface: a quant book showing its actual
// current positions. The render is restrained by construction. AlphaMax shows
// the real momentum names (top per side) with the long/short counts and the
// gross/net; AlphaForge is shown honestly flat (holding cash, no open
// positions); ALPHAC, the cross-asset book, carries the equity sleeve's book.
//
// It owns NO new design token, color, or keyframe. It composes the existing
// .algos / .roadmap ledger grammar at a new selector, and its row-enter is the
// SAME fade + lift + gentle stagger research.js / open.js use, fired once on
// scroll-in via the shared ScrollTrigger and house ease. Under reduced motion
// (or no ScrollTrigger) every row rests fully visible, never hidden.
//
// DESIGN LAW honored here: ONE signal hue (the long side carries the single
// signal accent; short is the recessed grey voice); no em or en dashes in any
// rendered string (ranges read "0.7 to 1.0", overflow reads "and 68 more"); no
// hype; the deflated forward leads, never the in-sample figure; strip rather
// than add. The ledger is a tickered ledger, not a wall of 177 names: the top
// per side plus a quiet "and N more".
// =============================================================================

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";

// The single source of truth, served from /public. Same artifact the dashboard
// consumes, so the two surfaces can never drift.
const STATE_URL = "/paper-state.json";

// The signed glass-box artifacts, served from /public/glassbox. These are the
// SAME files open.js reads (BASE "/glassbox/"), so the landing's trust teaser and
// the full glass box can never drift. We read a small subset here to surface the
// keystone on the front door: the signed chain, the Bitcoin anchor, the verify
// command, the deflation null, and the founder commitment.
const GLASS_BASE = "/glassbox/";

// ---- small helpers (mirror research.js / open.js) ---------------------------
const $ = (sel, root = document) => root.querySelector(sel);

// DESIGN LAW: zero em/en dashes in rendered output. Holdings strings are tickers
// and numbers, but we normalise on the way in so any future field with a dash
// reads with the property's single-hyphen typography. No figure is altered.
function clean(s) {
  const longDashPattern = new RegExp(`[${String.fromCharCode(8212)}${String.fromCharCode(8211)}]`, "g");
  return String(s).replace(longDashPattern, " - ");
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = clean(String(text));
  return n;
}

async function loadState() {
  const res = await fetch(STATE_URL, { cache: "no-cache" });
  if (!res.ok) throw new Error(`paper-state.json: ${res.status}`);
  return res.json();
}

// Fire `fn` once when `trigger` scrolls into view. If already in view, or under
// reduced motion / no ScrollTrigger, fire immediately. Same contract as
// research.js onReveal so injected rows enter on the shared house grammar.
function onReveal(trigger, fn, start = "top 86%") {
  if (!trigger) return;
  if (reduced || !ScrollTrigger) { fn(); return; }
  const rect = trigger.getBoundingClientRect();
  if (rect.top < window.innerHeight * 0.86 && rect.bottom > 0) { fn(); return; }
  ScrollTrigger.create({ trigger, start, once: true, onEnter: fn });
}

// The shared row-enter: fade + small lift with a gentle stagger, fired once when
// the container scrolls into view. Rows rest visible under reduced motion.
function staggerIn(container, rows) {
  if (!container || !rows || !rows.length) return;
  if (reduced || !ScrollTrigger) return; // rows already at rest, fully visible
  gsap.set(rows, { opacity: 0, y: 12 });
  onReveal(container, () => {
    gsap.to(rows, {
      opacity: 1,
      y: 0,
      duration: 0.7,
      ease: EASE_OUT,
      stagger: { each: 0.04, from: "start" },
    });
  });
}

// weight_pct values arrive already as percent numbers (1.08 means 1.08%), so we
// only format, never scale. Two places use this; keep it one helper.
function pct(v, dp = 2) {
  return Number.isFinite(v) ? `${v.toFixed(dp)}%` : "";
}
// net carries an explicit sign so a positive tilt reads as a tilt, not a bare
// number. gross is always non-negative, no sign.
function signed(v, dp = 2) {
  if (!Number.isFinite(v)) return "";
  const s = v >= 0 ? "+" : "";
  return `${s}${v.toFixed(dp)}%`;
}

// ---- glass-box helpers (mirror open.js exactly) -----------------------------
async function loadGlass(name) {
  const res = await fetch(`${GLASS_BASE}${name}`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${name}: ${res.status}`);
  return res.json();
}

// Truncated chain-hash label, same shape open.js uses for the head.
function shortHash(h) {
  if (typeof h !== "string") return null;
  const body = h.replace(/^sha256:/, "");
  return `${body.slice(0, 12)}...${body.slice(-6)}`;
}

// Set every [data-<ns>="<key>"] hook within an optional root. Omit-on-null:
// a null/empty value leaves the authored "--" / reserved copy intact, never
// invents a figure (the house honesty rule). Returns true iff it wrote anything.
function setGlassHook(ns, key, value, root = document) {
  if (value === null || value === undefined || value === "") return false;
  if (typeof value === "number" && !Number.isFinite(value)) return false;
  const nodes = root.querySelectorAll(`[data-${ns}="${key}"]`);
  let wrote = false;
  nodes.forEach((n) => { n.textContent = clean(String(value)); wrote = true; });
  return wrote;
}

// =============================================================================
// LANDING TEASER  ("what the book holds right now")
// -----------------------------------------------------------------------------
// A single restrained line beneath the algorithms ledger: the equity sleeve's
// counts and gross, the crypto sleeve's honest flat state, and a date. It is a
// taste of the transparency, not the ledger itself; the full book lives on the
// performance page and the teaser links to it. The markup authors an empty
// .algos__book with named hooks; we fill them so no ticker or figure is ever
// hardcoded in the page.
// =============================================================================
function renderTeaser(state) {
  const root = $("#holdingsTeaser");
  if (!root) return;

  const am = (state.holdings && state.holdings.alphamax) || null;
  const af = (state.holdings && state.holdings.alphaforge) || null;

  const equityHook = $("[data-book='equity']", root);
  const cryptoHook = $("[data-book='crypto']", root);
  const asOfHook = $("[data-book='as-of']", root);

  if (equityHook && am) {
    equityHook.textContent = "";
    equityHook.append(
      el("span", "algos__book-name", "AlphaMax"),
      el("span", "algos__book-fig mono-data signal-word", `${am.long_count} long`),
      el("span", "algos__book-sep", "/"),
      el("span", "algos__book-fig mono-data", `${am.short_count} short`),
      el("span", "algos__book-sep", "/"),
      el("span", "algos__book-fig mono-data", `${pct(am.gross_pct, 1)} gross`),
    );
  }

  if (cryptoHook && af) {
    cryptoHook.textContent = "";
    // BOTH states: an open carry book renders the same counts grammar as AlphaMax
    // (long count carries the signal accent); genuinely flat renders the honest
    // cash line. Never render "holding cash" unless flat === true.
    if (af.flat === true) {
      cryptoHook.append(
        el("span", "algos__book-name", "AlphaForge"),
        el("span", "algos__book-flat mono-label", "holding cash, no open positions"),
      );
    } else {
      cryptoHook.append(
        el("span", "algos__book-name", "AlphaForge"),
        el("span", "algos__book-fig mono-data signal-word", `${af.long_count} long`),
        el("span", "algos__book-sep", "/"),
        el("span", "algos__book-fig mono-data", `${af.short_count} short`),
      );
    }
  }

  if (asOfHook && am && am.as_of) {
    asOfHook.textContent = `as of ${am.as_of}`;
  }

  // bring the teaser line up on the same reveal grammar as the rows around it
  staggerIn(root, Array.from(root.querySelectorAll(".algos__book-line")));
}

// =============================================================================
// THE GLASS BOX  (landing trust chapter + hero proof strip + live proof readout)
// -----------------------------------------------------------------------------
// Surfaces the category-of-one trust machinery on the front door, reading the
// SAME signed artifacts open.js reads so the two surfaces can never drift. Three
// small binds, all omit-on-null:
//   1. The hero proof strip ([data-hero-proof]): N days signed, N strategies
//      killed, the truncated chain head. (transparency_log + kill_log)
//   2. The proof section's live readout ([data-live]): the proud true fact that
//      the paper record is now open and accruing. (track_record)
//   3. The glass-box chapter ([data-glass]): signed chain, Bitcoin anchor, verify
//      command + public key, founder amount, deflation null.
//      (transparency_log + ots/anchors + founder_commitment + deflation)
// No figure is hardcoded; a fetch failure leaves the authored reserved copy.
// =============================================================================

// Show a hero-proof item (and the separators around it) only when its value is
// real. The strip ships every item + separator [hidden]; we reveal exactly what
// we can fill, then re-show only the separators that sit BETWEEN two visible
// items, so the row never opens or closes with a stray dot.
function fillHeroProof(transparency, killLog) {
  const strip = document.getElementById("heroProof");
  if (!strip) return;

  const setItem = (key, text) => {
    const node = strip.querySelector(`[data-hero-proof="${key}"]`);
    if (node && text) { node.textContent = clean(text); node.hidden = false; }
  };

  // signed entries (entry_count is ENTRIES, not days: many entries share a date,
  // and the record's day count is a different number). Never label it "days".
  const entries = transparency && Number.isFinite(transparency.entry_count)
    ? transparency.entry_count : null;
  if (entries) setItem("days", `${entries} entries signed & chained`);

  // strategies killed (gauntlet kills + screen kills), stated as the real total
  if (killLog) {
    const k = Number.isFinite(killLog.killed_count) ? killLog.killed_count : 0;
    const s = Number.isFinite(killLog.screen_killed_count) ? killLog.screen_killed_count : 0;
    const total = k + s;
    if (total > 0) setItem("killed", `${total} strategies killed`);
  }

  const head = transparency && transparency.head && transparency.head.chain_hash;
  if (head) setItem("chain", `chain head ${shortHash(head)}`);

  // re-show only the separators that sit between two visible items
  reconcileSeparators(strip, "[data-hero-proof]", "[data-hero-proof-sep]");
}

// Generic: given a row of items and separators in document order, reveal each
// separator iff it has a visible item before AND after it. Keeps the divider
// dots honest when any item omits on null.
function reconcileSeparators(root, itemSel, sepSel) {
  const children = Array.from(root.children);
  const isItem = (n) => n.matches(itemSel);
  const isSep = (n) => n.matches(sepSel);
  children.forEach((node, i) => {
    if (!isSep(node)) return;
    const before = children.slice(0, i).some((n) => isItem(n) && !n.hidden);
    const after = children.slice(i + 1).some((n) => isItem(n) && !n.hidden);
    node.hidden = !(before && after);
  });
}

// The proof section's live readout: the proud, true fact stated first. Bound from
// track_record.json so it can never drift from the signed chain. Reveals the
// panel only when the record is genuinely live/accruing.
function fillProofLive(track) {
  const panel = document.getElementById("proofLive");
  if (!panel || !track) return;

  let any = false;
  // a human label for the live status. Both LIVE and ACCRUING mean the same
  // thing to a reader ("Live on paper, accruing"); only an unknown enum falls
  // through to a title-cased raw value (never a bare SCREAMING enum).
  const status = (track.live_status || "").toUpperCase();
  if (status === "ACCRUING" || status === "LIVE") {
    any = setGlassHook("live", "status", "Live on paper, accruing", panel) || any;
  } else if (track.live_status) {
    const s = String(track.live_status);
    any = setGlassHook("live", "status", s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(), panel) || any;
  }
  any = setGlassHook("live", "goLive", track.go_live_date, panel) || any;

  const days = track.live_days_accrued;
  if (Number.isFinite(days)) {
    const label = days === 1 ? "Day 01" : `Day ${String(days).padStart(2, "0")}`;
    any = setGlassHook("live", "days", label, panel) || any;
  }

  // Only surface the panel if we have a genuine live status to show.
  if (any && status) panel.hidden = false;
}

// The glass-box chapter: the signed chain, Bitcoin anchor, verify command + key,
// founder amount, deflation null. Mirrors open.js's bindTransparency exactly.
function fillGlass(transparency, anchors, founder, deflation) {
  // signed chain: entry_count + truncated head (head carries the one signal accent)
  if (transparency) {
    setGlassHook("glass", "entries", transparency.entry_count);
    const head = transparency.head && transparency.head.chain_hash;
    if (head) setGlassHook("glass", "chainHead", shortHash(head));
    if (transparency.public_key_ed25519_hex) {
      const k = transparency.public_key_ed25519_hex;
      setGlassHook("glass", "pubKey", k.length > 20 ? `${k.slice(0, 16)}…` : k);
    }
    setGlassHook("glass", "verifyCmd", transparency.verify);
  }

  // Bitcoin anchor: same phrasing open.js uses ("N heads · Bitcoin block X" or
  // "pending Bitcoin"). Says only WHEN the head existed, never whether numbers
  // are good.
  if (anchors && anchors.head_anchor) {
    const a = anchors.head_anchor;
    const n = anchors.anchor_count;
    const where = a.status === "bitcoin"
      ? `Bitcoin block ${a.bitcoin_block_height}`
      : "pending Bitcoin (calendar-attested)";
    setGlassHook("glass", "anchor", `${n} head${n === 1 ? "" : "s"} · ${where}`);
  }

  // founder amount, plainly (USD 1,000), from the signed commitment artifact
  if (founder && Number.isFinite(founder.amount_usd)) {
    setGlassHook("glass", "founderAmount", `USD ${founder.amount_usd.toLocaleString("en-US")}`);
  }

  // the deflation null: the honest C+ figure, the flex. Use the best_config's
  // deflated shared-SR DSR (the published 0.21) if present.
  if (deflation && deflation.best_config && Number.isFinite(deflation.best_config.dsr_shared)) {
    setGlassHook("glass", "nullSharpe", deflation.best_config.dsr_shared.toFixed(2));
  }
}

// Load the glass-box subset and bind all three surfaces. A failure here must
// never strand the page: each authored placeholder keeps its reserved copy.
function fillBrokerProof(reconciliation) {
  if (!reconciliation || !reconciliation.summary) return;
  const summary = reconciliation.summary;
  setGlassHook("broker", "status", summary.status);
  if (Number.isFinite(summary.reconciled_alpaca_sleeves)) {
    const distinct = summary.unique_dedicated_accounts ? "distinct" : "not distinct";
    setGlassHook(
      "broker",
      "accounts",
      `${summary.reconciled_alpaca_sleeves}/3 dedicated paper accounts, ${distinct}`,
    );
  }
  if (Number.isFinite(summary.open_positions)) {
    setGlassHook("broker", "positions", `${summary.open_positions} open positions`);
  }
  if (reconciliation.generated_at) {
    setGlassHook("broker", "as-of", `as of ${reconciliation.generated_at}`);
  }
}

async function bootGlass() {
  const hasGlass = !!document.querySelector('[data-glass]')
    || !!document.querySelector('[data-broker]')
    || !!document.getElementById("heroProof")
    || !!document.getElementById("proofLive");
  if (!hasGlass) return;

  // Load each artifact independently so one missing file never blocks the others.
  const safe = (p) => p.then((v) => v).catch(() => null);
  const [transparency, anchors, founder, deflation, killLog, track, brokerRecon] =
    await Promise.all([
      safe(loadGlass("transparency_log.json")),
      safe(loadGlass("ots/anchors.json")),
      safe(loadGlass("founder_commitment.json")),
      safe(loadGlass("deflation.json")),
      safe(loadGlass("kill_log.json")),
      safe(loadGlass("track_record.json")),
      safe(loadGlass("alpaca_broker_reconciliation.json")),
    ]);

  fillHeroProof(transparency, killLog);
  fillProofLive(track);
  fillGlass(transparency, anchors, founder, deflation);
  fillBrokerProof(brokerRecon);
}

// =============================================================================
// PERFORMANCE LEDGER  (the full current book, by algorithm)
// -----------------------------------------------------------------------------
// One block per published algorithm, each composing the existing ledger grammar:
//   AlphaMax  : a summary row (long / short / gross / net) then a two-column
//               long / short ticker ledger (top per side) with a quiet
//               "and N more" overflow line. The long side carries the one
//               signal accent; the short side is the recessed grey voice.
//   AlphaForge: the honest flat state. Holding cash, deciding HOLD on the
//               funding carry. Flat is the truthful state, not missing data, so
//               it is stated plainly, never dressed as a deficiency.
//   ALPHAC    : the cross-asset book aggregates its current constituent sleeves;
//               the artifact, rather than this renderer, owns membership and weights.
// =============================================================================
function holdingRow(h) {
  const row = el("div", "book-pos");
  row.append(
    el("span", "book-pos__ticker mono-data", h.ticker),
    el("span", "book-pos__weight mono-data", pct(h.weight_pct)),
  );
  return row;
}

function holdingsColumn(side, list, totalCount, shown) {
  // side: "long" | "short". The column header carries the side and its count;
  // the long header is the one signal accent, short stays recessed.
  const col = el("div", `book-col book-col--${side}`);

  const head = el("div", "book-col__head");
  const label = el("span", `book-col__side mono-label`, side === "long" ? "Long" : "Short");
  label.setAttribute("data-side", side);
  head.append(label, el("span", "book-col__count mono-label", String(totalCount)));
  col.appendChild(head);

  const rows = [];
  list.slice(0, shown).forEach((h) => {
    const r = holdingRow(h);
    col.appendChild(r);
    rows.push(r);
  });

  // the quiet overflow: never the full 177, only "and N more"
  const more = totalCount - Math.min(shown, list.length);
  if (more > 0) {
    const moreRow = el("div", "book-pos book-pos--more mono-label", `and ${more} more`);
    col.appendChild(moreRow);
    rows.push(moreRow);
  }

  return { col, rows };
}

function renderBrokerBook(state, rootSelector, holdingsKey) {
  const root = $(rootSelector);
  if (!root) return;
  const held = (state.holdings && state.holdings[holdingsKey]) || null;
  if (!held) { root.remove(); return; }

  // summary row: long / short / gross / net, the figures the eye should meet
  // first. net shows its sign; gross does not.
  const summary = $("[data-book='summary']", root);
  if (summary) {
    summary.textContent = "";
    const add = (label, val, accent) => {
      const cell = el("span", "book-stat");
      cell.append(
        el("span", "book-stat__k mono-label", label),
        el("span", `book-stat__v mono-data${accent ? " signal-word" : ""}`, val),
      );
      summary.appendChild(cell);
    };
    add("Long", String(held.long_count), true);
    add("Short", String(held.short_count), false);
    if (Number.isFinite(held.gross_pct)) add("Gross", pct(held.gross_pct, 1), false);
    if (Number.isFinite(held.net_pct)) add("Net", signed(held.net_pct), false);
  }

  // the two-column ticker ledger
  const grid = $("[data-book='ledger']", root);
  if (grid) {
    grid.textContent = "";
    const longCol = holdingsColumn("long", held.long || [], held.long_count, 15);
    const shortCol = holdingsColumn("short", held.short || [], held.short_count, 15);
    grid.append(longCol.col, shortCol.col);
    staggerIn(grid, [...longCol.rows, ...shortCol.rows]);
  }
}

function renderAlphaForge(state) {
  const root = $("#bookAlphaforge");
  if (!root) return;
  const af = (state.holdings && state.holdings.alphaforge) || null;
  // State-DRIVEN, both ways: assert "holding cash" ONLY when genuinely flat;
  // otherwise state the real live carry book (counts + as-of). Never let the
  // authored markup's default assert a book state the data contradicts.
  const stateHook = $("[data-book='state']", root);
  if (stateHook && af) {
    stateHook.textContent = af.flat === true
      ? "Holding cash, no open positions"
      : `Trading, ${af.long_count} long / ${af.short_count} short`
        + (af.as_of ? ` as of ${af.as_of}` : "");
  }
}

function renderAlphac(state) {
  // State the artifact-owned composition and disclosed strategic overlay.
  const root = $("#bookAlphac");
  if (!root) return;
  const book = state.book || null;
  const countHook = $("[data-book='carry']", root);
  if (countHook) {
    const sleeves = (book && Array.isArray(book.sleeves)) ? book.sleeves : [];
    const comp = sleeves.length
      ? sleeves.map((s) => `${s.name} ${Math.round((s.weight || 0) * 100)}%`).join(" / ")
      : "Sleeve composition unavailable";
    const tilt = book && book.strategic_tilt && Number.isFinite(book.strategic_tilt.pct)
      ? `, plus a disclosed +${Math.round(book.strategic_tilt.pct * 100)}% strategic long overlay`
      : "";
    countHook.textContent = comp + tilt;
  }
  if (state.metrics) {
    setGlassHook("book", "forward-sharpe", state.metrics.honest_forward_sharpe);
    if (Number.isFinite(state.metrics.in_sample_sharpe)) {
      setGlassHook("book", "in-sample-sharpe", state.metrics.in_sample_sharpe.toFixed(2));
    }
  }
}

// =============================================================================
// BOOT
// =============================================================================
async function boot() {
  // The glass-box trust surfaces (hero proof strip, proof live readout, the
  // "Proven in the open" chapter) read the signed glassbox artifacts and are
  // independent of paper-state.json, so we fire them regardless of whether this
  // page authored a holdings surface. Fire-and-forget: failures are swallowed
  // inside bootGlass so they can never strand the page.
  bootGlass();

  // nothing else to do if this page authored no holdings surface
  const hasTeaser = !!$("#holdingsTeaser");
  const hasLedger = !!$("#bookAlphamax") || !!$("#bookAlphatrend")
    || !!$("#bookAlphavintage") || !!$("#bookAlphaforge") || !!$("#bookAlphac");
  if (!hasTeaser && !hasLedger) return;

  let state;
  try {
    state = await loadState();
  } catch (err) {
    // a fetch failure must never strand the page. The placeholders keep their
    // authored resting copy; we simply do not enrich them.
    console.error("Canli Capital holdings: could not load paper-state.json.", err);
    return;
  }

  // "Live since" date: data-driven from the published go_live_date so it can never drift out of
  // sync with the signed transparency chain (the v1->v2 re-baseline updates this automatically).
  if (state.go_live_date) {
    document
      .querySelectorAll('[data-hook="live-since-date"]')
      .forEach((node) => (node.textContent = state.go_live_date));
  }

  if (hasTeaser) renderTeaser(state);
  if (hasLedger) {
    renderBrokerBook(state, "#bookAlphamax", "alphamax");
    renderBrokerBook(state, "#bookAlphatrend", "managed_futures");
    renderBrokerBook(state, "#bookAlphavintage", "alphavintage");
    renderAlphaForge(state);
    renderAlphac(state);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
