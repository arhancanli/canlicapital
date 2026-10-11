# My agent dropped numbers when it copied data into a tool call

> Same model, same question, same tool. With 756 daily returns pasted into the prompt, the agent
> got 4 of 9 runs right; when the tool read the same series from a file, it got 8 of 9, with about
> a quarter of the tokens.

**Short title:** Pasted data lost numbers in tool calls

**Published 2026-10-11. Every figure below is read from
[`audit-file-experiment-2026-09-26.json`](/glassbox/audit-file-experiment-2026-09-26.json), which
holds every run of the experiment, first published on 2026-09-26 with its records in
[the repository](https://github.com/arhancanli/canlicapital/tree/main/mcp/bench/agent/experiments/2026-09-26-audit-file).**

## The setup

The validation tools that are now part of [canli-mcp](/mcp-servers) check backtests: given a
strategy's daily returns, they say, among other things, how long a track record has to be before
its Sharpe ratio means anything. This experiment ran them as canli-validation-mcp 0.5.0. The obvious way to use them is to paste the returns into the chat and let the agent pass
them on. That turned out to be the worst way.

Three questions each needed the whole audit chain, for example: how many years of track record
does this return series need before its Sharpe beats a bar at 95% confidence? The series had 504,
756 and 400 daily returns. Each question was asked 3 times of the same model (gpt-5.4-mini), so
each arm has 9 runs. The ground truth is the same local computation the tools run, and an answer
counts as right within 2 percent.

- **Validators only, returns pasted:** the server before the one-call audit tool existed, so the
  agent had to chain several validators itself.
- **Audit tool, returns pasted:** the series sits in the prompt as a JSON array, and the agent
  copies it into the tool call.
- **Audit tool, file path:** the series is in a CSV, the prompt names the file, and the tool reads
  it.

## The result

| Arm | Right | Median tokens per task | Median time per task |
|---|---|---|---|
| Validators only, pasted | 0 of 9 | 11,180 | 2,434 ms |
| Audit tool, pasted | 4 of 9 | 27,036 | 10,046 ms |
| Audit tool, file path | 8 of 9 | 6,524 | 2,374 ms |

Moving the data out of the prompt doubled the accuracy and cut the median tokens to about a
quarter.

## How the pasted runs failed

On the 756-return question, all three pasted runs gave the same wrong answer: 0.1718 years instead
of 0.1452. That is not three different mistakes but one, three times, which is what values going
missing on the way into the call looks like. The model re-types 756 numbers as output tokens,
skips some, and the tool computes the right answer for the wrong series. Nothing errors, and the
agent reports the figure with full confidence.

Pasting also costs twice: every number is paid for as input in the prompt and again as output
when the model writes the call. One pasted run used 76,930 tokens for a single question.

The one miss in the file arm was different. The agent answered 388, the right length in
observations (1.54 years at 252 trading days), where years were asked. That is a unit slip, not
lost data.

## What changed

- The audit tool takes `returns_file`, a path to a CSV, on the local server. It reads numbers only,
  caps the file size, and reports errors by row position, never by echoing the file back into the
  context.
- The tool descriptions say plainly that a long series should go in as a file.
- The hosted version cannot read your disk, so it refuses file input instead of pretending.

This was one small model on synthetic series, 9 runs per arm, so read it as "this failure is real
and easy to hit", not as a fixed rate. The general lesson holds beyond this tool: if a tool needs a
lot of data, do not make the model carry it. Pass a reference, such as a path, an ID or a URL, and
let the tool fetch it.
