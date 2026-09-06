"""Tests for integrations/backtrader/canli_analyzer.py.

Loads the module by file path so the real backtrader package is never required.
Only the pure simple_returns() helper and the module's fallback behaviour (when
backtrader is not installed) are testable without a real backtrader install; the
bt.Analyzer subclass itself is exercised only when backtrader is actually present.
"""
from __future__ import annotations

import importlib.util
import unittest

from module_loader import load_tool_module

backtrader_module = load_tool_module("_canli_integration_backtrader", "backtrader/canli_analyzer.py")
BACKTRADER_INSTALLED = importlib.util.find_spec("backtrader") is not None


class SimpleReturnsTest(unittest.TestCase):
    def test_computes_simple_returns_between_bars(self):
        result = backtrader_module.simple_returns([100.0, 110.0, 121.0])
        self.assertEqual(len(result), 2)
        self.assertAlmostEqual(result[0], 0.10, places=6)
        self.assertAlmostEqual(result[1], 0.10, places=6)

    def test_handles_losses(self):
        result = backtrader_module.simple_returns([100.0, 90.0, 99.0])
        self.assertAlmostEqual(result[0], -0.10, places=6)
        self.assertAlmostEqual(result[1], 0.10, places=6)

    def test_too_few_bars_returns_empty_list(self):
        self.assertEqual(backtrader_module.simple_returns([]), [])
        self.assertEqual(backtrader_module.simple_returns([100.0]), [])

    def test_skips_a_zero_equity_step_instead_of_dividing_by_zero(self):
        result = backtrader_module.simple_returns([0.0, 10.0, 11.0])
        self.assertEqual(len(result), 1)
        self.assertAlmostEqual(result[0], 0.10, places=6)


@unittest.skipIf(BACKTRADER_INSTALLED, "backtrader is installed; the no-install fallback path does not apply")
class ModuleImportsWithoutBacktraderTest(unittest.TestCase):
    def test_placeholder_class_raises_a_clear_import_error(self):
        with self.assertRaises(ImportError) as ctx:
            backtrader_module.CanliValidation()
        self.assertIn("pip install backtrader", str(ctx.exception))

    def test_a_plain_import_backtrader_raises_when_not_installed(self):
        with self.assertRaises(ImportError):
            import backtrader  # noqa: F401


class NoNamespacePackageCollisionTest(unittest.TestCase):
    def test_loading_the_module_does_not_add_integrations_dir_to_sys_path(self):
        # Regression check: canli_analyzer.py must not put its own parent directory on
        # sys.path, or a plain `import backtrader` would resolve to an empty namespace
        # package built from integrations/backtrader itself (no __init__.py there)
        # instead of raising ImportError when the real library is absent.
        import sys

        from module_loader import INTEGRATIONS_DIR

        self.assertNotIn(str(INTEGRATIONS_DIR), sys.path)


class LabelDefaultTest(unittest.TestCase):
    def test_default_label(self):
        self.assertEqual(backtrader_module.DEFAULT_LABEL, "integration-backtrader")


if __name__ == "__main__":
    unittest.main()
