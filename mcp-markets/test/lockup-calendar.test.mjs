// lockup_calendar: dates and sentences read by hand from real 2026 IPO prospectuses, then real companies and a market
// window captured by scripts/capture-lockup-fixtures.mjs and replayed with no network.
import assert from "node:assert/strict";
import test from "node:test";

import { addDays, addMonths, coverDates, isoOf, lockupCalendar, lockupChanges, lockupInput, lockupTerms } from "../src/lockups.mjs";
import { createSession } from "../src/sources.mjs";
import { NOW, replayFetch } from "./replay.mjs";

const session = () => createSession({ fetchImpl: replayFetch().fetchImpl, now: () => NOW, env: {}, sleep: async () => {} });
const rowsOf = (t) => t.rows.map((r) => Object.fromEntries(t.columns.map((c, i) => [c, r[i]])));

test("a lock-up's days run on the calendar and its months to the same day, from the date the prospectus names", () => {
  assert.equal(isoOf("May 13, 2026"), "2026-05-13");
  assert.equal(isoOf("February 30, 2026"), null);
  // Cerebras: 180 days after its prospectus of 13 May 2026. Rank One: 6 months after its closing of 23 February 2026.
  assert.equal(addDays("2026-05-13", 180), "2026-11-09");
  assert.equal(addMonths("2026-02-23", 6), "2026-08-23");
  assert.equal(addMonths("2026-08-31", 6), "2027-02-28");
  // Cerebras's cover, and Kailera's, which breaks its date across lines; Arxis sets its date on a line of its own.
  assert.deepEqual(coverDates("The underwriters expect to deliver the shares against payment on May 15, 2026.\nProspectus dated May 13, 2026"), { dated: "2026-05-13", closing: "2026-05-15" });
  assert.deepEqual(coverDates("The underwriters expect to deliver the shares against payment on or about April 20, 2026.\nJoint Book-Running Managers\nJ.P. Morgan\nThe date of this prospectus is April\n16, 2026."), { dated: "2026-04-16", closing: "2026-04-20" });
  assert.deepEqual(coverDates("PROSPECTUS\nThe underwriters expect to deliver the shares to purchasers on or about April 17, 2026 through the book-entry facilities of The Depository Trust Company.\nApril 15, 2026"), { dated: "2026-04-15", closing: "2026-04-17" });
});

test("only a holders' lock-up counts: the underwriters' option, dealers' prospectus delivery and Rule 144 are other periods", () => {
  // Kailera's lock-up (prospectus of 16 April 2026), with its option sentence and Cerebras's Rule 144 and dealer sentences.
  const terms = lockupTerms([
    "The date of this prospectus is April 16, 2026.",
    "Our directors and executive officers and substantially all of our securityholders have entered into lock-up agreements with the representatives pursuant to which they may not, with limited exceptions, for a period of 180 days from the date of this prospectus, offer, sell or otherwise transfer or dispose of any of our securities, without the prior written consent of two of the representatives of the underwriters, one of whom must be",
    "We have granted the underwriters an option for a period of 30 days from the date of this prospectus to purchase up to 5,859,375 additional shares of common stock from us at the initial public offering price, less the underwriting discounts and commissions.",
    "Persons who are our \"affiliates\" may resell those shares beginning 90 days after the date of this prospectus without compliance with minimum holding period requirements under Rule 144 (subject to the terms of the lock-up agreements and market standoff provisions referred to below, if applicable).",
    "Through and including June 7, 2026 (the 25th day after the date of this prospectus), all dealers that buy, sell, or trade shares of our Class A common stock, whether or not participating in this offering, may be required to deliver a prospectus.",
  ].join("\n"));
  assert.equal(terms.dated, "2026-04-16");
  assert.deepEqual(terms.periods.map((p) => [p.n, p.unit, p.basis, p.from, p.holders]), [[180, "day", "prospectus", "the date of this prospectus", true]]);
  assert.equal(terms.locked.words, "substantially all of our securityholders");
  // X-Energy's early end when a blackout period would cover the lock-up's last days.
  const xe = lockupTerms("Pursuant to the lock-up agreements with the underwriters, if (1) at least 120 days have elapsed since the date of this prospectus and (2) such lock-up period is scheduled to end during or within five trading days prior to a broadly applicable period during which trading in our securities would not be permitted under our insider trading policy, or a blackout period, such lock-up period will end ten trading days prior to the commencement of such blackout period.");
  assert.deepEqual(xe.periods, []);
  assert.deepEqual(xe.early.map((e) => e.on), [["a blackout period"]]);
});

test("a later filing changes a lock-up only when it says one was waived or released, not that one may be", () => {
  // Cerebras's prospectus, and Ingram Micro's prospectus supplement of 9 September 2026.
  assert.deepEqual(lockupChanges("Morgan Stanley & Co. LLC, Citigroup Global Markets Inc., and Barclays Capital Inc., on behalf of the underwriters, may release any of the securities subject to these lock- up agreements and market standoff provisions at any time, subject to the applicable notice requirements."), []);
  assert.deepEqual(lockupChanges("There are no contractually specified conditions for the waiver of lock-up restrictions and any waiver is at the discretion of the underwriter."), []);
  assert.deepEqual(lockupChanges("However, subject to the expiration or waiver of the Lock-Up Period, certain of the holders of these shares of Common Stock will have the right, subject to certain exceptions and conditions, to require us to register their shares of Common Stock under the Securities Act, and they will have the right to participate in future registrations of securities by us."), []);
});

test("Cerebras: 180 days after its prospectus of 13 May 2026, or sooner after an earnings release, with dated releases before", async () => {
  const r = await lockupCalendar(session(), { company: "2021728" });
  assert.deepEqual(r.company, { cik: 2021728, name: "Cerebras Systems Inc.", ticker: "CBRS" });
  assert.deepEqual(r.ipo, { form: "424B4", filed: "2026-05-14", prospectus_date: "2026-05-13", expected_closing: "2026-05-15", price: 185, shares_offered: 30000000, accession: "0001628280-26-035214", url: "https://www.sec.gov/Archives/edgar/data/2021728/000162828026035214/cerebras-424b4.htm" });
  const rows = rowsOf(r);
  const end = rows.find((x) => x.event === "lock-up ends");
  assert.deepEqual([end.expiry, end.lockup, end.counts_from, end.base_date], ["2026-11-09", "180 days", "the date of this prospectus", "2026-05-13"]);
  assert.match(end.condition, /earlier end/);
  assert.match(end.quote, /the earlier of \(i\) 6:00 a\.m\. Eastern Time on the second trading day following our release of earnings for the quarter ending September 30, 2026 or \(ii\) 180 days after the date of this prospectus/);
  assert.equal(end.shares_locked, "approximately 71.4% of our Class A common stock, stock options, and other securities convertible into, exercisable, or exchangeable for our Class A common stock");
  // The release schedule's dated stages, each with the shares it frees.
  const staged = rows.filter((x) => x.event === "staged release");
  assert.deepEqual(staged.map((x) => x.expiry), ["2026-08-19", "2026-09-02", "2026-09-16", "2026-09-30", "2026-10-14", "2026-10-28"]);
  assert.equal(staged[4].shares_locked, "An aggregate of up to approximately 19.4 million shares held by Directors and Officers, Non-Executive Employees, and Non-Employee Holders.");
  const early = rows.filter((x) => x.event === "early release");
  assert.deepEqual(early.map((x) => [x.expiry, x.condition]), [[null, "can end sooner on an earnings release; the date is not stated"], [null, "can end sooner on the share price; the date is not stated"]]);
  assert.match(early[1].quote, /has exceeded 133% of the initial public offering price/);
  assert.deepEqual(rows.map((x) => x.expiry), [...staged.map((x) => x.expiry), "2026-11-09", null, null]);
  assert.equal(r.reading, "Cerebras Systems Inc.'s IPO lock-up (prospectus dated 2026-05-13) runs 180 days after the date of this prospectus, to 2026-11-09, or sooner on an earnings release or the share price, with 6 dated releases stated before then; an expiry is when holders may sell, not that they will, and staged and early releases are listed where the prospectus states them.");
  assert.equal(typeof r.source, "string");
  assert.equal(r.source, r.ipo.url);
  assert.ok(r.sources.includes(r.ipo.url) && r.sources.some((u) => u.startsWith("https://efts.sec.gov/")));
  assert.ok(r.quotes.every((q) => q.text.length <= 420));
  assert.ok(r.limits.some((l) => /not investment advice/i.test(l)) && r.limits.some((l) => /unusual wording/i.test(l)) && r.limits.some((l) => /not always filed/i.test(l)));
});

test("Fervo Energy: the standard 180 days after its prospectus of 12 May 2026, held by 97% of its stock", async () => {
  const r = await lockupCalendar(session(), { company: "1853868" });
  assert.deepEqual([r.ipo.prospectus_date, r.ipo.price, r.ipo.shares_offered], ["2026-05-12", 27, 70000000]);
  assert.deepEqual(rowsOf(r).map((x) => [x.expiry, x.event, x.lockup, x.counts_from, x.base_date, x.shares_locked]), [["2026-11-08", "lock-up ends", "180 days", "the date of this prospectus", "2026-05-12", "approximately 97% of our outstanding stock and stock options"]]);
  assert.match(r.quotes[0].text, /during the period ending 180 days after the date of this prospectus, subject to certain exceptions\.$/);
  assert.deepEqual(r.changes.rows, []);
});

test("Rank One Computing: 6 months counted from the closing (23 February 2026), not from its prospectus of 19 February", async () => {
  const r = await lockupCalendar(session(), { company: "2077709" });
  assert.deepEqual([r.ipo.prospectus_date, r.ipo.expected_closing, r.ipo.price, r.ipo.shares_offered], ["2026-02-19", "2026-02-23", 6, 4000000]);
  const [row] = rowsOf(r);
  assert.deepEqual([row.expiry, row.event, row.lockup, row.counts_from, row.base_date], ["2026-08-23", "lock-up ends", "6 months", "the closing", "2026-02-23"]);
  assert.match(row.quote, /we and each of our directors, officers and existing securityholders have agreed with the underwriters not to offer for sale.* for 6 months after the closing of this offering without the prior written consent of the underwriters/);
  assert.match(r.reading, /runs 6 months after the closing, to 2026-08-23/);
});

test("X-Energy: 180 days after its prospectus of 23 April 2026, ending sooner before a blackout period once 120 days have passed", async () => {
  const r = await lockupCalendar(session(), { company: "2088896" });
  const rows = rowsOf(r);
  assert.deepEqual(rows.map((x) => [x.expiry, x.event]), [["2026-10-20", "lock-up ends"], [null, "early release"]]);
  assert.match(rows[1].quote, /^Pursuant to the lock-up agreements with the underwriters, if \(1\) at least 120 days have elapsed since the date of this prospectus/);
  assert.match(r.reading, /to 2026-10-20, or sooner on a blackout period/);
});

test("across the market: the IPO lock-ups and dated releases that end in the next five days, earliest first", async () => {
  const r = await lockupCalendar(session(), { days: 5, limit: 10 });
  assert.deepEqual(r.window, { from: "2026-10-09", to: "2026-10-14", days: 5 });
  const rows = rowsOf(r);
  assert.deepEqual(rows.map((x) => [x.expiry, x.event, x.ticker]), [
    ["2026-10-09", "staged release", "SPCX"],
    ["2026-10-12", "lock-up ends", "ARXS"],
    ["2026-10-12", "lock-up ends", "MAIR"],
    ["2026-10-13", "lock-up ends", "AVEX"],
    ["2026-10-13", "lock-up ends", "ALMR"],
    ["2026-10-13", "lock-up ends", "KLRA"],
    ["2026-10-14", "staged release", "CBRS"],
  ]);
  // SpaceX's schedule frees part of its locked shares on the 120th day after its prospectus of 11 June 2026.
  assert.deepEqual([rows[0].priced, rows[0].lockup, rows[0].counts_from, rows[0].base_date], ["2026-06-11", "120 days", "the date of this prospectus", "2026-06-11"]);
  const kailera = rows.find((x) => x.ticker === "KLRA");
  assert.deepEqual([kailera.priced, kailera.lockup, kailera.counts_from, kailera.ipo_shares, kailera.ipo_price, kailera.form], ["2026-04-16", "180 days", "the date of this prospectus", 39062500, 16, "424B4"]);
  assert.equal(kailera.url, "https://www.sec.gov/Archives/edgar/data/2096997/000119312526161521/d113532d424b4.htm");
  assert.ok(r.quotes.some((q) => q.company === "Kailera Therapeutics, Inc." && /for a period of 180 days from the date of this prospectus/.test(q.text)));
  assert.equal(r.counts.lockups_in_window, 7);
  assert.ok(r.counts.prospectuses_read >= 7 && r.counts.prospectuses_read <= r.counts.prospectuses_found);
  assert.match(r.reading, /^7 IPO lock-ups or dated releases end 2026-10-09 to 2026-10-14, the first SPACE EXPLORATION TECHNOLOGIES CORP's on 2026-10-09; an expiry is when holders may sell, not that they will/);
  assert.equal(typeof r.source, "string");
  assert.ok(r.source.startsWith("https://efts.sec.gov/LATEST/search-index?") && r.source.includes("startdt=2026-04-03"));
});

test("inputs are checked", () => {
  assert.throws(() => lockupInput.parse({ days: 0 }));
  assert.throws(() => lockupInput.parse({ since: "2026-13" }));
  assert.throws(() => lockupInput.parse({ ticker: "CBRS" }));
});
