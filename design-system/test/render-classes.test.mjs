// Guard test 1: render every exported component with realistic props and assert every class
// name it emits exists as a selector somewhere in the flattened dist/styles.css. This is what
// catches a wrapper drifting from the real stylesheet (a renamed class on the site, a typo in
// a component, an invented class that was never in css/*.css).
import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as DS from "../dist/index.js";
import { loadStylesheetClasses, classNamesFromHtml } from "./lib/css-classes.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const stylesheetClasses = loadStylesheetClasses(resolve(here, "../dist/styles.css"));

function assertKnownClasses(name, html) {
  const used = classNamesFromHtml(html);
  const unknown = [...used].filter((cls) => !stylesheetClasses.has(cls));
  assert.deepEqual(unknown, [], `${name} emitted class(es) not found in dist/styles.css: ${unknown.join(", ")}`);
}

const h = React.createElement;

const cases = [
  ["ShellHeader (default)", h(DS.ShellHeader)],
  ["ShellHeader (active + dynamicStatus)", h(DS.ShellHeader, { active: "research", dynamicStatus: true })],
  ["ShellFooter", h(DS.ShellFooter)],
  ["Section", h(DS.Section, { ink: false }, "Body copy")],
  ["Section (ink)", h(DS.Section, { ink: true }, "Body copy")],
  ["Eyebrow", h(DS.Eyebrow, { index: "01 /" }, "Factor tests")],
  ["DisplayHeading xl", h(DS.DisplayHeading, { size: "xl", as: "h1" }, "How we got here.")],
  ["DisplayHeading l", h(DS.DisplayHeading, { size: "l" }, "What survived")],
  ["DisplayHeading m", h(DS.DisplayHeading, { size: "m" }, "Most ideas die.")],
  ["BodyText body", h(DS.BodyText, { size: "body" }, "Long-form prose.")],
  ["BodyText body-l", h(DS.BodyText, { size: "body-l" }, "Section lead copy.")],
  ["MonoLabel", h(DS.MonoLabel, null, "Public paper record")],
  ["MonoLabel (time)", h(DS.MonoLabel, { as: "time", dateTime: "2026-09-06" }, "2026-09-06")],
  ["MonoData", h(DS.MonoData, null, "24.7M+")],
  [
    "Hero",
    h(DS.Hero, {
      eyebrowIndex: "00 /",
      eyebrowLabel: "The research",
      statusLabel: "The research",
      statusValue: "Every test, including the kills",
      statusAriaLabel: "Research status",
      heading: "How we got here.",
      headingId: "research-hero-word",
      sub: "Every factor we tested, with its real net-of-cost Sharpe.",
      scrollHref: "#factors",
      scrollAriaLabel: "Scroll to the factor tests",
    }),
  ],
  [
    "StatBand",
    h(DS.StatBand, {
      ariaLabel: "Verified system facts",
      items: [
        { value: "0", label: "No look-ahead", zero: true },
        { value: "1", label: "Cost authority, research and paper" },
        { value: "2020", label: "Crypto history starts" },
      ],
    }),
  ],
  [
    "CorrectionsList",
    h(DS.CorrectionsList, {
      items: [{ dateTime: "2026-09-06", dateLabel: "CORRECTION 2026-09-06", text: ": the entry understated the code." }],
    }),
  ],
  [
    "Ledger",
    h(DS.Ledger, {
      rows: [
        { state: "proven", mark: "Proven", what: "The engineering and the integrity.", detail: "Leak-proof, point-in-time data." },
        { state: "pending", mark: "Not yet", what: "The standalone crypto edge." },
      ],
    }),
  ],
  [
    "EstateGrid",
    h(DS.EstateGrid, {
      cells: [
        { label: "Daily bars, equity lake", value: "24.7M+" },
        { label: "US stocks, survivorship-free", value: "6,835", since: "1997 to 2026" },
      ],
      line: "Running 24/7 on paper across the live and delisted book.",
    }),
  ],
  ["ToolsCard", h(DS.ToolsCard, { slug: "deflated-sharpe", title: "Deflated Sharpe calculator", house: "ALPHAC", sentence: "How much Sharpe survives the search." })],
  [
    "DsrHero",
    h(
      DS.DsrHero,
      {
        kicker: ["Open research instrument", "ALPHAC", "Contract v1"],
        heading: "How many trials did you run?",
        headingId: "dsr-title",
        lead: "One result. The whole search behind it.",
        actions: h(DS.DsrButton, { href: "#calculator", primary: true }, "Open the pressure chamber"),
      },
    ),
  ],
  ["DsrButton", h(DS.DsrButton, { href: "#calculator", primary: true }, "Open the pressure chamber")],
  ["DsrButton (external)", h(DS.DsrButton, { href: "https://github.com/arhancanli/alphac", external: true }, "Inspect the Python source")],
  ["DsrSectionHead", h(DS.DsrSectionHead, { label: "Selection pressure chamber", heading: "How many trials did you run?", headingId: "calculator-title", lead: "One result." })],
  ["DsrBoundary", h(DS.DsrBoundary, { label: "Illustrative calculation" }, "The observed Sharpe is illustrative until you replace it.")],
  ["DevButton (link)", h(DS.DevButton, { href: "/api/v1", primary: true }, "Discovery document")],
  ["DevButton (button)", h(DS.DevButton, null, "Get a free key")],
  ["DevBoundary", h(DS.DevBoundary, { label: "Status." }, "Proposed, version zero, published for criticism.")],
  ["DeveloperKeyBox", h(DS.DeveloperKeyBox, { apiKey: "sk_live_example", remaining: 4 })],
  ["ReceiptBadge", h(DS.ReceiptBadge, { receiptId: "abc123" })],
];

for (const [name, element] of cases) {
  test(`${name}: every emitted class exists in dist/styles.css`, () => {
    const html = renderToStaticMarkup(element);
    assertKnownClasses(name, html);
  });
}

test("stylesheet actually has classes to check against (sanity)", () => {
  assert.ok(stylesheetClasses.size > 50, "dist/styles.css yielded suspiciously few classes; is it built?");
});
