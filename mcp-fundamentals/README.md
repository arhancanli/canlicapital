# canli-fundamentals-mcp

SEC company fundamentals **point in time**, as an MCP server. For any value a company reported in
XBRL, it tells your AI assistant three things: what was **first reported**, what the **latest**
filing says, and what was **known on a given date**. Every value comes with the filing behind it.

That difference matters. Apple's diluted EPS for fiscal 2018 was 11.91 in the annual reports of
2018 and 2019, and 2.98 in the 2020 report, after its 4-for-1 split. A backtest that reads today's
data for a 2018 decision uses a number nobody saw in 2018. Apple's accounts payable at the end of
fiscal 2017 was first reported as $49.05B and changed to $44.24B a year later. Of 3,827 annual
periods Apple has reported, 190 now read differently from their first report, not counting 35
per-share and share-count changes from its stock splits.

```bash
npx -y canli-fundamentals-mcp
```

Claude Code:

```bash
claude mcp add canli-fundamentals -- npx -y canli-fundamentals-mcp
```

Hosted, no install (claude.ai connectors, ChatGPT, Cursor, or any client that takes a URL):

```bash
claude mcp add --transport http canli-fundamentals https://canlicapital.com/mcp/fundamentals
```

Claude Desktop, Cursor or any MCP client (`mcpServers` in its config):

```json
{
  "mcpServers": {
    "canli-fundamentals": { "command": "npx", "args": ["-y", "canli-fundamentals-mcp"] }
  }
}
```

Then ask things like "What did Apple report as of 31 December 2018?", "Which of Microsoft's annual
numbers were restated?", "Show Toyota's revenue since 2015" or "Show every filing that reported
Apple's 2017 accounts payable".

## Tools

| Tool | What it returns |
|---|---|
| `known_as_of` | For each measure, the most recent period filed on or before a date and its value as it stood then. Flags values later restated (`changed_after`) and measures the company stopped reporting (`stale`). Defaults to ten common measures. With `ratios: true`, adds margins, return on equity and assets, liabilities to equity and free cash flow computed only from those filings, each listing its inputs and their filings. The point-in-time primitive for backtests. |
| `history` | One measure over time, newest first: `first_reported` (default), `latest`, or as known on an `as_of` date. Annual, quarterly or all periods. |
| `restatements` | Periods whose latest value differs from the first report, with both values, the percent change and a cause: `split`, `split_likely`, `tag_change`, or none (a restatement, reclassification or correction). Scans every concept when none is given. |
| `vintages` | Every filing that reported one period of one measure, oldest first. |
| `list_concepts` | The concepts a company reports and the plain names it supports, with units, period counts, date range and restated-period counts. |
| `find_company` | Companies matching a name, ticker or CIK, best first, with their CIKs and tickers, and which one the other tools would read. |
| `cross_section` | One measure for up to 50 companies (tickers, CIKs or names) as filed by a date: each company's latest period, its value then, the filing, and whether it was later restated. The point-in-time building block of a peer comparison or a factor. |

All seven tools are read-only.

A cross-section indexes only the measure asked for in each company's snapshot and keeps none of
them in memory, so fifty companies cost about as much memory as one. Checked against an independent
Python selection over the same SEC snapshots (`scripts/research/fundamentals-pit-check/` in the
canlicapital repository): 20 companies on 3 dates, `NetIncomeLoss`, annual, 60 of 60 identical in
value, period, filed date, accession number and `changed_after`, including 5 where neither side had
a value (Meta before its first 10-K, for example). Fiscal years end on different dates, so compare
`end` before comparing values.

### Naming a company

`company` takes a ticker (`AAPL`), an SEC CIK (`320193`) or a name (`Exxon Mobil`, `Alphabet`,
`Goldman Sachs`). Names are compared without case, punctuation or trailing legal words (Inc, Corp,
Holdings), and a result read by name says how it was resolved in `company.matched`. A name is used
only when one company is clearly meant: the only company with that name or name start, or the only
one of them with a current ticker (Alphabet Inc. rather than Alphabet Holding Company). Otherwise
the error lists the candidates with their CIKs, and `find_company` shows them ranked.

Some tickers now belong to companies outside the reference. `XOM` is the SEC's ticker for
ExxonMobil Holdings Corp (CIK 2115436), a new holding company; the server reads the covered filer
with the same name, Exxon Mobil Corporation (CIK 34088), and says so. Former tickers are not listed:
search by name (`Twitter`) or use the CIK.

### Naming a measure

Use a **plain name** and the server follows the measure across the tags a company has used for it.
Apple's revenue was `SalesRevenueNet` until fiscal 2017 and
`RevenueFromContractWithCustomerExcludingAssessedTax` from 2018; Toyota's figures moved from us-gaap
to IFRS. Each value names the tag it came from.

| Plain name | Tags, in order of preference |
|---|---|
| `revenue` | Revenues, RevenueFromContractWithCustomerExcludingAssessedTax, RevenueFromContractWithCustomerIncludingAssessedTax, SalesRevenueNet, ifrs-full:Revenue, ifrs-full:RevenueFromContractsWithCustomers |
| `net_income` | NetIncomeLoss, ifrs-full:ProfitLossAttributableToOwnersOfParent, ProfitLoss, ifrs-full:ProfitLoss |
| `operating_income` | OperatingIncomeLoss, ifrs-full:ProfitLossFromOperatingActivities |
| `gross_profit` | GrossProfit, ifrs-full:GrossProfit |
| `eps_diluted`, `eps_basic` | EarningsPerShareDiluted or Basic, ifrs-full:DilutedEarningsLossPerShare or BasicEarningsLossPerShare |
| `assets`, `liabilities` | Assets or Liabilities, and the ifrs-full tags of the same name |
| `equity` | StockholdersEquity, ifrs-full:EquityAttributableToOwnersOfParent, StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest, ifrs-full:Equity |
| `cash` | CashAndCashEquivalentsAtCarryingValue, ifrs-full:CashAndCashEquivalents, CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents |
| `operating_cash_flow` | NetCashProvidedByUsedInOperatingActivities, ifrs-full:CashFlowsFromUsedInOperatingActivities |
| `diluted_shares` | WeightedAverageNumberOfDilutedSharesOutstanding, ifrs-full:AdjustedWeightedAverageShares |
| `shares_outstanding` | dei:EntityCommonStockSharesOutstanding, CommonStockSharesOutstanding |
| `capex` | PaymentsToAcquirePropertyPlantAndEquipment, ifrs-full:PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities, PaymentsToAcquireProductiveAssets |

Common variants work too (`sales`, `revenues`, `EPS`, `total_assets`). Any **XBRL tag** also works
(`AccountsPayableCurrent`), us-gaap by default; a tag that exists in two taxonomies is read from
both, and a prefix picks one (`us-gaap:Assets`, `dei:EntityCommonStockSharesOutstanding`). A tag the
company stopped using comes back with `newer_series`, naming the plain name that continues it.

## Where the numbers come from, and how you can check them

For every company in its reference, [canlicapital.com](https://canlicapital.com/companies) serves
the SEC's XBRL companyfacts response byte for byte, as a gzip snapshot, and names the snapshot's
SHA-256 in the company's record. This server:

1. resolves a ticker from `https://canlicapital.com/api/v1/company-tickers.json`, and a name from
   the company name index at `/api/v1/company-names.json`;
2. reads the company record at `/company-data/{CIK}.json`;
3. downloads the snapshot it names and refuses it unless its SHA-256 matches;
4. computes everything else on your machine.

Those GETs are the only network traffic. Each result names the snapshot (its date, hash, URL and the
SEC URL it came from), so you can fetch the same file from the SEC and compare. Snapshots change
when the company reference is released again; `snapshot.age_days` on every result says how old the
one you read is.

The ticker list, the name index and company records are kept on disk and used for six hours without
asking, then revalidated by their ETag; if the site cannot be reached, the copy on disk is used.
With the disk warm, the first call for a company in a new process took 38 to 72 ms in our
measurement (AAPL, JPM, MSFT).

How periods are handled:

- A period is its start and end date. A quarter and a year-to-date figure that end on the same day
  are different periods, and values are never merged across them.
- Durations of 350 to 380 days are annual (52- and 53-week years included). Durations of 80 to 125
  days are quarterly, which covers 12- to 17-week quarters such as Kroger's 16-week first quarter.
  Anything else (six- and nine-month year-to-date figures) appears only under `periods: "all"`.
- A balance (an instant) takes the kind of the report that first carried it: year-end balances are
  first reported in annual reports, interim balances in 10-Qs and 6-Ks.
- `first_reported` is the earliest filing by filed date, then accession number. With `as_of`, only
  filings made on or before that date exist, for every basis, so nothing filed later can leak in.
- When one filing reports a period under two tags of a plain name, the value comes from the tag
  that first reported the period, so a second definition in the same filing is not read as a
  revision.
- Filing-fee exhibits (the `ffd` taxonomy) and registration statements (424B prospectuses, S- and
  F- forms) are left out: they repeat facts that are not periodic results.
- A split is recognised when the change matches a split ratio the company reported
  (`StockholdersEquityNoteStockSplitConversionRatio1`). With no reported ratio, a per-share or share
  change by a whole ratio from 2 to 20 is marked `split_likely`. Both are left out of
  `restatements` unless `include_splits` is set. A value that changed and later went back to its
  first report is counted in `changed_then_reverted`, not listed.

## Limits

- Values are as the SEC's companyfacts API reports them in the snapshot named with each result.
  Filings made after the snapshot date are missing: each result gives the snapshot's `age_days`,
  and `snapshot_note` says so when `as_of` is later than the snapshot.
- `tag_change` means the first and latest values come from different tags of a plain name. That can
  be a real restatement or two definitions of the measure; read both filings.
- Results are capped at 10,000 characters of rows, newest first; `truncated` says when rows were
  cut. `list_concepts` and `restatements` page with `offset` and give `next_offset` while rows
  remain.
- `filed` is the date a filing reached EDGAR. To avoid lookahead, treat a value as known from the
  next trading day after it was filed.
- A changed value can be a restatement, a reclassification or a correction; the accession number
  names the filing to read.
- Coverage is the 12,738 SEC filers in the Canli company reference, 5,277 of them with a current
  ticker (6,415 tickers). A company outside it returns an error naming its CIK.
- Company-reported data. Not investment advice.

## Settings

| Variable | Default | What it does |
|---|---|---|
| `CANLI_CACHE_DIR` | `~/.cache/canli-fundamentals` | Where snapshots (named by their SHA-256, so a cached file can never go stale) and the ticker list, name index and records (revalidated after six hours) are cached, owner-only. Set it to an empty value to keep nothing on disk. Memory holds the eight most recently used companies. |
| `CANLI_API_BASE` | `https://canlicapital.com` | The site to read from. |

## Part of the Canli MCP family

- [canli-validation-mcp](https://github.com/arhancanli/canli-validation-mcp): checks whether a
  backtest is real (deflated Sharpe, probability of overfitting, minimum track record).
- [canli-research-mcp](https://github.com/arhancanli/canlicapital/tree/main/mcp-research): Canli
  Capital's open research record.

Code MIT. The SEC filings and XBRL facts are U.S. government works in the public domain; Canli
Capital's selection and derived data are CC BY 4.0 (credit "Canli Capital (canlicapital.com)").


## Repository audit example (Unreleased)

Backtest developers can call the supplied-vintage audit core through the separate
[local stdio example](AUDIT_INPUTS.md#repository-stdio-mcp-example-unreleased).
It reads the exact reference, usage and settings bytes supplied by the client,
keeps every selected row, and makes missing or uncertain outcomes visible.
The complete repository checkout and its pinned package dependencies are required.
The canonical helper lives outside this npm package; `npx canli-fundamentals-mcp`
and the hosted endpoint continue to expose the existing seven tools.


## Opt-in package audit command (Unreleased)

The next substantial fundamentals release is preparing the separate
`canli-fundamentals-audit` command. This candidate packages its own exact canonical
helper, supplied-input core and stdio adapter, plus [the input contract](AUDIT_INPUTS.md#portable-opt-in-package-command-unreleased).
It requires no repository checkout. The existing repository example above remains
unchanged; its original helper location does not describe this new packaged copy.

After a reviewed candidate tarball has been placed in a private installation,
configure an MCP client with the absolute path to
`node_modules/.bin/canli-fundamentals-audit`, and supply the four exact input fields
described in the contract. This command lists one `audit_inputs` tool.
`canli-fundamentals-mcp` and hosted endpoints still list the existing seven tools.
The new command has not been published to npm; version0.5.0 is unchanged while
PRIMARY assembles the substantial release. Do not use a current npm download as
evidence that this Unreleased command is available.


## Unreleased: offline expert-submission audit

The repository candidate adds the separate opt-in `canli-expert-submission-audit`
command. It audits supplied packet and review bytes while preserving the complete
selected denominator, missing roles and unknown human/expert/rights outcomes.
See [the standalone packaged contract and synthetic SDK workflow](EXPERT_SUBMISSIONS.md).
The command is not included in the already published `0.5.0` artifact. The default
seven-tool server and `canli-fundamentals-audit` retain their existing behavior.


## Unreleased supplied-file audit client

The candidate package adds `canli-fundamentals-audit-files`, an offline convenience command over the existing compact audit. It preserves all selected rows, exact supplied-byte bindings and unknown outcomes, and closes its one owned stdio child before success. See [the complete fictional file workflow](AUDIT_INPUTS_CLIENT.md). This candidate is not an npm release or an installation/adoption measurement.

```sh
canli-fundamentals-audit-files --root "$PACKAGE_ROOT" --reference "$REFERENCE" --expected-reference-sha256 "$REFERENCE_SHA256" --usage "$USAGE" --settings "$SETTINGS"
```

All paths must be absolute; `PACKAGE_ROOT` is this same admitted package and `REFERENCE_SHA256` pins the exact reference bytes. The five flags occur once each. The default seven-tool command and existing audit commands keep their behavior.


### Supplied-file expert reconciliation (Unreleased)

The candidate package command `canli-expert-submission-files` audits caller-owned
local gold, intake, evidence and reviewer-return files through the unchanged
expert-submission core. [EXPERT_SUBMISSION_FILES.md](EXPERT_SUBMISSION_FILES.md)
provides six complete synthetic input blocks and a private exclusive-output
workflow. The command preserves the full selected denominator, missing-role
worklists, exact raw bindings and unknown human/expertise/independence/rights
outcomes. It needs no SDK child or network. This is a source candidate;
the unchanged `0.5.0` field is not evidence of npm availability or publication.


## Supplied-file expert SDK client (Unreleased)

The opt-in `canli-expert-submission-client` captures explicitly supplied private
files and calls the existing local expert stdio audit once through locked SDK2.1
legacy negotiation. [EXPERT_SUBMISSION_CLIENT.md](EXPERT_SUBMISSION_CLIENT.md)
contains six complete synthetic inputs and the command. It saves the complete
report privately while preserving raw bindings, all selected rows, missing roles
and unknown human/expertise/independence/rights/label/adjudication outcomes.

Observed15s work and one5s closure/output/terminal reserve share an absolute clock;
encoded request/report/tool/frame bounds are enforced before native effects.
Known same-child closure and exclusive0600/fsync/readback output are required for
success. The direct no-SDK expert file command remains unchanged. This repository
candidate and its new cases are written until exact new-head automaticCI; no
installation/publication/adoption or authenticated-source claim follows.


### Supplied-file expert intake preparation (Unreleased)

The opt-in `canli-expert-intake-files` command prepares the complete expert-intake
report from four explicit supplied files and zero to64 ordered opaque evidence
files. [The complete synthetic workflow](EXPERT_INTAKE_FILES.md) uses package-local
source and starts no SDK child. It preserves full selected-N, blank reviewer
packets and adjudicator worklists; real humans, expertise, independence, rights,
labels and admission remain unverified/NULL. Private exclusive output is fsynced
and read back, with uncertainty refusing and retaining the artifact. This is a
repository Unreleased source candidate; npm availability and installation are
separate. Fixtures are WRITTEN_UNRUN before this signed source's remote CI.


### Supplied-byte expert-intake preparation (Unreleased)

The opt-in `canli-expert-intake-prepare` command exposes one
`filingfacts_prepare_expert_intake` tool over the supplied-byte preparation core.
Use [EXPERT_INTAKE_STDIO.md](EXPERT_INTAKE_STDIO.md) for the complete package SDK
workflow and four marked synthetic input documents. The tool retains the entire
preparation report, two blank same-gold reviewer packets, and the distinct
adjudicator worklist. All selected items and missing-role/evidence coverage remain
visible; authenticated humans, expertise, independence, rights, labels and
admission remain unknown.

Original request keys and all bounded base64 metadata are admitted before payload
decode. The complete report appears both as structured content and exact JSON text.
The standalone endpoint uses the same absolute work clock through projection and
serialization, followed by a fresh observation immediately before its native
write. The guide documents bounded owned-child closure. This opt-in command is
separate from the existing default tool surface and does not fetch sources,
recruit reviewers, dispatch packets, or make rights/admission decisions.

## Prompts and resources (Unreleased)

Three prompts do the common jobs in one step: `known_on_date` (company, as_of), `restatement_review` (company, optional concept) and `peers_as_of` (companies, concept, as_of). In clients that support completion, `company` completes from the SEC ticker list and `concept` from the plain names.

Resources: `canli://concepts` lists every plain name and the tags behind it; `canli://limits` gives the limits to quote; `canli://schemas/{tool}` gives a tool's exact JSON Schemas; `canli://examples/{language}/{tool}` gives a working call in `python`, `javascript` or `curl`.
