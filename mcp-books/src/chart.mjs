// mcp-books/src/chart.mjs
//
// A starting chart of accounts for a small trading or services company: 1 assets, 2 liabilities,
// 3 equity, 4 income, 5 and 6 expenses. Rename, remove or add to suit. The VAT and corporate tax accounts
// are there because UAE companies need them (VAT at 5%; corporate tax at 9% above AED 375,000 since June
// 2023). It is a list of accounts, not tax advice. Accumulated depreciation is an asset account that
// carries a credit balance, so it shows as a negative asset.
const SMALL_BUSINESS = [
  ["1000", "Cash at bank", "asset"],
  ["1100", "Accounts receivable", "asset"],
  ["1150", "VAT recoverable", "asset"],
  ["1200", "Inventory", "asset"],
  ["1500", "Equipment", "asset"],
  ["1590", "Accumulated depreciation", "asset"],
  ["2000", "Accounts payable", "liability"],
  ["2100", "VAT payable", "liability"],
  ["2200", "Accrued expenses", "liability"],
  ["2300", "Corporate tax payable", "liability"],
  ["2500", "Loans", "liability"],
  ["3000", "Share capital", "equity"],
  ["3100", "Retained earnings", "equity"],
  ["4000", "Sales", "income"],
  ["4100", "Other income", "income"],
  ["5000", "Cost of sales", "expense"],
  ["6000", "Salaries", "expense"],
  ["6100", "Rent", "expense"],
  ["6200", "Utilities", "expense"],
  ["6300", "Software and subscriptions", "expense"],
  ["6400", "Depreciation", "expense"],
  ["6500", "Bank charges", "expense"],
  ["6900", "Corporate tax", "expense"],
];

export const smallBusiness = () => SMALL_BUSINESS.map(([code, name, type]) => ({ code, name, type }));
