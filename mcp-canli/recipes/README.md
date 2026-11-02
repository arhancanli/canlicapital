# Agent recipes

Starting points for three steps in order: read the data and check it against the filings, test the idea against luck, then write an order file. They stop there. No recipe can send an order, because the server runs without the paper pack and with orders refused by policy. A person reads the file and decides.

| Recipe | Needs | What was tested |
|---|---|---|
| `pipeline.mjs` | Node | Runs end to end with no model. Start here: every step is plain code you can read |
| `claude_agent.mjs` | Node, Claude Code or an API key | Run once on claude-haiku-5-5: the model found the tool, ran it and answered |
| `langgraph_agent.py` | Python 3.12, a model key | CI runs the model loop with a small model on the runner, and counts the tool calls the server received. It does not judge the answers |
| `openai_agents_agent.py` | Python 3.12, a model key | CI runs the model loop with a small model on the runner, and counts the tool calls the server received. It does not judge the answers |
| `crewai_agent.py` | Python 3.12, a model key | CI runs the model loop with a small model on the runner, and counts the tool calls the server received. It does not judge the answers |
| `kubernetes/cpcv-indexed-job.yaml` | A cluster | CI runs this file on a kind cluster on one machine, then merges the eight shards. Not run on a multi-node cluster |

These are starters, not production systems. Read them before you run them, and set your own limits.

## Run one

```
node recipes/pipeline.mjs AAPL
```

Each model recipe has its install line at the top of the file. They connect to `npx -y canli-mcp`; set `CANLI_MCP_COMMAND` to use another copy.

## The order file

The last step writes `orders.json` in the format `canli.order-intent.v1`:

```json
{
  "schema": "canli.order-intent.v1",
  "reason": "why, in a sentence",
  "orders": [{ "symbol": "AAPL", "side": "buy", "quantity": 1, "type": "market", "time_in_force": "day" }]
}
```

A model wrote that file, and text it read on the way could have steered it, so treat it as a draft. Nothing here is investment advice.

## Why the agent cannot send orders

Models read text from filings, news and web pages, and that text can contain instructions. A tool that can spend money is what makes that dangerous, so these recipes do not have one. To trade on paper, enable the paper pack yourself and approve each order in your client.
