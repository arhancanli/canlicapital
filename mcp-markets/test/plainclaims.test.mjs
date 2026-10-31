// How verify_claims reads a person's sentence: the measure, the period and the figure, with no network.
import test from "node:test";
import assert from "node:assert/strict";

import { plainClaimsIn, plainYear } from "../src/plainclaims.mjs";
import { claimsFromText } from "../src/verify.mjs";

const read = (s, name = "Apple Inc.") => plainClaimsIn(s, { name }).map((c) => [c.measure, c.value, c.when ?? null, c.change ?? null, c.bound ?? null]);

// sentence, then what it should be read as: [measure, value, when, change, bound].
const READS = [
  ["Amazon earned $9 per share in 2025.", [["eps", 9, null, null, null]], "Amazon.com, Inc."],
  ["Amazon made $7.17 a share.", [["eps", 7.17, null, null, null]], "Amazon.com, Inc."],
  ["Apple made $416 billion in revenue in fiscal 2025.", [["revenue", 416, null, null, null]]],
  ["Apple brought in $416 billion in sales.", [["revenue", 416, null, null, null]]],
  ["Apple pulled in 416 billion dollars of revenue.", [["revenue", 416, null, null, null]]],
  ["Nvidia made $100 billion profit last year.", [["net_income", 100, "last year", null, null]], "NVIDIA CORP"],
  ["Apple made 112 billion dollars in profit in 2025.", [["net_income", 112, null, null, null]]],
  ["Apple's profit was $112 billion.", [["net_income", 112, null, null, null]]],
  ["Apple profits hit $112bn.", [["net_income", 112, null, null, null]]],
  ["Apple earned $112 billion in 2025.", [["net_income", 112, null, null, null]]],
  ["Intel lost $18.8 billion in 2024.", [["net_income", -18.8, null, null, null]], "Intel Corp"],
  ["Intel had a net loss of $18.8 billion in 2024.", [["net_income", -18.8, null, null, null]], "Intel Corp"],
  ["Microsoft has $90 billion in cash.", [["cash", 90, null, null, null]], "Microsoft Corp"],
  ["Microsoft is sitting on $90 billion of cash.", [["cash", 90, null, null, null]], "Microsoft Corp"],
  ["Boeing has $50 billion in debt.", [["long_term_debt", 50, null, null, null]], "Boeing Co"],
  ["Coca-Cola's profit margin is 30%.", [["net_margin", 30, null, null, null]], "Coca-Cola Co"],
  ["Coca-Cola has a 30% profit margin.", [["net_margin", 30, null, null, null]], "Coca-Cola Co"],
  ["Apple's gross margin was 46% in 2025.", [["gross_margin", 46, null, null, null]]],
  ["Apple's sales rose 6% in 2025.", [["revenue", 6, null, "growth", null]]],
  ["Tesla's profit fell 46% in 2025.", [["net_income", -46, null, "growth", null]], "Tesla, Inc."],
  ["Apple's revenue was over $400 billion.", [["revenue", 400, null, null, "over"]]],
  ["Apple made more than $100 billion in profit.", [["net_income", 100, null, null, "over"]]],
  ["Apple's revenue was about $420 billion.", [["revenue", 420, null, null, "about"]]],
  ["Apple's revenue was under $500 billion.", [["revenue", 500, null, null, "under"]]],
  ["Apple's revenue last quarter was $102 billion.", [["revenue", 102, "last quarter", null, null]]],
  ["Apple spent $34 billion on R&D in 2025.", [["rnd", 34, null, null, null]]],
  ["Apple's free cash flow was $99 billion in 2025.", [["free_cash_flow", 99, null, null, null]]],
  ["Apple revenue was $416 billion.", [["revenue", 416, null, null, null]]],
  ["Revenue was $416 billion.", [["revenue", 416, null, null, null]]],
];

// Sentences that must give no figure to check: another measure, a part of the business, the future.
const NOT_READ = [
  "Tesla sold 1.8 million cars in 2025.",
  "Apple has a $3 trillion market cap.",
  "Apple lost $200 billion in market value in a day.",
  "Apple bought back $90 billion of stock.",
  "Apple made a $2 billion acquisition.",
  "Apple will make $500 billion in revenue next year.",
  "Analysts expect revenue of $450 billion.",
  "Apple could earn $150 billion by 2030.",
  "iPhone revenue was $209 billion.",
  "Apple made $209 billion in iPhone revenue.",
  "Apple's revenue from China was $64 billion.",
  "Apple's revenue in Europe was $111 billion.",
  "The stock trades at $270 per share.",
  "Apple paid a $1.04 per share dividend.",
  "Apple's revenue was $416 billion, up from $391 billion.",
];

for (const [sentence, want, name] of READS) test(`reads: ${sentence}`, () => assert.deepEqual(read(sentence, name), want));

test("two figures in one sentence are both read", () => {
  assert.deepEqual(read("Apple's revenue was $500 billion in 2025 and net income was $112 billion."), [["revenue", 500, null, null, null], ["net_income", 112, null, null, null]]);
  assert.deepEqual(read("Apple's sales were $416 billion, with profit of $112 billion."), [["revenue", 416, null, null, null], ["net_income", 112, null, null, null]]);
});

for (const sentence of NOT_READ) test(`leaves alone: ${sentence}`, () => {
  const kept = sentence.includes("up from") ? read(sentence).filter((r) => r[1] === 391) : read(sentence);
  assert.deepEqual(kept, []);
});

test("a year at the end of a sentence is a year; one inside a figure is not", () => {
  assert.equal(plainYear("Tesla's net income was $20 billion in 2025."), "2025");
  assert.equal(plainYear("Tesla's net income was $20 billion in 2025, a record."), "2025");
  assert.equal(plainYear("Revenue was $2025.5 million."), null);
  assert.equal(plainYear("Margin was 2025%."), null);
  assert.equal(plainYear("Tesla's FY'25 net income."), "FY'25");
});

test("a part of the business is named as one, not checked against the whole", () => {
  const [row] = plainClaimsIn("Cloud revenue was $168 billion.", { name: "Microsoft Corp", parts: true });
  assert.equal(row.part, "Cloud");
});

test("loose words are marked, so a mismatch can be told apart from a wrong figure", () => {
  assert.equal(plainClaimsIn("Apple's profit was $133 billion.", { name: "Apple Inc." })[0].loose, "profit");
  assert.equal(plainClaimsIn("Microsoft has $90 billion in cash.", { name: "Microsoft Corp" })[0].loose, "cash");
  assert.equal(plainClaimsIn("Boeing has $50 billion in debt.", { name: "Boeing Co" })[0].loose, "debt");
  assert.equal(plainClaimsIn("Apple's net income was $112 billion.", { name: "Apple Inc." })[0].loose, undefined);
});

// The whole text path, both readings together.
test("a whole draft: nothing unread is judged, and every period is accounted for", () => {
  for (const s of NOT_READ) {
    const { claims } = claimsFromText(s, "Apple Inc.");
    const judged = claims.filter((c) => !c.part && !(c.basis && c.basis !== "GAAP") && (c.value !== 416));
    assert.deepEqual(judged.map((c) => [c.measure, c.value]), [], s);
  }
  const [a] = claimsFromText("Apple's revenue was $416 billion.", "Apple Inc.").claims;
  assert.equal(a.assume, "latest");
  const [b] = claimsFromText("Apple's revenue last year was $416 billion.", "Apple Inc.").claims;
  assert.equal(b.assume, "last year");
  assert.equal(b.period, null);
  const [c] = claimsFromText("Apple's revenue in 2025 was $416 billion.", "Apple Inc.").claims;
  assert.deepEqual(c.period, { fy: 2025, fp: "FY" });
});

test("a part of the business from a release's reading is held back, the company and period are not parts", () => {
  const [cloud] = claimsFromText("Microsoft Cloud revenue was $168 billion in fiscal 2026.", "Microsoft Corp").claims;
  assert.equal(cloud.part, "Cloud");
  const [own] = claimsFromText("Apple's 2025 revenue was $416.2 billion.", "Apple Inc.").claims;
  assert.equal(own.part, undefined);
});

test("a figure the words call something else is dropped from a release's reading too", () => {
  const { claims, unread } = claimsFromText("Apple's revenue was $416 billion, and it has a $3 trillion market cap.", "Apple Inc.");
  assert.deepEqual(claims.map((c) => [c.measure, c.value]), [["revenue", 416]]);
  assert.equal(unread, 1);
});

// Sentences written after the reader was, each set scored once before any fix it led to: 34 of 40 with
// 4 wrong readings, then 39 of 40 with 1. Kept so those fixes hold. Written here, not sampled from the wild.
const HELD = [
 ["Walmart did $680 billion in sales last year.","Walmart Inc.",[["revenue",680]]],
 ["JPMorgan's net income came in at $58 billion in 2024.","JPMORGAN CHASE & CO",[["net_income",58]]],
 ["Meta raked in $164 billion of revenue in 2024.","Meta Platforms, Inc.",[["revenue",164]]],
 ["Google's parent earned $100 billion in 2024.","Alphabet Inc.",[["net_income",100]]],
 ["Alphabet posted net income of $100 billion for 2024.","Alphabet Inc.",[["net_income",100]]],
 ["Berkshire's cash pile is $300 billion.","BERKSHIRE HATHAWAY INC",[["cash",300]]],
 ["Ford carries about $150 billion of debt.","FORD MOTOR CO",[["long_term_debt",150]]],
 ["Netflix reported EPS of $19.83 for 2024.","NETFLIX INC",[["eps",19.83]]],
 ["Costco's earnings per share were $16.56 in fiscal 2024.","Costco Wholesale Corp",[["eps",16.56]]],
 ["Tesla's operating margin was 7% in 2024.","Tesla, Inc.",[["operating_margin",7]]],
 ["Nike has a gross margin of 44%.","NIKE, Inc.",[["gross_margin",44]]],
 ["Disney's revenue increased by 3% in fiscal 2024.","Walt Disney Co",[["revenue",3]]],
 ["Boeing's sales dropped 14% in 2024.","BOEING CO",[["revenue",-14]]],
 ["Boeing lost nearly $12 billion in 2024.","BOEING CO",[["net_income",-12]]],
 ["Pfizer generated $8 billion of free cash flow in 2024.","PFIZER INC",[["free_cash_flow",8]]],
 ["Amazon's capex was $83 billion in 2024.","AMAZON COM INC",[["capex",83]]],
 ["Exxon's total assets were $453 billion at the end of 2024.","EXXON MOBIL CORP",[["total_assets",453]]],
 ["Apple sold $201 billion worth of iPhones.","Apple Inc.",[]],
 ["Apple's services business made $96 billion in revenue.","Apple Inc.",[]],
 ["AWS revenue hit $107 billion in 2024.","AMAZON COM INC",[]],
 ["YouTube ads brought in $36 billion.","Alphabet Inc.",[]],
 ["Tesla's market cap is above $1 trillion.","Tesla, Inc.",[]],
 ["Nvidia's stock is up 200% this year.","NVIDIA CORP",[]],
 ["Tesla's shares fell 12% last week.","Tesla, Inc.",[]],
 ["Musk owns 13% of Tesla.","Tesla, Inc.",[]],
 ["Microsoft paid $69 billion for Activision.","Microsoft Corp",[]],
 ["Apple was fined $14 billion by the EU.","Apple Inc.",[]],
 ["Berkshire bought $6 billion of Chubb stock.","BERKSHIRE HATHAWAY INC",[]],
 ["Tim Cook earned $74 million in 2024.","Apple Inc.",[]],
 ["Apple has 164,000 employees.","Apple Inc.",[]],
 ["Apple's P/E is 35.","Apple Inc.",[]],
 ["Tesla's revenue is expected to reach $120 billion.","Tesla, Inc.",[]],
 ["Tesla might make $10 billion next year.","Tesla, Inc.",[]],
 ["Adjusted EBITDA was $5 billion.","Uber Technologies",[]],
 ["Apple's non-GAAP earnings were $7 per share.","Apple Inc.",[]],
 ["The dividend yield is 3%.","Coca-Cola Co",[]],
 ["Inflation was 3% in 2024.","Apple Inc.",[]],
 ["Tesla's revenue is bigger than Ford's $185 billion.","Tesla, Inc.",[]],
 ["Apple's revenue is $416 billion and Samsung's is $200 billion.","Apple Inc.",[["revenue",416]]],
 ["Revenue: $416B. Net income: $112B.","Apple Inc.",[["revenue",416],["net_income",112]]],
 ["Oracle's revenue was $57 billion in fiscal 2025.","ORACLE CORP",[["revenue",57]]],
 ["Visa makes about $20 billion in profit a year.","VISA INC.",[["net_income",20]]],
 ["Home Depot did $159 billion in revenue in 2024.","HOME DEPOT, INC.",[["revenue",159]]],
 ["Salesforce has $14 billion in cash and equivalents.","Salesforce, Inc.",[["cash",14]]],
 ["Starbucks earned $3.31 per share in fiscal 2024.","STARBUCKS CORP",[["eps",3.31]]],
 ["Delta's operating income was $6 billion in 2024.","DELTA AIR LINES, INC.",[["operating_income",6]]],
 ["Goldman Sachs made $14 billion in net income in 2024.","GOLDMAN SACHS GROUP INC",[["net_income",14]]],
 ["UnitedHealth's revenue rose 8% in 2024.","UNITEDHEALTH GROUP INC",[["revenue",8]]],
 ["Lululemon's net income was $1.8 billion. Revenue was $10.6 billion.","lululemon athletica inc.",[["net_income",1.8],["revenue",10.6]]],
 ["Palantir's net margin is 16%.","Palantir Technologies Inc.",[["net_margin",16]]],
 ["AMD spent $6 billion on research and development in 2024.","ADVANCED MICRO DEVICES INC",[["rnd",6]]],
 ["Verizon has more than $120 billion in long-term debt.","VERIZON COMMUNICATIONS INC",[["long_term_debt",120]]],
 ["Uber posted a net loss of $9 billion in 2022.","Uber Technologies, Inc",[["net_income",-9]]],
 ["Lyft lost $340 million in 2023.","Lyft, Inc.",[["net_income",-340]]],
 ["Coke's gross profit was $28 billion.","COCA COLA CO",[["gross_profit",28]]],
 ["Ford's sales were $185 billion in 2024; profit was $5.9 billion.","FORD MOTOR CO",[["revenue",185],["net_income",5.9]]],
 ["Adobe's EPS was $12.36 in fiscal 2024.","ADOBE INC.",[["eps",12.36]]],
 ["Cisco's total assets are about $120 billion.","CISCO SYSTEMS, INC.",[["total_assets",120]]],
 ["Paramount's streaming revenue was $8 billion.","Paramount Global",[]],
 ["Microsoft's Azure revenue grew 30%.","MICROSOFT CORP",[]],
 ["Apple's revenue in China fell 8%.","Apple Inc.",[]],
 ["Amazon's advertising business made $56 billion in sales.","AMAZON COM INC",[]],
 ["Warren Buffett made $100 billion on Apple.","BERKSHIRE HATHAWAY INC",[]],
 ["Jensen Huang earned $50 million last year.","NVIDIA CORP",[]],
 ["Investors lost $50 billion on Tesla.","Tesla, Inc.",[]],
 ["Nvidia gained $200 billion in market value on Monday.","NVIDIA CORP",[]],
 ["Tesla is worth $1 trillion.","Tesla, Inc.",[]],
 ["Tesla has 7.5 million cars on the road.","Tesla, Inc.",[]],
 ["Netflix has 300 million subscribers.","NETFLIX INC",[]],
 ["Amazon raised $8 billion in bonds.","AMAZON COM INC",[]],
 ["Apple is buying back $100 billion in shares.","Apple Inc.",[]],
 ["The S&P 500 returned 25% last year.","Apple Inc.",[]],
 ["Interest rates were 5% last year.","JPMORGAN CHASE & CO",[]],
 ["Apple's stock trades at 30 times earnings.","Apple Inc.",[]],
 ["Apple's price target is $300.","Apple Inc.",[]],
 ["Tesla's revenue could double to $200 billion.","Tesla, Inc.",[]],
 ["Microsoft's revenue is larger than Apple's $416 billion.","MICROSOFT CORP",[]],
 ["Meta's revenue beat Snap's $5 billion.","Meta Platforms, Inc.",[]],
 ["Samsung's profit was $25 billion, while Apple's profit was $112 billion.","Apple Inc.",[["net_income",112]]],
 ["Apple gave shareholders $110 billion.","Apple Inc.",[]],
];
for (const [sentence, name, want] of HELD) test(`held out: ${sentence}`, () => {
  const got = claimsFromText(sentence, name).claims.filter((c) => !c.part && !(c.basis && c.basis !== "GAAP")).map((c) => [c.measure, c.value]);
  assert.deepEqual(got, want);
});

// Measured 2026-10-31 on claims written by people in public posts. Short rewrites of the wordings that went wrong.
const real = (text, name) => claimsFromText(text, name).claims.map((c) => [c.measure, c.value, c.period?.fy ?? null, c.period?.fp ?? null, c.assume ?? null, c.part ?? null]);
test("real wording: figures that are a piece of the whole are not the whole", () => {
  assert.deepEqual(real("Revenue for 2021 was 256.7 billion dollars, of which 209.49 billion dollars came from advertising.", "Alphabet Inc. GOOGL").map((c) => c[1]), [256.7]);
  assert.deepEqual(real("Acme reported a profit of 5.2 billion on 18 billion in revenue from AWS in Q4 2021.", "Acme Inc"), []);
  assert.deepEqual(real("Oracle Cloud's revenue was $4.4 billion for Q4 2023.", "Oracle Corp ORCL"), []);
});
test("real wording: a company's own name and plain possessives are not parts of it", () => {
  for (const [text, name] of [["IBM revenue was $54.1 billion in 2021.", "International Business Machines Corp IBM"], ["GM profit for 2022 was $21B.", "General Motors Co GM"], ["Starbucks' revenue in 2022 was $33B.", "Starbucks Corp SBUX"], ["Shopify\u2019s revenue in 2021 was $4.6b.", "Shopify Inc. SHOP"], ["Cisco has a gross revenue of $51.557B for FY22.", "Cisco Systems SCO"]]) {
    assert.equal(real(text, name)[0]?.[5] ?? null, null, text);
    assert.equal(real(text, name).length, 1, text);
  }
});
test("real wording: the sentence's period reaches each of its figures", () => {
  const msft = real("Microsoft's revenue was $281.7 billion for the last year, up 15% on the previous year.", "Microsoft Corp MSFT");
  assert.deepEqual(msft.map((c) => c[4]), ["last year", "last year"]);
  const amd = real("AMD grew their revenue 50% last quarter from the year prior, for 11.5B in revenue.", "Advanced Micro Devices AMD");
  assert.ok(amd.length && amd.every((c) => c[4] === "last quarter"));
  const nvda = real("Nvidia generated $14.5 billion in cash from operations during Q3 fiscal 2026 while reporting net income of $19.3 billion.", "NVIDIA CORP NVDA");
  assert.deepEqual(nvda.map((c) => [c[2], c[3], c[5]]), [[2026, "Q3", null], [2026, "Q3", null]]);
});
test("real wording: a quarter with no year, or a year set beside another quarter, is not placed", () => {
  assert.deepEqual(real("Uber reported net income of $221 million on $9.29 billion in revenue in the third quarter.", "Uber Technologies UBER"), []);
  assert.deepEqual(real("Apple 2022: $99.8 billion profit. ", "Apple Inc. AAPL").map((c) => c[1]), [99.8]);
  assert.deepEqual(real("Apple 2022: $99.8 billion profit (over 1 year) Google Q4 2022: $18.16 billion profit on $76 billion in revenue.", "Apple Inc. AAPL"), []);
});
test("real wording: a percent on a dollar line is dropped, and other wordings are read", () => {
  assert.deepEqual(real("Coca-Cola annual gross profit for 2022 was $25B, and they produce 1% of the entire world's CO2.", "Coca-Cola Co KO").map((c) => c[1]), [25]);
  assert.deepEqual(real("In 2025 Microsoft reported $101.8 billion net income for $281.7 billion in revenue.", "Microsoft Corp MSFT").map((c) => [c[0], c[1]]), [["net_income", 101.8], ["revenue", 281.7]]);
  assert.deepEqual(real("Meta/Facebook made only $47 billion in revenue in 2024.", "Meta Platforms META").map((c) => c[1]), [47]);
  assert.deepEqual(real("Salesforce made 37.9 billion in 2025 of revenue.", "Salesforce, Inc. CRM").map((c) => c[1]), [37.9]);
  assert.deepEqual(real("IBM still makes ~$70B in annual revenue.", "International Business Machines IBM").map((c) => c[1]), [70]);
});
test("real wording: a list of companies and a second value for one measure are not judged", () => {
  assert.deepEqual(real("2025 net income for the big 3: AT&T: $22B Verizon: $17B T-Mobile: $11B.", "AT&T INC. T"), []);
  assert.deepEqual(real("UnitedHealth's revenue was $500 billion (and net profits is 10 billion) for the year.", "UnitedHealth Group UNH").map((c) => c[1]).includes(10) && real("UnitedHealth's revenue was $500 billion (and net profits is 10 billion) for the year.", "UnitedHealth Group UNH").some((c) => c[0] === "revenue" && c[1] === 10), false);
});
