// audit_signals: sentences, auditor's reports and 8-Ks read by hand from real filings, then real companies and
// windows captured by scripts/capture-audit-signals-fixtures.mjs and replayed with no network.
import assert from "node:assert/strict";
import test from "node:test";

import { auditSignals, criticalAuditMatters, doubtIn, goingConcernIn } from "../src/audit-signals.mjs";
import { htmlToText } from "../src/html.mjs";
import { createSession, getText } from "../src/sources.mjs";
import { NOW, replayFetch } from "./replay.mjs";

const session = () => createSession({ fetchImpl: replayFetch().fetchImpl, now: () => NOW, env: {}, sleep: async () => {} });
const rowsOf = (t) => t.rows.map((r) => Object.fromEntries(t.columns.map((c, i) => [c, r[i]])));

test("a sentence raises the doubt only when it says so, of this company, without a may, an if or an alleviation", () => {
  // LiveWire Group's 10-Q of 2026-11-04 and Star Gold's 10-K of 2026-07-22.
  assert.equal(doubtIn("These conditions and events raise substantial doubt about the Company's ability to continue as a going concern."), "raised");
  assert.equal(doubtIn("Accordingly, management has determined that the substantial doubt about the Company's ability to continue as a going concern previously disclosed has been alleviated."), "alleviated");
  // GoPro's amended 10-Q: not alleviated is raised. Thunder Power's 10-Q: an alleviation hoped for is not one.
  assert.equal(doubtIn("As a result, substantial doubt about the Company's ability to continue as a going concern within one year after the date these condensed consolidated financial statements are issued has not been alleviated."), "raised");
  assert.equal(doubtIn("However, there can be no assurance that these plans will be successfully implemented or will be sufficient to alleviate the substantial doubt regarding the Company's ability to continue as a going concern, including the Company's ability to realize value from the forward purchase arrangement."), "mention");
  // KB Global's 10-Q of 2026-08-07 says its plans alleviate the doubt in a sentence that does not repeat "going concern".
  assert.equal(doubtIn("Management has evaluated these conditions and concluded that its plans, as described below, alleviate the substantial doubt: (i) Director Ms. Guo Li has continued to provide financial support to the Company."), "alleviated");
  assert.equal(doubtIn("Management has concluded that there is no substantial doubt about the Company's ability to continue as a going concern for at least twelve months from the date these financial statements are issued."), "no_doubt");
  // Harley-Davidson's 10-Q of 2026-11-04 reports its subsidiary's doubt, not its own.
  const hog = "In the fourth quarter of 2026, LiveWire Group, Inc. disclosed conditions and events that raise substantial doubt about its ability to continue as a going concern and withdrew its operating income/(loss) guidance.";
  assert.equal(doubtIn(hog, "HARLEY-DAVIDSON, INC."), "mention");
  assert.equal(doubtIn(hog, "LiveWire Group, Inc."), "raised");
});

test("critical audit matters as the auditor's report titles them, with the notes they refer to", () => {
  // Lines of Apple's 10-K of 2026-11-03 (Ernst & Young), Microsoft's of 2026-07-29 (Deloitte) and Mannatech's of
  // 2026-04-15 (BDO), as the report sets them, each long line cut after its first sentence.
  const apple = criticalAuditMatters(["Critical Audit Matter", "The critical audit matter communicated below is a matter arising from the current period audit of the financial statements that was communicated or required to be communicated to the audit committee and that: (1) relates to accounts or disclosures that are material to the financial statements and (2) involved our especially challenging, subjective, or complex judgments.", "Uncertain Tax Positions", "Description of the Matter", "As discussed in Note 8 to the financial statements, the Company is subject to income taxes in the U.S. and numerous foreign jurisdictions.", "Apple Inc. | 2026 Form 10-K | 54", "How We Addressed the", "Matter in Our Audit", "/s/ Ernst & Young LLP", "We have served as the Company's auditor since 2009."].join("\n"));
  assert.deepEqual(apple, { none: false, matters: [{ matter: "Uncertain Tax Positions", notes: "8", quote: "As discussed in Note 8 to the financial statements, the Company is subject to income taxes in the U.S. and numerous foreign jurisdictions." }], auditor: "Ernst & Young LLP", since: "2009" });
  const msft = criticalAuditMatters(["The critical audit matters communicated below are matters arising from the current-period audit of the financial statements that were communicated or required to be communicated to the audit committee and that (1) relate to accounts or disclosures that are material to the financial statements and (2) involved our especially challenging, subjective, or complex judgments.", "PART II", "Item 8", "Revenue Recognition - Refer to Note 1 to the financial statements", "Critical Audit Matter Description", "The Company recognizes revenue upon transfer of control of promised products or services to customers in an amount that reflects the consideration the Company expects to receive in exchange for those products or services.", "/s/ DELOITTE & TOUCHE LLP", "Seattle, Washington"].join("\n"));
  assert.deepEqual(msft.matters.map((m) => [m.matter, m.notes]), [["Revenue Recognition", "1"]]);
  assert.equal(msft.auditor, "DELOITTE & TOUCHE LLP");
  const mtex = criticalAuditMatters(["The critical audit matter communicated below is a matter arising from the current period audit of the consolidated financial statements that was communicated or required to be communicated to the audit committee and that: (1) relates to accounts or disclosures that are material to the consolidated financial statements and (2) involved our especially challenging, subjective, or complex judgments.", "Evaluation of the Company's Determination of Transfer Pricing Policies", "As described in Note 1 to the consolidated financial statements, the Company is subject to transfer pricing tax regulations designed to ensure the appropriate allocation of income and expenses between the U.S. and foreign entities and that the Company is taxed accordingly.", "F-2", "We identified the Company's determination of transfer pricing policies as a critical audit matter.", "The primary procedures we performed to address this critical audit matter included:", "/s/ BDO USA, P.C.", "We have served as the Company's auditor since 2007."].join("\n"));
  assert.deepEqual(mtex.matters, [{ matter: "Evaluation of the Company's Determination of Transfer Pricing Policies", notes: "1", quote: "We identified the Company's determination of transfer pricing policies as a critical audit matter." }]);
  assert.deepEqual([mtex.auditor, mtex.since], ["BDO USA, P.C.", "2007"]);
  assert.equal(criticalAuditMatters("Critical audit matters are matters arising from the current period audit of the financial statements. We determined that there are no critical audit matters.\n/s/ Example CPAs LLP").none, true);
  assert.equal(criticalAuditMatters("Opinion on the Financial Statements\nWe have audited the balance sheets."), null);
});

test("LiveWire Group first raised the doubt in its 10-Q of 2026-11-04; the two before it do not name it", async () => {
  const r = await auditSignals(session(), { company: "1898795", signal: "going_concern", limit: 3 });
  assert.deepEqual(r.company, { cik: 1898795, name: "LiveWire Group, Inc.", ticker: "LVWR" });
  const rows = rowsOf(r.going_concern);
  assert.deepEqual(rows.map((x) => [x.filed, x.form, x.status, x.change]), [["2026-11-04", "10-Q", "doubt raised", "first raised"], ["2026-08-05", "10-Q", "not mentioned", null], ["2026-05-06", "10-Q", "not mentioned", null]]);
  assert.equal(rows[0].quote, "These conditions and events raise substantial doubt about the Company's ability to continue as a going concern.");
  assert.equal(rows[0].url, "https://www.sec.gov/Archives/edgar/data/1898795/000189879526000116/lvwr-20260930.htm");
  assert.deepEqual(r.counts, { reports_read: 3, reports_with_doubt: 1 });
  assert.match(r.reading, /latest report \(10-Q filed 2026-11-04\) says there is substantial doubt .* first raised in the 10-Q filed 2026-11-04/);
  assert.equal(typeof r.source, "string");
  assert.ok(r.sources.includes(rows[0].url));
  assert.ok(r.limits.some((l) => /not investment advice/i.test(l)) && r.limits.some((l) => /not a prediction/i.test(l)) && r.limits.some((l) => /unusual wording/i.test(l)));
});

test("Star Gold's doubt, raised in its 10-Q of 2026-03-16, was lifted in its 10-K of 2026-07-22", async () => {
  const r = await auditSignals(session(), { company: "1401835", signal: "going_concern", limit: 3 });
  const rows = rowsOf(r.going_concern);
  assert.deepEqual(rows.map((x) => [x.filed, x.form, x.status, x.change]), [["2026-09-14", "10-Q", "not mentioned", null], ["2026-07-22", "10-K", "doubt alleviated", "lifted"], ["2026-03-16", "10-Q", "doubt raised", "raised (earlier reports not read)"]]);
  assert.equal(rows[1].quote, "Accordingly, management has determined that the substantial doubt about the Company's ability to continue as a going concern previously disclosed has been alleviated.");
  assert.match(rows[2].quote, /raises substantial doubt about the Company's ability to continue as a going concern\.$/);
  assert.match(r.reading, /lifted in its 10-K filed 2026-07-22, which says it was alleviated/);
});

test("Mannatech dismissed BDO on 2026-10-15 and engaged CBIZ; ESG's auditor TQ resigned on 2026-10-26", async () => {
  const m = await auditSignals(session(), { company: "1056358", signal: "auditor_change", limit: 2 });
  assert.equal(m.counts.auditor_change_filings, 6);
  const [amended, first] = rowsOf(m.auditor_changes);
  assert.deepEqual([first.filed, first.event_date, first.form, first.former_auditor, first.how, first.new_auditor, first.disagreements, first.reportable_events, first.prior_going_concern_paragraph], ["2026-10-21", "2026-10-15", "8-K", "BDO USA, P.C.", "dismissed", "CBIZ CPAs P.C.", "none", "none", "stated"]);
  assert.match(first.quote, /approved the dismissal of BDO USA, P\.C\. \("BDO"\) as the Company's independent registered public accounting firm, effective October 15, 2026\.$/);
  assert.ok(first.disclosed.some((q) => /explanatory paragraph regarding substantial doubt/.test(q)));
  // The amendment files BDO's letter to the SEC.
  assert.deepEqual([amended.form, amended.former_auditor_letter], ["8-K/A", "https://www.sec.gov/Archives/edgar/data/1056358/000143774926033426/ex_1030167.htm"]);
  assert.equal(m.reading, "MANNATECH INC: its latest auditor change was filed 2026-10-23: BDO USA, P.C. dismissed, CBIZ CPAs P.C. engaged.");

  const e = await auditSignals(session(), { company: "1883835", signal: "auditor_change", limit: 2 });
  const [oct, feb] = rowsOf(e.auditor_changes);
  assert.deepEqual([oct.filed, oct.former_auditor, oct.how, oct.new_auditor, oct.disagreements, oct.reportable_events], ["2026-10-29", "TQ International, PLLC", "resigned", "Shah Teelani & Associates", "none", "none"]);
  assert.match(oct.quote, /^On October 26, 2026, TQ International, PLLC \(formerly Tang Qian & Associates, PLLC\) \("TQ"\) resigned as the independent registered public accounting firm of ESG Inc\./);
  // Its lines break mid-sentence in the filing; the sentence is read whole.
  assert.deepEqual([feb.filed, feb.former_auditor, feb.how, feb.new_auditor], ["2026-02-20", "Boladale Lawal & Co.", "resigned", "Tang Qian & Associates, PLLC"]);
  assert.match(feb.quote, /^On February 18, 2026, Boladale Lawal & Co\. \("Boladale" or the "Former Auditor"\) resigned/);
});

test("across the market, 2026-10-02 to 2026-10-09: the 8-K Item 4.01 filings, read in their own words", async () => {
  const r = await auditSignals(session(), { signal: "auditor_change", days: 7, limit: 10 });
  assert.deepEqual(r.window, { from: "2026-10-02", to: "2026-10-09", days: 7 });
  assert.deepEqual(r.counts, { auditor_change_filings: 13, auditor_changes_read: 10 });
  assert.equal(r.source, "https://efts.sec.gov/LATEST/search-index?q=%22Item%204.01%22&forms=8-K&dateRange=custom&startdt=2026-10-02&enddt=2026-10-09");
  const rows = rowsOf(r.auditor_changes);
  const by = (name) => rows.find((x) => x.company === name);
  const verde = by("VERDE RESOURCES, INC.");
  assert.deepEqual([verde.former_auditor, verde.how, verde.new_auditor, verde.disagreements, verde.reportable_events], ["J&S Associate PLT", "dismissed", "MBP Global LLP", "none", "reported"]);
  assert.match(verde.disclosed[0], /, except that there were material weaknesses in the Company's internal control over financial reporting /);
  const ludwig = by("LUDWIG ENTERPRISES, INC.");
  assert.deepEqual([ludwig.former_auditor, ludwig.how, ludwig.new_auditor, ludwig.event_date], ["Stephano Slack LLC", "resigned", null, "2026-06-22"]);
  assert.equal(ludwig.new_auditor_quote, "As of the date of this Current Report on Form 8-K, the Company has not engaged a successor independent registered public accounting firm.");
  assert.deepEqual([by("OpenWorld, Inc.").former_auditor, by("OpenWorld, Inc.").how, by("OpenWorld, Inc.").new_auditor], ["MaloneBailey, LLP", "dismissed", "RSM Cayman Ltd."]);
  assert.deepEqual([by("American Fusion, Inc.").former_auditor, by("American Fusion, Inc.").how], ["JV CPA INC", "resigned"]);
  // An 8-K that only engages a new auditor says nothing of one leaving, and nothing is made up for it.
  assert.deepEqual([by("Vylor Inc.").former_auditor, by("Vylor Inc.").how, by("Vylor Inc.").new_auditor], [null, null, "PricewaterhouseCoopers LLP"]);
  assert.match(r.reading, /13 auditor-change filings \(8-K Item 4\.01\) were filed 2026-10-02 to 2026-10-09; of the 10 read, 2 say the auditor resigned and 4 that it was dismissed/);
});

test("across the market, 2026-10-08 to 2026-10-09: no report newly raised the doubt; a policy and a 'no substantial doubt' do not count", async () => {
  const s = session();
  const r = await auditSignals(s, { days: 1, limit: 3 });
  assert.deepEqual(r.window, { from: "2026-10-08", to: "2026-10-09", days: 1 });
  assert.deepEqual(r.going_concern.rows, []);
  assert.deepEqual(r.counts, { documents_found: 15, companies_checked: 15, newly_raised: 0, previous_report_names_it: 10, first_report: 1, newer_report_without_doubt: 2, not_raised_in_text: 2, companies_in_hits_read: 15 });
  assert.match(r.reading, /^Across the market: 0 companies' latest 10-K or 10-Q filed 2026-10-08 to 2026-10-09 newly raised a going-concern doubt, of 15 companies checked/);
  // The two read: Byrna Technologies' 10-Q states the policy; MDNC's says there is no substantial doubt.
  const text = (u) => getText(s, u, { maxBytes: 64 * 1024 * 1024, transform: htmlToText });
  const byrna = goingConcernIn(await text("https://www.sec.gov/Archives/edgar/data/1354866/000143774926032353/byrn20260831_10q.htm"));
  assert.equal(byrna.status, "mentioned only");
  assert.match(byrna.quote, /^In accordance with ASC 205-40, Presentation of Financial Statements-Going Concern, management evaluated whether/);
  const mdnc = goingConcernIn(await text("https://www.sec.gov/Archives/edgar/data/1931055/000166357726000326/mdnc10q_083126.htm"));
  assert.deepEqual([mdnc.status, mdnc.quote], ["no substantial doubt", "Management has concluded that there is no substantial doubt about the Company's ability to continue as a going concern for at least twelve months from the date these financial statements are issued."]);
});

test("inputs: critical audit matters need a company; the schema is strict", async () => {
  await assert.rejects(auditSignals(session(), { signal: "critical_audit_matters" }), /pass a company/);
  await assert.rejects(auditSignals(session(), { days: 400 }));
  await assert.rejects(auditSignals(session(), { company: "AAPL", since: "2026-01-01" }));
});
