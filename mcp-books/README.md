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
- `close.mjs`, Canli Close: bank statements read from CSV and matched to the books, what moved between two periods and the entries that moved it, and the checklist before a month is locked.
- `report.mjs`, Canli Report: statements as US GAAP or IFRS facts, and checks for totals that do not add up, wrong signs, scale slips and facts given twice. An account with no concept is listed, never guessed; check every concept against your taxonomy year before filing.
- `audit.mjs`, Canli Audit: Benford's law against Nigrini's bands, and journal-entry tests for round amounts, weekend dates, duplicates, amounts just under an approval limit, missing memos and reversals. Analytics, not an audit opinion.
- `planning.mjs`, Canli Treasury and Planning: cash runway, budget against actual, a forecast from trailing months, and a discounted cash flow value that returns every input.
- `data.mjs`, Canli Data: a table packed as CSV with its SHA-256 and a dataset card in Hugging Face's format.
- `sign.mjs`: a book's head signed with ML-DSA-65, a post-quantum signature, which pins the whole history.

Each becomes its own package when it ships on its own. Next: the MCP server, so an AI assistant can use all of it.

The starting chart of accounts includes VAT and corporate tax accounts for UAE companies. It is a list of accounts, not tax or accounting advice.

MIT licensed.
