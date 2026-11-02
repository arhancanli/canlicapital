"""The three steps with LangGraph.

pip install -r requirements.txt langchain-anthropic   (or another provider's package)
python langgraph_agent.py "Test a 50/200 moving-average rule on AAPL."

CANLI_MODEL chooses the model, as provider:model.
"""
import asyncio
import json
import os
import shlex
import sys
from pathlib import Path

from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.prebuilt import create_react_agent

# Only these tools reach the model. The server runs without the paper pack, and with orders refused.
ALLOWED = {"find_tool", "describe_tool", "run_tool"}


def server_config() -> dict:
    command = shlex.split(os.environ.get("CANLI_MCP_COMMAND", "npx -y canli-mcp"))
    return {
        "canli": {
            "transport": "stdio",
            "command": command[0],
            "args": command[1:],
            "env": {
                **os.environ,
                "CANLI_PACKS": "markets,fundamentals,validation,backtest,quant",
                "CANLI_POLICY": json.dumps({"orders": "off"}),
            },
        }
    }


async def canli_tools() -> list:
    tools = await MultiServerMCPClient(server_config()).get_tools()
    return [t for t in tools if t.name in ALLOWED]


async def main(task: str) -> None:
    tools = await canli_tools()
    system = (Path(__file__).parent / "prompt.txt").read_text()
    agent = create_react_agent(os.environ.get("CANLI_MODEL", "anthropic:claude-opus-5-5"), tools, prompt=system)
    result = await agent.ainvoke({"messages": [("user", task)]}, {"recursion_limit": 60})
    print(result["messages"][-1].content)


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "Test a 50/200 moving-average rule on AAPL."))
