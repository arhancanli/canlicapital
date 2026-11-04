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
  Continuous close (`entryChecks`, run by `books_post` on every entry it writes): the close's checks on the new entry at once, so a month closes as it goes. The journal tests that flag it (round amounts, a weekend date, the same as another entry, just under an approval limit, no memo) come back with the post, and, given the bank statement, so does the statement line that matches its cash line, or the fact that none has come in yet, with the gap between the cash account and the statement. A bad statement file, account or limit is refused before anything is written.
- `proof.mjs`, provable entries: any record shown to a lender, an auditor or a buyer with a proof that it is in the book, without handing over the book. The record hashes are the leaves of a Merkle tree built as Certificate Transparency builds its logs (RFC 9162); the owner's ML-DSA-65 signature covers its root, so a proof is the record and about log2(n) hashes (ten for a thousand records) checked against the signature alone, and it keeps checking after newer entries.
- `group.mjs`, Canli Close group consolidation: each company's book translated into one currency with the ECB's euro reference rates (read from the Data Portal CSV, eurofxref-hist.csv, eurofxref.csv or the eurofxref XML), assets and liabilities at the closing rate, income, expenses and equity at the rate on each entry's date, the rest in the currency translation reserve; a currency the ECB does not publish (AED, SAR) pegged to one it does; balances between the companies eliminated in named sets, and a set that does not add up to zero shown as an intercompany difference. Wholly owned companies only, with no goodwill or non-controlling interests yet.
- `report.mjs`, Canli Report: statements as US GAAP or IFRS facts, and checks for totals that do not add up, wrong signs, scale slips and facts given twice. An account with no concept is listed, never guessed; check every concept against your taxonomy year before filing.
  The same facts as an xBRL-JSON report (`report_xbrl_json`), XBRL International's Open Information Model in JSON, which XBRL processors and other agents read without XML: each fact with its concept, entity, period and unit, amounts in the currency's major unit. US GAAP takes a year for its namespace and schema; IFRS needs the namespace and schema of the release you file under.
  The same checks run on any company's SEC filings, one by one, from the companyfacts JSON the SEC publishes (`report_check_sec`): totals period by period (with minority interests and temporary equity where tagged), and a scale slip only when a value is within 10% (5% for a flow) of a thousand or a million times the last filing's. On every filing of Apple, Microsoft, JPMorgan, Simon Property Group and TSMC (284), 9 were flagged, among them Apple's shares authorized and issued filed in thousands in an April 2014 10-Q and JPMorgan's pledged securities filed a thousand times too large in its 2013 10-K.
- `audit.mjs`, Canli Audit: Benford's law against Nigrini's bands, and journal-entry tests for round amounts, weekend dates, duplicates, amounts just under an approval limit, missing memos and reversals. Analytics, not an audit opinion.
- `planning.mjs`, Canli Treasury and Planning: cash runway, budget against actual, a forecast from trailing months, and a discounted cash flow value that returns every input.
- `data.mjs`, Canli Data: a table packed as CSV with its SHA-256 and a dataset card in Hugging Face's format.
  The first pack is SEC facts as first filed (`data_pack_sec_first_filed`). Each row is a company, concept, unit and period: the value in the first filing that reported it, the value in the latest, and how many different values were filed in between. The card names each input file's SHA-256, so anyone with the same companyfacts files can rebuild it. On the five companies Report was tuned on (files saved 3 Nov 2026), 2,275 of 68,319 values changed after they were first filed. The largest changes at Apple are its share counts after the 4-for-1 split of 2020: 12.6 billion authorized shares at 28 September 2019 in four filings, then 50.4 billion in the 2020 10-K.
  The second is Report's flags on SEC filings (`data_pack_sec_findings`): `report_check_sec` on every filing, one row per flag, with the filing, the rule, the concept, unit, period and value, and the value a scale flag was compared with. `prior_flagged` marks a value back to scale after the filing before it slipped, so the earlier filing is the one to read. On the same five companies: 24 flags in 9 of 284 filings. Six are back to scale (Simon's 10-Qs of May 2012 and November 2016). The rest point at seven filings: real slips at Apple (10-Q of April 2014, share counts in thousands), JPMorgan (10-Q of August 2010, assets off their total; 10-K of February 2013, pledged securities a thousand times too large) and Simon (10-Qs of November 2011 and August 2016), and a real 999-fold change at Microsoft, reported in two 10-Qs.
- `sign.mjs`: a book's head signed with ML-DSA-65, a post-quantum signature, which pins the whole history.
  Statements for another agent (`books_share_statements`, `books_check_statements`): the income statement for a period and the balance sheet at its end, signed together with the book's head, written to a file a company's agent hands to a lender's or buyer's agent instead of a PDF. The other side checks the file with the public key alone (the signature over canonical JSON, so another program's key order does not matter, the head inside, and that the figures add up), and any entry behind a figure can be proved against the same file with `books_prove` and `books_check_proof`.

Each becomes its own package when it ships on its own.

## The MCP server

`node src/server.mjs` serves 32 tools over stdio: `books_*` (open, accounts, post, reverse, lock, trial balance, statements, explain, verify, keys, sign, check a signature, prove entries, check proofs, share signed statements, check them), `close_reconcile`, `close_bank_entries`, `close_variance`, `close_checklist`, `close_consolidate`, `report_check`, `report_xbrl_json`, `report_check_sec`, `audit_journal`, `planning_runway`, `planning_budget`, `planning_forecast`, `planning_dcf`, `data_pack`, `data_pack_sec_first_filed` and `data_pack_sec_findings`. A book is a `.jsonl` file you name. Every write reads the whole book and checks every record first, then appends; a book that does not verify is never written to, and no tool overwrites a file.

The starting chart of accounts includes VAT and corporate tax accounts for UAE companies. It is a list of accounts, not tax or accounting advice.

MIT licensed.
