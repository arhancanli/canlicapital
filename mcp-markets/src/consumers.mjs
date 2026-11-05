// consumer_expectations: what American households expect, from the New York Fed's Survey of Consumer Expectations
// (monthly, about 1,300 households): inflation over one, three and five years, home prices, prices of gas, food, rent
// and more, earnings, income and spending, the chances of losing or finding a job, of higher unemployment, of
// missing a debt payment, of higher stock prices. The latest month beside a month and a year earlier, or one topic
// month by month. Read from the New York Fed's workbook, with the attribution its license requires. No key.
import { z } from "zod";

import { getZipText, NotFound } from "./sources.mjs";
import { xlsxSheets } from "./xlsx.mjs";

const FILE = "https://www.newyorkfed.org/medialibrary/interactives/sce/sce/downloads/data/frbny-sce-data.xlsx";
const PAGE = "https://www.newyorkfed.org/microeconomics/sce";
// A topic: its tab, and the headline measures (column, key, words, kind: "pct" an expected change, "prob" a chance).
const TOPICS = {
  inflation: ["Inflation expectations", [["Median one-year ahead expected inflation rate", "inflation_1y", "inflation over the next year"], ["Median three-year ahead expected inflation rate", "inflation_3y", "inflation over three years"], ["Median five-year ahead expected inflation rate", "inflation_5y", "inflation over five years"]]],
  home_prices: ["Home price expectations", [["Median expected home price change", "home_prices_1y", "home prices over the next year"]]],
  prices: ["Commodity expectations", [["Gas", "gas_1y", "gas prices"], ["Food", "food_1y", "food prices"], ["Medical care", "medical_care_1y", "medical care"], ["College education", "college_1y", "college"], ["Rent", "rent_1y", "rent"], ["Gold", "gold_1y", "gold"]]],
  earnings: ["Earnings growth", [["Median expected earnings growth", "earnings_1y", "their own earnings"]]],
  income: ["HH Income Change", [["Median point prediction", "household_income_1y", "household income"]]],
  spending: ["HH Spending Change", [["Median point prediction", "household_spending_1y", "household spending"]]],
  jobs: ["Job separation expectation", [["Mean probability of losing a job", "job_loss_chance", "losing their job within a year", "prob"], ["Mean probability of leaving a job voluntarily", "job_quit_chance", "leaving their job by choice within a year", "prob"]]],
  job_finding: ["Job finding expectations", [["Mean probability of finding a job in the next three months if one loses a job today", "job_finding_chance", "finding a job within three months after losing one", "prob"]]],
  unemployment: ["Unemployment Expectations", [["Mean probability that the U.S. unemployment rate will be higher one year from now", "higher_unemployment_chance", "US unemployment higher a year from now", "prob"]]],
  delinquency: ["Delinquency expectations", [["Mean probability of missing minimum debt payment over the next three months", "missed_payment_chance", "missing a minimum debt payment within three months", "prob"]]],
  interest_rates: ["Interest rate expectations", [["Mean probability of higher average interest rate on savings accounts one year from now", "higher_savings_rate_chance", "higher savings rates a year from now", "prob"]]],
  stocks: ["Stock Prices", [["Mean probability that U.S. stock prices will be higher one year from now", "higher_stocks_chance", "US stock prices higher a year from now", "prob"]]],
  government_debt: ["Government debt", [["Median point prediction", "government_debt_1y", "government debt"]]],
};
const TABS = Object.values(TOPICS).map(([tab]) => tab);

export const consumersInput = z.object({
  topic: z.enum(Object.keys(TOPICS)).optional().describe("One topic month by month, every measure the survey gives for it (medians, quartiles): inflation, home_prices, prices, earnings, income, spending, jobs, job_finding, unemployment, delinquency, interest_rates, stocks or government_debt; default the headline of each, latest month."),
  months: z.number().int().min(1).max(160).optional().describe("topic: months shown, latest last; default 13."),
}).strict();

const round = (x, d = 2) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d || 0);
const num = (s) => (s === "" || s == null || !Number.isFinite(Number(s)) ? null : Number(s));
const month = (yyyymm) => `${yyyymm.slice(0, 4)}-${yyyymm.slice(4, 6)}`;

// The workbook's tabs as their header row and their months (a row a month, "202609").
export const surveyTabs = (bytes) => JSON.stringify(xlsxSheets(bytes, TABS).map((rows) => {
  const months = rows.filter((r) => /^\d{6}$/.test(r[0]));
  const head = rows.slice(0, rows.indexOf(months[0])).reverse().find((r) => r[0] === "" && r.slice(1).some((c) => c !== "")) ?? [];
  return { head, months, attribution: rows.find((r) => /^Source:\s+Survey of Consumer Expectations/i.test(r[0] ?? ""))?.[0]?.replace(/\s+/g, " ").trim() ?? null };
}));

export async function consumerExpectations(session, args) {
  const a = consumersInput.parse(args);
  const tabs = JSON.parse(await getZipText(session, FILE, { decode: surveyTabs }));
  const byTab = Object.fromEntries(TABS.map((t, i) => [t, tabs[i]]));
  const attribution = tabs.find((t) => t.attribution)?.attribution ?? `Source: Survey of Consumer Expectations, Federal Reserve Bank of New York (FRBNY), ${PAGE}. FRBNY disclaims any responsibility for this analysis and interpretation of Survey of Consumer Expectations data.`;
  const limits = [attribution, "Medians across about 1,300 households a month; a chance is the average of the probabilities households give. These are expectations, not forecasts by the New York Fed.", "Not investment advice."];
  if (a.topic) {
    const [tab] = TOPICS[a.topic], t = byTab[tab];
    if (!t?.months.length) throw new NotFound(`The New York Fed's workbook held no months for ${tab}.`);
    const cols = t.head.map((h, i) => [h, i]).filter(([h, i]) => i > 0 && h);
    return {
      topic: a.topic, survey_tab: tab,
      columns: ["month", ...cols.map(([h]) => h)],
      rows: t.months.slice(-(a.months ?? 13)).map((r) => [month(r[0]), ...cols.map(([, i]) => round(num(r[i])))]),
      reading: `${tab} from the New York Fed's Survey of Consumer Expectations, a row a month (percent; "probability" columns are average chances in percent).`,
      source: `${FILE} (${PAGE})`, limits,
    };
  }
  const rows = [];
  let latest = null;
  for (const [, [tab, measures]] of Object.entries(TOPICS)) {
    const t = byTab[tab];
    if (!t?.months.length) continue;
    const last = t.months.at(-1), prev = t.months.at(-2), yearAgo = t.months.find((r) => Number(r[0]) === Number(last[0]) - 100);
    latest = latest && latest > last[0] ? latest : last[0];
    for (const [col, key, words, kind = "pct"] of measures) {
      const i = t.head.indexOf(col);
      if (i < 1) continue;
      const v = num(last[i]);
      rows.push([key, words, kind === "prob" ? "chance_pct" : "expected_change_pct", month(last[0]), round(v), round(num(prev?.[i])), round(num(yearAgo?.[i])), yearAgo && v != null && num(yearAgo[i]) != null ? round(v - num(yearAgo[i])) : null]);
    }
  }
  if (!rows.length) throw new NotFound("The New York Fed's workbook held none of the survey's measures.");
  const get = (k) => rows.find((r) => r[0] === k);
  const [i1, i3, i5, un, st] = ["inflation_1y", "inflation_3y", "inflation_5y", "higher_unemployment_chance", "higher_stocks_chance"].map(get);
  const summary = [];
  if (i1) summary.push(`In ${i1[3]} households expected inflation of ${i1[4]}% over the next year (${i1[5]}% the month before, ${i1[6]}% a year earlier)${i3 ? `, ${i3[4]}% over three years` : ""}${i5 ? ` and ${i5[4]}% over five` : ""}.`);
  if (un || st) summary.push(`They put ${[un && `a ${round(un[4], 1)}% chance on US unemployment being higher a year from now`, st && `${round(st[4], 1)}% on stock prices being higher`].filter(Boolean).join(" and ")}.`);
  return {
    month: latest ? month(latest) : null, summary,
    columns: ["measure", "about", "unit", "month", "latest", "month_before", "year_before", "change_on_year"], rows,
    reading: "The headline measure of each topic in the latest month beside the month before and a year before: expected changes over the next year in percent (medians), chances in percent (averages).",
    source: `${FILE} (${PAGE})`, limits,
  };
}
