# Canli Books

Double-entry books for AI agents and apps. Work in progress: version 0.1 is not on npm yet.

What it holds to:

- Every entry balances. Amounts are kept as whole numbers of the currency's smallest unit (cents, fils, yen), and an amount that cannot be read exactly is refused, not rounded.
- A posted entry never changes. A mistake is corrected with a reversing entry, and the original stays in the book.
- A locked period takes no new entries.
- Each record carries the hash of the one before it, so an edit anywhere in the history shows. Keep the head hash that `verify()` returns somewhere else, and a book cut short or rewritten in full shows too.
- Trial balance, income statement and balance sheet on demand, and `explain()` lists the entries behind any balance.

The book is one plain file, one JSON record per line, kept by whoever owns the books.

```js
import { openBook, post, trialBalance } from "canli-books-mcp/src/ledger.mjs";
import { smallBusiness } from "canli-books-mcp/src/chart.mjs";

const book = openBook({ name: "Example Trading LLC", currency: "AED", accounts: smallBusiness() });
post(book, { date: "2026-01-02", memo: "Share capital paid in", lines: [{ account: "1000", debit: "50000" }, { account: "3000", credit: "50000" }] });
trialBalance(book);
```

## Every Canli company's core, on the same engine

- `ledger.mjs`, Canli Books: the double-entry core above.
- `close.mjs`, Canli Close: bank statements read from CSV and matched to the books, the lines the books do not have yet turned into entries by rules (a line no rule fits is listed, never guessed), what moved between two periods and the entries that moved it, and the checklist before a month is locked.
- `proof.mjs`, provable entries: any record shown to a lender, an auditor or a buyer with a proof that it is in the book, without handing over the book. The record hashes are the leaves of a Merkle tree built as Certificate Transparency builds its logs (RFC 9162); the owner's ML-DSA-65 signature covers its root, so a proof is the record and about log2(n) hashes (ten for a thousand records) checked against the signature alone, and it keeps checking after newer entries.
- `group.mjs`, Canli Close group consolidation: each company's book translated into one currency with the ECB's euro reference rates (read from the Data Portal CSV, eurofxref-hist.csv, eurofxref.csv or the eurofxref XML), assets and liabilities at the closing rate, income, expenses and equity at the rate on each entry's date, the rest in the currency translation reserve; a currency the ECB does not publish (AED, SAR) pegged to one it does; balances between the companies eliminated in named sets, and a set that does not add up to zero shown as an intercompany difference. Wholly owned companies only, with no goodwill or non-controlling interests yet.
- `report.mjs`, Canli Report: statements as US GAAP or IFRS facts, and checks for totals that do not add up, wrong signs, scale slips and facts given twice. An account with no concept is listed, never guessed; check every concept against your taxonomy year before filing.
  The same checks run on any company's SEC filings, one by one, from the companyfacts JSON the SEC publishes (`report_check_sec`): totals period by period (with minority interests and temporary equity where tagged), and a scale slip only when a value is within 10% (5% for a flow) of a thousand or a million times the last filing's. On every filing of Apple, Microsoft, JPMorgan, Simon Property Group and TSMC (284), 9 were flagged, among them Apple's shares authorized and issued filed in thousands in an April 2014 10-Q and JPMorgan's pledged securities filed a thousand times too large in its 2013 10-K.
- `audit.mjs`, Canli Audit: Benford's law against Nigrini's bands, and journal-entry tests for round amounts, weekend dates, duplicates, amounts just under an approval limit, missing memos and reversals. Analytics, not an audit opinion.
- `planning.mjs`, Canli Treasury and Planning: cash runway, budget against actual, a forecast from trailing months, and a discounted cash flow value that returns every input.
- `data.mjs`, Canli Data: a table packed as CSV with its SHA-256 and a dataset card in Hugging Face's format.
- `sign.mjs`: a book's head signed with ML-DSA-65, a post-quantum signature, which pins the whole history.

Each becomes its own package when it ships on its own.

## The MCP server

`node src/server.mjs` serves 27 tools over stdio: `books_*` (open, accounts, post, reverse, lock, trial balance, statements, explain, verify, keys, sign, check a signature, prove entries, check proofs), `close_reconcile`, `close_bank_entries`, `close_variance`, `close_checklist`, `close_consolidate`, `report_check`, `report_check_sec`, `audit_journal`, `planning_runway`, `planning_budget`, `planning_forecast`, `planning_dcf` and `data_pack`. A book is a `.jsonl` file you name. Every write reads the whole book and checks every record first, then appends; a book that does not verify is never written to, and no tool overwrites a file.

The starting chart of accounts includes VAT and corporate tax accounts for UAE companies. It is a list of accounts, not tax or accounting advice.

MIT licensed.
