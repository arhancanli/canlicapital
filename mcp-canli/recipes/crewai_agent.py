"""The three steps as a CrewAI crew: one agent for each.

pip install -r requirements-crewai.txt
CANLI_MODEL=<provider/model> python crewai_agent.py "Test a 50/200 moving-average rule on AAPL."
"""
import json
import os
import shlex
import sys
from pathlib import Path

from crewai import Agent, Crew, Process, Task
from crewai_tools import MCPServerAdapter
from mcp import StdioServerParameters

ALLOWED = ("find_tool", "describe_tool", "run_tool")


def server_params() -> StdioServerParameters:
    command = shlex.split(os.environ.get("CANLI_MCP_COMMAND", "npx -y canli-mcp"))
    return StdioServerParameters(
        command=command[0],
        args=command[1:],
        env={
            **os.environ,
            "CANLI_PACKS": "markets,fundamentals,validation,backtest,quant",
            "CANLI_POLICY": json.dumps({"orders": "off"}),
        },
    )


def main(request: str) -> None:
    rules = (Path(__file__).parent / "prompt.txt").read_text()
    # Only these tools reach the agents. The server runs without the paper pack, and with orders refused.
    with MCPServerAdapter(server_params(), *ALLOWED) as tools:
        make = lambda role, goal: Agent(role=role, goal=goal, backstory=rules, tools=list(tools), llm=os.environ["CANLI_MODEL"], allow_delegation=False)
        data = make("Data checker", "Get the figures and check each against the filing.")
        risk = make("Risk tester", "Test the idea against luck, counting every variant tried.")
        orders = make("Order writer", "Write the order file only if the risk step cleared its floor.")
        crew = Crew(
            agents=[data, risk, orders],
            tasks=[
                Task(description=f"{request}\nDo step 1, DATA.", expected_output="The figures with each one's verdict.", agent=data),
                Task(description="Do step 2, RISK, on what the data step found.", expected_output="The probability against luck, with its limits, or why it could not be tested.", agent=risk),
                Task(description="Do step 3, ORDERS, if the risk step allows it.", expected_output="One canli.order-intent.v1 JSON object, or a sentence saying why there is none.", agent=orders),
            ],
            process=Process.sequential,
        )
        print(crew.kickoff())


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "Test a 50/200 moving-average rule on AAPL.")
