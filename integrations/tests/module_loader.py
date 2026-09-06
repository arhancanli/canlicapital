"""Load an integration tool module by file path for tests.

Not a test module itself (its name does not match "test*.py"), so unittest discover
never runs it directly. Loading by file path under a private module name means tests
never need the real vectorbt, backtrader or freqtrade installed, and never need to
`import vectorbt` / `import backtrader` / `import freqtrade` as top-level names, which
would either hit the real package (if installed) or nothing at all (if not); either
way that is not what these tests are checking.
"""
from __future__ import annotations

import importlib.util
from pathlib import Path

INTEGRATIONS_DIR = Path(__file__).resolve().parent.parent


def load_tool_module(private_name: str, relative_path: str):
    path = INTEGRATIONS_DIR / relative_path
    spec = importlib.util.spec_from_file_location(private_name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
