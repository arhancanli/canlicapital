"""The three steps with the OpenAI Agents SDK.

pip install -r requirements.txt
OPENAI_API_KEY=... CANLI_MODEL=<a model your account has> python openai_agents_agent.py "Test a 50/200 moving-average rule on AAPL."
"""
import asyncio
import json
import os
import shlex
import sys
from pathlib import Path

from agents import Agent, Runner
from agents.mcp import MCPServerStdio, create_static_tool_filter

ALLOWED = ["find_tool", "describe_tool", "run_tool"]


def canli_server() -> MCPServerStdio:
    command = shlex.split(os.environ.get("CANLI_MCP_COMMAND", "npx -y canli-mcp"))
    return MCPServerStdio(
        name="canli",
        params={
            "command": command[0],
            "args": command[1:],
            "env": {
                **os.environ,
                "CANLI_PACKS": "markets,fundamentals,validation,backtest,quant",
                "CANLI_POLICY": json.dumps({"orders": "off"}),
            },
        },
        # Only these tools reach the model. The server runs without the paper pack, and with orders refused.
        tool_filter=create_static_tool_filter(allowed_tool_names=ALLOWED),
        client_session_timeout_seconds=120,
    )


async def main(task: str) -> None:
    system = (Path(__file__).parent / "prompt.txt").read_text()
    async with canli_server() as server:
        agent = Agent(name="canli", instructions=system, model=os.environ["CANLI_MODEL"], mcp_servers=[server])
        result = await Runner.run(agent, task, max_turns=30)
        print(result.final_output)


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "Test a 50/200 moving-average rule on AAPL."))
