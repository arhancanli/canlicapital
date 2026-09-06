#!/usr/bin/env node
// =============================================================================
// check-deposit-claims.mjs
// -----------------------------------------------------------------------------
// The deposit gate: refuse to build a Zenodo (or any other) deposit package
// that asserts a claim this project has already withdrawn, or that states a
// specific sleeve's Sharpe, CAGR, drawdown or equity curve without naming the
// BUNDLE_INCOMPLETE bundle and its blockers next to it.
//
// This mirrors ~/alphaforge/scripts/check_retracted_claims.py on purpose: same
// rules-file format ("::"-separated fields, third field is a retraction
// exemption, optional fourth field is a narrow local non-claim exemption),
// same window sizes, same fail-closed posture. Two differences from that
// script:
//
//   1. It reads deposits/deposit_claims_rules.txt, not docs/retracted_claims.txt.
//      That file is seeded from the engine's blocklist (copied, cited) plus
//      whatever deposit-only rules this project later needs.
//   2. It ALSO runs one structural rule that has no fixed pattern to match: a
//      specific sleeve's Sharpe, CAGR, drawdown or equity curve must be
//      disclosed as belonging to a BUNDLE_INCOMPLETE bundle, with its
//      blockers, in the same neighbourhood as the number. See STRUCTURAL
//      RULE below for exactly what that means and what it does not catch.
//
// WHAT MAKES THIS DIFFERENT FROM A GREP. A withdrawn number must remain
// QUOTABLE inside its own retraction -- scrubbing history would be its own
// dishonesty. So each seeded rule carries an exemption pattern, and a hit is
// only a violation when the surrounding window does NOT explain it.
//
// It fails CLOSED: a missing or unparseable rules file, or a scan target that
// does not exist, is an error, not a pass.
//
//   node scripts/check-deposit-claims.mjs <package-dir> [<package-dir> ...]
// =============================================================================

import { readFileSync, statSync, readdirSync } from "node:fs";
import { resolve, dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const RULES_PATH = resolve(ROOT, "deposits/deposit_claims_rules.txt");

// Bytes either side of a hit that count as "the surrounding explanation" for a
// seeded rule's exemption, and as "the same neighbourhood" for the structural
// rule's sleeve-name and BUNDLE_INCOMPLETE/blocker search. Copied from
// check_retracted_claims.py's WINDOW so the two checks reason about "nearby"
// the same way.
export const WINDOW = 400;

// A narrower window for a rule's optional fourth field: a locally unambiguous
// non-claim use of the same digits (e.g. an unrelated field sharing a value).
// Copied from check_retracted_claims.py's LOCAL_CONTEXT_WINDOW.
export const LOCAL_CONTEXT_WINDOW = 80;

// How far a numeral may sit from a Sharpe/CAGR/drawdown/equity-curve keyword
// and still count as "adjacent" for the structural rule. Wide enough for
// "Sharpe of 0.68", "CAGR: 12%", "Sharpe ratio of 0.68"; narrower than WINDOW
// because "adjacent" should mean genuinely close, not merely in the same file.
export const KEYWORD_NUMERAL_WINDOW = 80;

const SCAN_EXTENSIONS = new Set([".md", ".json", ".txt", ".js", ".html"]);
const SKIP_DIRS = new Set(["node_modules", ".git"]);

// -----------------------------------------------------------------------------
// Seeded rules (same format as ~/alphaforge/docs/retracted_claims.txt)
// -----------------------------------------------------------------------------

export class Rule {
  constructor(seq, pattern, exempt, ignoreLocal, raw) {
    this.seq = seq;
    this.patternSource = pattern;
    this.pattern = new RegExp(pattern, "i");
    this.exempt = exempt.trim() ? new RegExp(exempt, "i") : null;
    this.ignoreLocal = ignoreLocal.trim() ? new RegExp(ignoreLocal, "i") : null;
    this.raw = raw;
  }
}

export function loadRules(path = RULES_PATH) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new Error(`FAIL: rules file missing at ${path} -- refusing to check blind`);
  }
  const rules = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const s = lines[i].trim();
    if (!s || s.startsWith("#")) continue;
    const parts = s.split("::").map((p) => p.trim());
    if (parts.length < 2 || parts.length > 4) {
      throw new Error(`FAIL: ${path}:${i + 1} unparseable: ${JSON.stringify(lines[i])}`);
    }
    const [seq, pattern] = parts;
    const exempt = parts[2] ?? "";
    const ignoreLocal = parts[3] ?? "";
    rules.push(new Rule(seq, pattern, exempt, ignoreLocal, s));
  }
  if (rules.length === 0) {
    throw new Error("FAIL: rules file parsed to zero rules -- that is not a passing state");
  }
  return rules;
}

function walk(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && SCAN_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        out.push(full);
      }
    }
  }
  out.sort();
  return out;
}

function matchesOf(pattern, text) {
  const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
  return [...text.matchAll(re)];
}

export function scanSeededRules(files, rules) {
  const violations = [];
  for (const file of files) {
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const rule of rules) {
      for (const m of matchesOf(rule.pattern, text)) {
        const localStart = Math.max(0, m.index - LOCAL_CONTEXT_WINDOW);
        const localEnd = Math.min(text.length, m.index + m[0].length + LOCAL_CONTEXT_WINDOW);
        const localContext = text.slice(localStart, localEnd);
        const relStart = m.index - localStart;
        const relEnd = relStart + m[0].length;
        if (rule.ignoreLocal) {
          const ignored = matchesOf(rule.ignoreLocal, localContext).some(
            (im) => im.index <= relStart && im.index + im[0].length >= relEnd,
          );
          if (ignored) continue;
        }
        const winStart = Math.max(0, m.index - WINDOW);
        const winEnd = Math.min(text.length, m.index + m[0].length + WINDOW);
        const window = text.slice(winStart, winEnd);
        if (rule.exempt && rule.exempt.test(window)) continue; // quoted inside its own retraction
        const snippetStart = Math.max(0, m.index - 90 - winStart);
        const snippetEnd = Math.min(window.length, m.index + m[0].length + 130 - winStart);
        const snippet = window.slice(snippetStart, snippetEnd).replace(/\s+/g, " ").trim();
        violations.push({ file, rule, snippet, kind: "SEEDED" });
      }
    }
  }
  return violations;
}

// -----------------------------------------------------------------------------
// STRUCTURAL RULE (2026-09-06, from docs/superpowers/plans/2026-09-06-launch-kit-and-deposits.md
// section 1: "no method document may state a specific sleeve's Sharpe, CAGR,
// drawdown or equity curve unless that exact figure is linked, in the same
// paragraph, to its BUNDLE_INCOMPLETE bundle and blocker list").
//
// Mechanism: a numeral adjacent to one of the metric words is a candidate. A
// candidate is only a CLAIM ABOUT A SPECIFIC SLEEVE if a recognised sleeve
// identifier also appears nearby -- the schema, validator core and the two
// engineering notes deposited so far all mention Sharpe/CAGR/drawdown near a
// number (a disclaimer such as "a forward Sharpe ratio. 252 observations are
// required...has 27" is a numeral near "Sharpe", but names no sleeve), and
// flagging those would make the gate impossible for exactly the depositable
// content the plan approved. So: numeral near keyword, AND a sleeve name
// nearby, AND no BUNDLE_INCOMPLETE + blocker disclosure nearby => fail.
//
// DOCUMENTED BLIND SPOT. A sentence that states a real sleeve's Sharpe without
// ever naming which sleeve it is (e.g. "the strategy's Sharpe was 0.68") will
// not trip this rule, because there is nothing here identifying it as "a
// specific sleeve's" claim. That gap is why the seeded rules above still
// exist: a withdrawn figure is blocked by number regardless of whether a
// sleeve name sits next to it. The sleeve list below is derived from
// public/publication/*/ directory names plus the display names used in
// READMEs and prose as of 2026-09-06; a new sleeve added later is invisible
// to this rule until its name is added here.
// -----------------------------------------------------------------------------

export const METRIC_KEYWORD = /\b(sharpe|cagr|drawdown|equity curve)\b/gi;
export const NUMERAL = /[+-]?\d[\d,]*(?:\.\d+)?\s*%?/;

export const SLEEVE_PATTERNS = [
  /\balpha\s?max\b/i,
  /\balpha\s?trend\b/i,
  /\balpha\s?vintage\b/i,
  /\balpha\s?forge\b/i,
  /\bmanaged[-_ ]?futures\b/i,
  /\bcrypto[-_ ]?carry\b/i,
  /\bcrypto[-_ ]?defensive\b/i,
  /\bcrypto[-_ ]?momentum\b/i,
  /\bcrypto[-_ ]?multifactor(?:[-_ ]?engine)?\b/i,
  /\bcrypto[-_ ]?reversal\b/i,
  /\bcrypto[-_ ]?vrp\b/i,
  /\benergy[-_ ]?inventory\b/i,
  /\bequity[-_ ]?insider[-_ ]?activity\b/i,
  /\bequity[-_ ]?low[-_ ]?beta\b/i,
  /\bequity[-_ ]?narrative[-_ ]?change\b/i,
  /\bequity[-_ ]?quality\b/i,
  /\bequity[-_ ]?value[-_ ]?investment\b/i,
  /\bmacro[-_ ]?economic[-_ ]?trend\b/i,
  /\bfunding[-_ ]?carry\b/i,
  /\bequity[-_ ]?momentum\b/i,
  /\bPIT[-_ ]?macro[-_ ]?surprise\b/i,
  /\bmacro[-_ ]?surprise\b/i,
];

const BUNDLE_INCOMPLETE_TOKEN = "BUNDLE_INCOMPLETE";
const BLOCKER_WORD = /blocker/i;

export function scanStructuralRule(files) {
  const violations = [];
  for (const file of files) {
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const km of matchesOf(METRIC_KEYWORD, text)) {
      const nStart = Math.max(0, km.index - KEYWORD_NUMERAL_WINDOW);
      const nEnd = Math.min(text.length, km.index + km[0].length + KEYWORD_NUMERAL_WINDOW);
      const neighbourhood = text.slice(nStart, nEnd);
      if (!NUMERAL.test(neighbourhood)) continue; // no numeral adjacent: not a stated figure

      const wStart = Math.max(0, km.index - WINDOW);
      const wEnd = Math.min(text.length, km.index + km[0].length + WINDOW);
      const wide = text.slice(wStart, wEnd);

      const sleeveMatch = SLEEVE_PATTERNS.find((p) => p.test(wide));
      if (!sleeveMatch) continue; // no specific sleeve named: not "a specific sleeve's" claim

      const disclosed = wide.includes(BUNDLE_INCOMPLETE_TOKEN) && BLOCKER_WORD.test(wide);
      if (disclosed) continue;

      const snippet = wide.replace(/\s+/g, " ").trim().slice(0, 220);
      violations.push({
        file,
        rule: {
          seq: "STRUCTURAL",
          patternSource: "numeral adjacent to Sharpe/CAGR/drawdown/equity curve, naming a sleeve",
        },
        snippet,
        kind: "STRUCTURAL",
      });
    }
  }
  return violations;
}

// -----------------------------------------------------------------------------
// CLI
// -----------------------------------------------------------------------------

export function checkPackage(root, rules) {
  let stat;
  try {
    stat = statSync(root);
  } catch {
    throw new Error(`FAIL: scan target does not exist: ${root}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`FAIL: scan target is not a directory: ${root}`);
  }
  const files = walk(root);
  const seeded = scanSeededRules(files, rules);
  const structural = scanStructuralRule(files);
  return { root, fileCount: files.length, violations: [...seeded, ...structural] };
}

function main() {
  const targets = process.argv.slice(2);
  if (targets.length === 0) {
    console.error("usage: node scripts/check-deposit-claims.mjs <package-dir> [<package-dir> ...]");
    return 1;
  }

  let rules;
  try {
    rules = loadRules();
  } catch (err) {
    console.error(err.message);
    return 1;
  }

  const missing = targets.filter((t) => {
    try {
      return !statSync(t).isDirectory();
    } catch {
      return true;
    }
  });
  if (missing.length) {
    console.error(`FAIL: scan target(s) do not exist or are not directories: ${missing.join(", ")}`);
    return 1;
  }

  console.log(`deposit-claims check: ${rules.length} seeded rule(s) + 1 structural rule, over ${targets.length} package(s)`);

  let anyViolation = false;
  for (const target of targets) {
    const abs = resolve(target);
    const { fileCount, violations } = checkPackage(abs, rules);
    console.log(`\n  ${target} (${fileCount} file(s) scanned)`);
    if (violations.length === 0) {
      console.log("    PASS -- no withdrawn or undisclosed sleeve claim found");
      continue;
    }
    anyViolation = true;
    console.log(`    FAIL -- ${violations.length} violation(s):`);
    for (const v of violations) {
      console.log(`     ${v.file}`);
      console.log(`       rule [${v.rule.seq}]: ${v.rule.patternSource}`);
      console.log(`       context: ...${v.snippet}...`);
    }
  }

  if (anyViolation) {
    console.log("\n  Either remove the claim, or state the retraction/disclosure next to it. Do NOT weaken a rule.");
    return 1;
  }
  console.log("\n  ALL PACKAGES PASS");
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main());
}
