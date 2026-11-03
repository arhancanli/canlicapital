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

Next: the MCP server, so an AI assistant can keep books under these rules; then bank import and reconciliation.

The starting chart of accounts includes VAT and corporate tax accounts for UAE companies. It is a list of accounts, not tax or accounting advice.

MIT licensed.
