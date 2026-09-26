# audit_backtest: pasted series or a file (2026-09-26)

Three questions that need the whole audit chain ("how many years of track record does this return
series need before its Sharpe beats B at 95 percent?"), with 400, 504 and 756 daily returns, asked
three times each of gpt-5.4-mini. Ground truth is the same local computation the tools run. The
"validators only" arm ran the server before `audit_backtest` existed; the other two ran this
branch, once with the series pasted into the prompt and once with it written to a CSV the prompt
names. The tasks are `tasks-pasted.mjs` and `tasks-file.mjs`, run through a copy of `../../run.mjs`
that imports them; each record below holds every run.

| arm | correct | median tokens per task | median time per task | records |
|---|---|---|---|---|
| validators only, returns pasted | 0 of 9 | 11180 | 2434 ms | `before-audit-tool-pasted.json` |
| audit_backtest, returns pasted | 4 of 9 | 27036 | 10046 ms | `audit-tool-pasted.json` |
| audit_backtest, returns_file | 8 of 9 | 6524 | 2374 ms | `audit-tool-file.json` |

Pasted, the model copied long series into the call and dropped values: every pasted miss on the
756-return task gave the same wrong figure. The one miss reading the file was a unit slip
(observations for years). Claude models were not run: the Anthropic credit was spent.
