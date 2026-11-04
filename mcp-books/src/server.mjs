#!/usr/bin/env node
// mcp-books/src/server.mjs
//
// The Canli Books MCP server, with the first tools of every Canli company on its engine: Books (keep a book
// file, sign it, prove single entries from it), Close (bank matching, bank lines into entries, what moved, the close checklist, group consolidation),
// Report (facts and the checks before filing), Audit (Benford and journal-entry tests), Planning (runway, budget,
// forecast, valuation) and Data (pack a dataset; SEC facts as first filed; Report's flags on SEC filings). It runs on your machine. A book is a file you name, ending in
// .jsonl, one record per line: a write reads the whole book, checks every record, and only then appends the new
// lines. A file that does not verify is never written to, and no tool overwrites a file. One writer at a time
// per book.
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";

import { journalTests } from "./audit.mjs";
import { smallBusiness } from "./chart.mjs";
import { bankEntries, checklist, readStatement, reconcile, variance } from "./close.mjs";
import { FINDING_COLUMNS, FIRST_FILED_COLUMNS, FIRST_FILED_FORMS, findingRows, firstFiled, packDataset } from "./data.mjs";
import { consolidate, readEcbRates } from "./group.mjs";
import { addAccount, balanceSheet, explain, fromJsonl, fromMinor, incomeStatement, lock, openBook, post, reverse, toJsonl, trialBalance, TYPES, verify } from "./ledger.mjs";
import { budgetVsActual, dcf, forecast, runway } from "./planning.mjs";
import { checkFacts, checkSecFilings, SEC_FORMS, TAXONOMIES, toFacts } from "./report.mjs";
import { bookRoot, proveRecord } from "./proof.mjs";
import { checkHead, checkProof, newSigningKeys, signHead } from "./sign.mjs";

export const SERVER_VERSION = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
export const SERVER_INFO = Object.freeze({ name: "canli-books-mcp", version: SERVER_VERSION, title: "Canli Books" });
const INSTRUCTIONS = "Double-entry books kept in a .jsonl file on this machine, with the first tools of Canli Close, Report, Audit, Planning and Data on top. Amounts are plain decimals such as 1050.00. Every entry must balance; a posted entry is never edited, it is reversed; a locked period takes no entries. books_explain traces any balance to its entries. Report and Audit results are drafts and analytics for a person to review, not filings, opinions or advice.";

const text = (value) => ({ content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value });
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const WRITES_LOCAL = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
// Appends, but the same call again adds nothing.
const APPENDS_ONCE = { ...WRITES_LOCAL, idempotentHint: true };

// Amounts leave the server as decimals in the book's currency; record numbers, counts and percentages stay numbers.
const MONEY = new Set(["debit", "credit", "amount", "balance", "change", "opening", "closing", "totalIncome", "totalExpenses", "netIncome", "totalAssets", "totalLiabilities", "totalEquity", "totalLiabilitiesAndEquity", "earningsToDate", "prior", "current", "budget", "actual", "variance", "cash", "averageChange", "averageIncome", "averageCosts", "income", "costs", "net", "statementTotal", "booksTotal", "difference", "translationReserve", "intercompanyDifference", "translationDifference"]);
function shown(value, currency) {
  if (Array.isArray(value)) return value.map((v) => shown(v, currency));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, MONEY.has(k) && Number.isInteger(v) ? fromMinor(v, currency) : shown(v, currency)]));
  return value;
}

function bookPath(file) {
  const path = resolve(String(file ?? ""));
  if (extname(path) !== ".jsonl") throw new Error(`A book file must end in .jsonl: ${path}`);
  return path;
}

function load(file) {
  const path = bookPath(file);
  if (!existsSync(path)) throw new Error(`There is no book at ${path}; books_open makes one`);
  const book = fromJsonl(readFileSync(path, "utf8"));
  const checked = verify(book);
  if (!checked.ok) throw new Error(`${path} does not verify at record ${checked.at}: ${checked.problem}. Nothing was written.`);
  return { path, book, currency: book.records[0].currency };
}

// Runs a change on the book as it is on disk, then appends only the records the change added.
function change(file, apply) {
  const loaded = load(file);
  const before = loaded.book.records.length;
  const result = apply(loaded.book);
  appendFileSync(loaded.path, loaded.book.records.slice(before).map((r) => `${JSON.stringify(r)}\n`).join(""));
  return { ...loaded, result };
}

function writeNew(path, content, mode) {
  try {
    writeFileSync(path, content, { flag: "wx", ...(mode ? { mode } : {}) });
  } catch (error) {
    if (error.code === "EEXIST") throw new Error(`A file already exists at ${path}; this server never overwrites a file`);
    throw error;
  }
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date such as 2026-01-31");
const amount = z.union([z.string(), z.number()]).describe("a plain amount such as 1050.00");
const file = z.string().describe("path of the book file, ending in .jsonl");
const line = z.object({ account: z.string(), debit: amount.optional(), credit: amount.optional() }).strict();
const range = { from: date.optional(), to: date.optional() };

export function registerTools(server) {
  const tool = (name, title, description, input, annotations, handler) => server.registerTool(name, { title, description, inputSchema: input, annotations: { title, ...annotations } }, async (args) => text(await handler(args)));

  // Canli Books
  tool("books_open", "Open a new book", "Make a new book file: its name, currency (an ISO code such as AED or USD) and a starting chart of accounts ('small-business' includes UAE VAT and corporate tax accounts; 'empty' has none). Refuses a file that already exists.", z.object({ file, name: z.string().min(1), currency: z.string().regex(/^[A-Za-z]{3}$/), chart: z.enum(["small-business", "empty"]).default("small-business") }).strict(), WRITES_LOCAL, ({ file: f, name, currency, chart }) => {
    const path = bookPath(f);
    const book = openBook({ name, currency, accounts: chart === "empty" ? [] : smallBusiness() });
    writeNew(path, toJsonl(book));
    const checked = verify(book);
    return { file: path, records: checked.records, head: checked.head, accounts: book.records.filter((r) => r.kind === "account").map((r) => ({ code: r.code, name: r.name, type: r.type })) };
  });
  tool("books_add_account", "Add an account", "Add an account to a book's chart: a unique code, a name, and its type.", z.object({ file, code: z.string(), name: z.string(), type: z.enum(TYPES) }).strict(), WRITES_LOCAL, ({ file: f, ...account }) => ({ added: change(f, (book) => addAccount(book, account)).result }));
  tool("books_post", "Post an entry", "Post a journal entry. Each line names an account and gives a debit or a credit as a plain amount; debits must equal credits. Nothing dated in a locked period is accepted.", z.object({ file, date, memo: z.string().max(500).default(""), lines: z.array(line).min(2) }).strict(), WRITES_LOCAL, ({ file: f, ...entry }) => {
    const done = change(f, (book) => post(book, entry));
    return shown({ posted: done.result }, done.currency);
  });
  tool("books_reverse", "Reverse an entry", "Correct a posted entry with its mirror image (debits and credits swapped), dated in an open period. The original stays in the book.", z.object({ file, seq: z.number().int().positive(), date: date.optional(), memo: z.string().max(500).optional() }).strict(), WRITES_LOCAL, ({ file: f, seq, ...rest }) => {
    const done = change(f, (book) => reverse(book, seq, rest));
    return shown({ reversal: done.result }, done.currency);
  });
  tool("books_lock", "Lock a period", "Lock the books through a date: nothing dated on or before it can be posted afterwards. A lock only moves forward.", z.object({ file, through: date }).strict(), WRITES_LOCAL, ({ file: f, through }) => ({ locked: change(f, (book) => lock(book, through)).result }));
  tool("books_trial_balance", "Trial balance", "Each account's balance as a debit or a credit, and the totals, as of a date (or now).", z.object({ file, as_of: date.optional() }).strict(), READ_ONLY, ({ file: f, as_of }) => {
    const { book, currency } = load(f);
    return shown(trialBalance(book, { asOf: as_of }), currency);
  });
  tool("books_statements", "Income statement and balance sheet", "The income statement for [from, to] and the balance sheet at as_of (or at 'to').", z.object({ file, ...range, as_of: date.optional() }).strict(), READ_ONLY, ({ file: f, from, to, as_of }) => {
    const { book, currency } = load(f);
    return shown({ income_statement: incomeStatement(book, { from, to }), balance_sheet: balanceSheet(book, { asOf: as_of ?? to }) }, currency);
  });
  tool("books_explain", "Explain a balance", "Every entry behind an account's balance, in date order, with the running balance.", z.object({ file, account: z.string(), ...range }).strict(), READ_ONLY, ({ file: f, account, from, to }) => {
    const { book, currency } = load(f);
    return shown(explain(book, account, { from, to }), currency);
  });
  tool("books_verify", "Verify a book", "Check every record: numbering, the hash chain and the same rules posting applies. Returns the head hash to keep somewhere else; a book cut short or rewritten shows against it.", z.object({ file }).strict(), READ_ONLY, ({ file: f }) => {
    const path = bookPath(f);
    if (!existsSync(path)) throw new Error(`There is no book at ${path}`);
    return verify(fromJsonl(readFileSync(path, "utf8")));
  });
  tool("books_new_keys", "Make signing keys", "Make an ML-DSA-65 (post-quantum) key pair for signing a book's head. The private key file is written readable by you only; neither file may exist already.", z.object({ private_key_file: z.string(), public_key_file: z.string() }).strict(), WRITES_LOCAL, ({ private_key_file, public_key_file }) => {
    const keys = newSigningKeys();
    writeNew(resolve(private_key_file), keys.privateKey, 0o600);
    writeNew(resolve(public_key_file), keys.publicKey);
    return { private_key_file: resolve(private_key_file), public_key_file: resolve(public_key_file), algorithm: "ml-dsa-65" };
  });
  tool("books_sign", "Sign a book's head", "Sign the book's head with an ML-DSA-65 private key. The signature is saved next to the book as <book>.sig.json, replacing any earlier one.", z.object({ file, private_key_file: z.string() }).strict(), WRITES_LOCAL, ({ file: f, private_key_file }) => {
    const { path, book } = load(f);
    const signed = signHead(book, readFileSync(resolve(private_key_file), "utf8"));
    writeFileSync(`${path}.sig.json`, `${JSON.stringify(signed, null, 2)}\n`);
    return { signature_file: `${path}.sig.json`, algorithm: signed.algorithm, records: signed.records, head: signed.head };
  });
  tool("books_check_signature", "Check a book's signature", "Check the book against a signature (by default <book>.sig.json) and the signer's public key.", z.object({ file, public_key_file: z.string(), signature_file: z.string().optional() }).strict(), READ_ONLY, ({ file: f, public_key_file, signature_file }) => {
    const { path, book } = load(f);
    const signed = JSON.parse(readFileSync(resolve(signature_file ?? `${path}.sig.json`), "utf8"));
    return checkHead(book, signed, readFileSync(resolve(public_key_file), "utf8"));
  });
  tool("books_prove", "Prove entries", "Proofs that named records are in the book, to hand to a lender, an auditor or a buyer instead of the book: each is the record and about log2(n) hashes leading to the Merkle root the owner signed with books_sign. With a signature (by default <book>.sig.json, when there is one), the proofs are for the records it signed, even after newer entries. The opening record comes too, so the reader sees the book's name and currency. books_check_proof checks them without the book.", z.object({ file, seqs: z.array(z.number().int().positive()).min(1).max(100), signature_file: z.string().optional() }).strict(), READ_ONLY, ({ file: f, seqs, signature_file }) => {
    const { path, book, currency } = load(f);
    const sig = resolve(signature_file ?? `${path}.sig.json`);
    const signed = existsSync(sig) ? JSON.parse(readFileSync(sig, "utf8")) : null;
    if (signature_file && !signed) throw new Error(`There is no signature at ${sig}`);
    const size = signed ? signed.records : book.records.length;
    if (signed && (!Number.isInteger(size) || size > book.records.length || bookRoot(book, size).root !== signed.root)) throw new Error(`The book's first ${size} records no longer match the signature in ${sig}; nothing was proved`);
    const proofs = seqs.map((seq) => proveRecord(book, seq, size));
    // Proofs carry the records exactly as stored (amounts in the smallest unit), or they would not check; readable
    // shows the same records with plain amounts.
    const readable = proofs.map(({ record: { hash, prev, ...fields } }) => fields);
    return { signature_file: signed ? sig : null, size, root: bookRoot(book, size).root, opening: proveRecord(book, 1, size), proofs, readable: shown(readable, currency) };
  });
  tool("books_check_proof", "Check proofs", "Check the proofs books_prove made, without the book: the owner's ML-DSA-65 signature over the Merkle root, with their public key, then each record's path to that root. A changed amount, a record moved or swapped, or another signature fails.", z.object({ proofs: z.object({ opening: z.any(), proofs: z.array(z.any()).min(1) }).optional(), proofs_file: z.string().optional(), signature_file: z.string(), public_key_file: z.string() }).strict(), READ_ONLY, ({ proofs, proofs_file, signature_file, public_key_file }) => {
    if (!proofs === !proofs_file) throw new Error("Give the proofs or a proofs_file, one of the two");
    const bundle = proofs ?? JSON.parse(readFileSync(resolve(proofs_file), "utf8"));
    const signed = JSON.parse(readFileSync(resolve(signature_file), "utf8"));
    const key = readFileSync(resolve(public_key_file), "utf8");
    const opening = checkProof(bundle.opening, signed, key);
    const results = (bundle.proofs ?? []).map((p) => checkProof(p, signed, key));
    const book = opening.ok && bundle.opening.record.kind === "open" ? { name: bundle.opening.record.name, currency: bundle.opening.record.currency } : null;
    return { ok: Boolean(book) && results.length > 0 && results.every((r) => r.ok), book, records: signed.records, results };
  });

  // Canli Close
  tool("close_reconcile", "Reconcile the bank", "Match a bank statement CSV (date, description, and amount or in/out columns; dates written 2026-01-31) to an account's entries: the same amount, dates at most `days` apart. Lists what is left over on each side.", z.object({ file, statement_file: z.string(), account: z.string().default("1000"), days: z.number().int().min(0).max(31).default(3), ...range }).strict(), READ_ONLY, ({ file: f, statement_file, account, days, from, to }) => {
    const { book, currency } = load(f);
    return shown(reconcile(book, readStatement(readFileSync(resolve(statement_file), "utf8"), currency), { account, days, from, to }), currency);
  });
  tool("close_bank_entries", "Bank lines into entries", "Turn the statement lines the books do not have yet into entries by rules: each rule gives text the description contains and the account on the other side ('in' or 'out' limits it to positive or negative lines); the first rule that fits is used. A line no rule fits, or one dated in a locked period, is listed, never guessed. Lines already in the books are left alone, so a second run posts nothing twice. Nothing is written unless post is true; then every entry is appended, or none.", z.object({ file, statement_file: z.string(), rules: z.array(z.object({ contains: z.string().min(1).max(200), account: z.string(), direction: z.enum(["in", "out"]).optional() }).strict()).max(500).default([]), account: z.string().default("1000"), days: z.number().int().min(0).max(31).default(3), ...range, post: z.boolean().default(false) }).strict(), APPENDS_ONCE, ({ file: f, statement_file, rules, account, days, from, to, post: write }) => {
    const propose = (book) => bankEntries(book, readStatement(readFileSync(resolve(statement_file), "utf8"), book.records[0].currency), { rules, account, days, from, to });
    if (!write) {
      const { book, currency } = load(f);
      return shown({ ...propose(book), posted: [] }, currency);
    }
    const done = change(f, (book) => {
      const out = propose(book);
      return { ...out, posted: out.entries.map((e) => post(book, e).seq) };
    });
    return shown(done.result, done.currency);
  });
  tool("close_variance", "What moved, and why", "Each account's change from a prior period to the current one, largest first, with the entries that moved it most.", z.object({ file, from: date, to: date, prior_from: date, prior_to: date, top: z.number().int().min(1).max(20).default(3) }).strict(), READ_ONLY, ({ file: f, from, to, prior_from, prior_to, top }) => {
    const { book, currency } = load(f);
    return shown(variance(book, { from, to, priorFrom: prior_from, priorTo: prior_to, top }), currency);
  });
  tool("close_checklist", "Month-end checklist", "What is left before a month can be locked. Give the bank statement to include the reconciliation.", z.object({ file, through: date, statement_file: z.string().optional(), account: z.string().default("1000"), from: date.optional() }).strict(), READ_ONLY, ({ file: f, through, statement_file, account, from }) => {
    const { book, currency } = load(f);
    const reconciliation = statement_file ? reconcile(book, readStatement(readFileSync(resolve(statement_file), "utf8"), currency), { account, from, to: through }) : undefined;
    return shown(checklist(book, { through, reconciliation }), currency);
  });
  tool("close_consolidate", "Group consolidation", "One trial balance, income statement and balance sheet for a group of companies, in one currency, from each company's book. Rates are the ECB's euro reference rates in rates_file, as the ECB publishes them: the Data Portal CSV (series EXR D.<currency>.EUR.SP00.A, format=csvdata), eurofxref-hist.csv, eurofxref.csv or the eurofxref XML. Assets and liabilities at the closing rate (as_of, or the last rate published before it); income, expenses and equity at the rate on each entry's date; the rest is the currency translation reserve. A currency the ECB does not publish (AED, SAR) takes a peg to one it does: { AED: { base: 'USD', rate: '3.6725' } }. Balances between the companies are removed in named sets of each company's own accounts; a set that does not add up to zero shows as an intercompany difference. Wholly owned companies only.", z.object({ companies: z.array(z.object({ name: z.string().min(1).max(200), file, map: z.record(z.string(), z.string()).default({}) }).strict()).min(1).max(100), currency: z.string().regex(/^[A-Za-z]{3}$/), as_of: date, from: date.optional(), rates_file: z.string().optional(), pegs: z.record(z.string().regex(/^[A-Za-z]{3}$/), z.object({ base: z.string().regex(/^[A-Za-z]{3}$/), rate: z.string() }).strict()).default({}), eliminate: z.array(z.object({ name: z.string().min(1).max(200), lines: z.array(z.object({ company: z.string(), account: z.string() }).strict()).min(2).max(100) }).strict()).max(500).default([]) }).strict(), READ_ONLY, ({ companies, currency, as_of, from, rates_file, pegs, eliminate }) => {
    const rates = rates_file ? readEcbRates(readFileSync(resolve(rates_file), "utf8")) : {};
    const out = consolidate(companies.map((c) => ({ name: c.name, map: c.map, book: load(c.file).book })), { currency, asOf: as_of, from, rates, pegs, eliminate });
    return shown(out, out.currency);
  });

  // Canli Report
  tool("report_check", "Facts and pre-filing checks", "The book's statements as US GAAP or IFRS facts, with checks for totals that do not add up, wrong signs, scale slips against prior facts, and facts given two values. Accounts with no concept are listed, never guessed. A draft for review, not a filing.", z.object({ file, as_of: date, from: date, to: date, taxonomy: z.enum(TAXONOMIES).default("us-gaap"), prior_facts_file: z.string().optional() }).strict(), READ_ONLY, ({ file: f, as_of, from, to, taxonomy, prior_facts_file }) => {
    const { book } = load(f);
    const out = toFacts(book, { asOf: as_of, from, to, taxonomy });
    const prior = prior_facts_file ? JSON.parse(readFileSync(resolve(prior_facts_file), "utf8")) : [];
    return { ...out, ...checkFacts(out.facts, { prior, taxonomy }) };
  });
  tool("report_check_sec", "Checks on SEC filings", "The same checks on each of a company's SEC filings, from the companyfacts JSON the SEC publishes (data.sec.gov/api/xbrl/companyfacts/CIK##########.json, the data canli-mcp's fundamentals tools read; this server reads only the file given): assets against liabilities and equity at every date, values below zero that never should be, a fact given two values, and a value about a thousand or a million times the last filing's for the same item (a scale slip). Findings point at facts to look at, not errors proved.", z.object({ companyfacts_file: z.string(), forms: z.array(z.string()).min(1).max(10).default([...SEC_FORMS]), last: z.number().int().min(1).max(500).default(8) }).strict(), READ_ONLY, ({ companyfacts_file, forms, last }) => checkSecFilings(JSON.parse(readFileSync(resolve(companyfacts_file), "utf8")), { forms, last }));

  // Canli Audit
  tool("audit_journal", "Journal-entry tests", "Benford's law on the amounts against Nigrini's bands, and the entries with round amounts, weekend dates, duplicates, amounts just under an approval limit, no memo, or a reversal. Analytics that point at entries to look at, not an audit opinion.", z.object({ file, round_to: amount.default("1000"), limit: amount.optional(), under: z.number().min(0).max(50).default(5), weekend: z.array(z.number().int().min(0).max(6)).default([6, 0]) }).strict(), READ_ONLY, ({ file: f, round_to, limit, under, weekend }) => journalTests(load(f).book, { roundTo: round_to, limit, under, weekend }));

  // Canli Treasury and Planning
  tool("planning_runway", "Cash runway", "Cash on a date, the average monthly change over the months ending then, and months of runway when cash is falling.", z.object({ file, through: date, cash: z.string().default("1000"), months: z.number().int().min(1).max(24).default(3) }).strict(), READ_ONLY, ({ file: f, through, cash, months }) => {
    const { book, currency } = load(f);
    return shown(runway(book, { through, cash, months }), currency);
  });
  tool("planning_budget", "Budget against actual", "Actual income and expenses for [from, to] against a budget of plain amounts per account code.", z.object({ file, budget: z.record(z.string(), amount), ...range }).strict(), READ_ONLY, ({ file: f, budget, from, to }) => {
    const { book, currency } = load(f);
    return shown({ rows: budgetVsActual(book, budget, { from, to }) }, currency);
  });
  tool("planning_forecast", "Forecast", "The next months from the monthly average of [from, to], income growing by `growth` and costs by `cost_growth` a month (0.02 is 2%). An estimate from those inputs.", z.object({ file, from: date, to: date, months: z.number().int().min(1).max(60).default(6), growth: z.number().min(-1).max(10).default(0), cost_growth: z.number().min(-1).max(10).default(0) }).strict(), READ_ONLY, ({ file: f, from, to, months, growth, cost_growth }) => {
    const { book, currency } = load(f);
    return shown(forecast(book, { from, to, months, growth, costGrowth: cost_growth }), currency);
  });
  tool("planning_dcf", "Discounted cash flow value", "Present value of yearly cash flows at a discount rate, plus a terminal value, with every input returned. An estimate from those inputs, not advice.", z.object({ cash_flows: z.array(z.number()).min(1).max(50), rate: z.number(), terminal_growth: z.number().default(0) }).strict(), READ_ONLY, ({ cash_flows, rate, terminal_growth }) => dcf({ cashFlows: cash_flows, rate, terminalGrowth: terminal_growth }));

  // Canli Data
  const writePack = (out_dir, pack) => {
    const dir = resolve(out_dir);
    mkdirSync(dir, { recursive: true });
    writeNew(join(dir, "data.csv"), pack.csv);
    writeNew(join(dir, "README.md"), pack.card);
    return { out_dir: dir, files: ["data.csv", "README.md"], rows: pack.rows, sha256: pack.sha256 };
  };
  tool("data_pack", "Pack a dataset", "Write rows as data.csv with its SHA-256 and a Hugging Face dataset card (README.md) naming the source and licence, into a folder. Refuses to overwrite either file.", z.object({ out_dir: z.string(), name: z.string(), title: z.string().optional(), description: z.string().optional(), source: z.string().min(1), license: z.string().min(1), columns: z.array(z.object({ name: z.string(), description: z.string().optional() }).strict()).min(1), rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))) }).strict(), WRITES_LOCAL, ({ out_dir, ...spec }) => writePack(out_dir, packDataset(spec)));
  // Saved companyfacts files, each with its SHA-256 and the day it was saved, named in the dataset card so anyone
  // with the same files can rebuild the pack.
  const SEC_SOURCE = "The SEC's XBRL company facts API (data.sec.gov/api/xbrl/companyfacts), in the files listed above";
  const companyfactsFiles = z.array(z.string()).min(1).max(500);
  const readCompanyfacts = (files) => files.map((f) => {
    const path = resolve(f);
    const bytes = readFileSync(path);
    return { facts: JSON.parse(bytes.toString("utf8")), sha256: createHash("sha256").update(bytes).digest("hex"), saved: statSync(path).mtime.toISOString().slice(0, 10) };
  });
  const inputLines = (inputs) => inputs.map(({ facts, sha256, saved }) => `- ${facts.entityName ?? "Unnamed"} (CIK ${facts.cik ?? "not given"}): companyfacts saved ${saved}, SHA-256 ${sha256}`);
  const companies = (n) => (n === 1 ? "one company" : `${n} companies`);
  tool("data_pack_sec_first_filed", "Pack SEC facts as first filed", "From companyfacts JSON files (data.sec.gov/api/xbrl/companyfacts/CIK##########.json, saved beforehand; this server reads only the files given), one row per company, concept, unit and period: the value in the first filing that reported it and in the latest, with their accession numbers, forms and dates, and how many different values were filed. Written as data.csv with its SHA-256 and a dataset card that names each input file's SHA-256, so anyone with the same files can rebuild it. Refuses to overwrite either file.", z.object({ companyfacts_files: companyfactsFiles, out_dir: z.string(), name: z.string(), title: z.string().optional(), license: z.string().min(1), forms: z.array(z.string()).min(1).max(20).default([...FIRST_FILED_FORMS]) }).strict(), WRITES_LOCAL, ({ companyfacts_files, out_dir, name, title, license, forms }) => {
    const inputs = readCompanyfacts(companyfacts_files);
    const rows = inputs.flatMap(({ facts }) => firstFiled(facts, { forms }));
    const changed = rows.filter((r) => r.values > 1).length;
    const description = [
      `Facts from the SEC filings of ${companies(inputs.length)} (forms ${forms.join(", ")}), each with the value as first filed and as last filed: ${changed} of ${rows.length} changed after they were first filed. A change may be a restatement, a reclassification or a correction; the accession numbers name the filings to read.`,
      "",
      ...inputLines(inputs),
    ].join("\n");
    const pack = packDataset({ name, title: title ?? "SEC facts as first filed", description, source: SEC_SOURCE, license, columns: FIRST_FILED_COLUMNS, rows });
    return { ...writePack(out_dir, pack), companies: inputs.length, changed };
  });
  tool("data_pack_sec_findings", "Pack Report's flags on SEC filings", "Report's checks (report_check_sec) on every filing in companyfacts JSON files saved beforehand, one row per finding: the filing (accession, form, date), the rule (scale, balance, sign or duplicate), the concept, unit, period and value, the value a scale flag was compared with, and the check's own words. Flags point at facts to look at, not errors proved. Written as data.csv with its SHA-256 and a dataset card that names each input file's SHA-256. Refuses to overwrite either file.", z.object({ companyfacts_files: companyfactsFiles, out_dir: z.string(), name: z.string(), title: z.string().optional(), license: z.string().min(1), forms: z.array(z.string()).min(1).max(10).default([...SEC_FORMS]) }).strict(), WRITES_LOCAL, ({ companyfacts_files, out_dir, name, title, license, forms }) => {
    const inputs = readCompanyfacts(companyfacts_files);
    const checked = inputs.map(({ facts }) => checkSecFilings(facts, { forms, last: Infinity }));
    const rows = checked.flatMap(findingRows);
    const filings = checked.reduce((t, c) => t + c.checked, 0);
    const flagged = checked.reduce((t, c) => t + c.withFindings, 0);
    const counts = {};
    for (const r of rows) counts[r.rule] = (counts[r.rule] ?? 0) + 1;
    const back = rows.filter((r) => r.prior_flagged).length;
    const description = [
      `Canli Report's checks on every ${forms.join(", ")} filing of ${companies(inputs.length)}: ${rows.length} flag${rows.length === 1 ? "" : "s"} in ${flagged} of ${filings} filings (${Object.entries(counts).map(([rule, n]) => `${rule} ${n}`).join(", ") || "none"})${back ? `, of which ${back} are values back to scale after the filing before slipped (prior_flagged)` : ""}. A flag points at a fact to look at, not an error proved: read the filing named.`,
      "",
      ...inputLines(inputs),
    ].join("\n");
    const pack = packDataset({ name, title: title ?? "Flags on SEC filings", description, source: SEC_SOURCE, license, columns: FINDING_COLUMNS, rows });
    return { ...writePack(out_dir, pack), companies: inputs.length, filings, flagged, counts };
  });
}

const isMain = (() => {
  try {
    return realpathSync(process.argv[1] ?? "") === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (isMain) {
  const server = new McpServer(SERVER_INFO, { instructions: INSTRUCTIONS });
  registerTools(server);
  await server.connect(new StdioServerTransport());
}
