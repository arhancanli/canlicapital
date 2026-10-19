# The global tools against sources they do not read

`node bench/global/crosscheck.mjs` (live) sets `european_filings` and `reference_rates` against
independent publications and writes `results-YYYY-MM-DD.json`:

- ESEF revenue and net profit against the same companies' annual reports on Form 20-F at the SEC,
  read from SEC's companyfacts API: a different filing, filed with a different regulator, in a
  different system. TotalEnergies (USD), Novo Nordisk (DKK) and Shell (USD), fiscal 2024 and 2025.
- The ECB's deposit facility rate and the Bank of England's Bank Rate, read from the central
  banks, against the policy rates the BIS collects for the euro area and the UK, and the New York
  Fed's published target range against the BIS's US rate, at three dates in 2026.

2026-10-15: 21 of 21 agreed. The first run had one error, not a disagreement: filings.xbrl.org
took more than 20 seconds to answer once; the tool now tries a timed-out request once more.

Limits: three companies and three dates are a check of the reading, not of coverage. ASML files
its 20-F under US GAAP, so it has no IFRS facts at the SEC to compare. FRED, a further
independent path for the money-market rates, did not answer from this machine on the day.
