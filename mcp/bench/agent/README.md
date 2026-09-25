# Agent benchmark

Does a model, given this MCP server's tools, pick the right tool and get the right answer, and at
what cost in tokens and time? `run.mjs` launches the real server over stdio (in private local
mode, so validations need no key and no network), gives the model the server's own tool
definitions, and scores each task. `tasks.mjs` holds the tasks and their ground truth, computed
from the same code the tools run (itself checked in CI against the source papers' worked
examples and against the CRAN `pbo` package), never from a model's output.

```bash
node mcp/bench/agent/run.mjs --model gpt-5.4-mini --repeats 3 --only dsr,trl,brd,pbo,lim
```

A task passes when the model's last line is `ANSWER: <value>` and the value is within the task's
tolerance of the ground truth (absolute 0.01 for probabilities, relative 1 to 2 percent
otherwise, exact for yes/no). "Right tool" means the expected tool was called; "first tool
right" means it was the first call.

## Results, 2026-09-25, gpt-5.4-mini

Twenty tasks (deflated Sharpe, minimum track record length, breadth ceiling, backtest
overfitting, and two questions about what a result does not establish). The company-data tasks
wait for the ticker index to deploy.

| | before the get_key fix (1 pass) | after (3 passes) |
|---|---|---|
| runs | 20 | 60 |
| answer accuracy | 100% | 98.3% |
| right tool called | 100% | 100% |
| right tool first | 90% | 100% |
| mean tokens per task | 4373 | 4113 |
| median tokens per task | 3645 | 3701 |
| median time per task | 2303 ms | 1975 ms |

What the first pass found: on both overfitting tasks the model called `get_key` before
validating. In local mode no key is needed, and the call still reached the network. `get_key` now
issues nothing in local mode, and its description says when a key is needed; the right first tool
went from 90% to 100%.

The one miss after the fix (dsr-4, third pass) was a unit slip: the tool returned 0.4443 and the
model answered 44.43, a percentage, where the task asks for a plain number. The other two passes of
that task were exact.

Scope: one model, tasks written by us, local mode. These are measurements of this server on these
tasks, not a claim about other servers or other models. Full per-run records are in `results/`.
