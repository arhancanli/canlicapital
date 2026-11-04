// The book most tests start from: a small Dubai company's first month. Share capital paid in on Friday 2
// January 2026, a sale with VAT on Saturday the 10th, rent on Thursday the 15th.
import { smallBusiness } from "../src/chart.mjs";
import { openBook, post } from "../src/ledger.mjs";

export function month() {
  const book = openBook({ name: "Example Trading LLC", currency: "AED", accounts: smallBusiness() });
  post(book, { date: "2026-01-02", memo: "Share capital paid in", lines: [{ account: "1000", debit: "50000" }, { account: "3000", credit: "50000" }] });
  post(book, { date: "2026-01-10", memo: "Invoice 1, with VAT at 5%", lines: [{ account: "1100", debit: "1050" }, { account: "4000", credit: "1000" }, { account: "2100", credit: "50" }] });
  post(book, { date: "2026-01-15", memo: "January rent", lines: [{ account: "6100", debit: "3000" }, { account: "1000", credit: "3000" }] });
  return book;
}

export const seqsOf = (book, memo) => book.records.filter((r) => r.memo === memo).map((r) => r.seq);
