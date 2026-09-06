"""Browser QA for the source-bound Deflated Sharpe calculator."""

from __future__ import annotations

import json
from pathlib import Path

from playwright.sync_api import ConsoleMessage, Error, Page, sync_playwright


BASE_URL = "http://127.0.0.1:4173/tools/deflated-sharpe.html"
OUTPUT = Path("artifacts/qa/dsr-tool")


def capture_errors(page: Page) -> tuple[list[str], list[str]]:
    console_errors: list[str] = []
    page_errors: list[str] = []

    def on_console(message: ConsoleMessage) -> None:
        if message.type == "error":
            console_errors.append(message.text)

    def on_page_error(error: Error) -> None:
        page_errors.append(str(error))

    page.on("console", on_console)
    page.on("pageerror", on_page_error)
    return console_errors, page_errors


def open_ready(page: Page) -> None:
    response = page.goto(BASE_URL, wait_until="networkidle")
    assert response is not None and response.status == 200
    page.evaluate("document.fonts.ready")
    page.locator("#dsr-value").wait_for(state="visible")
    assert page.locator("#dsr-value").inner_text() not in {"...", "Invalid"}


def assert_layout(page: Page) -> None:
    diagnostics = page.evaluate(
        """
        () => ({
          viewport: innerWidth,
          client: document.documentElement.clientWidth,
          scroll: document.documentElement.scrollWidth,
          inputs: document.querySelectorAll('#dsr-form input').length,
          labelled: [...document.querySelectorAll('#dsr-form input')]
            .filter((input) => document.querySelector(`label[for="${input.id}"]`)).length,
        })
        """
    )
    assert diagnostics["scroll"] <= diagnostics["client"] + 1, diagnostics
    assert diagnostics["inputs"] == 7
    assert diagnostics["labelled"] == diagnostics["inputs"]


def main() -> int:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    report: dict[str, object] = {}

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)

        desktop = browser.new_context(
            viewport={"width": 1440, "height": 1000},
            device_scale_factor=1,
            permissions=["clipboard-read", "clipboard-write"],
        )
        page = desktop.new_page()
        console_errors, page_errors = capture_errors(page)
        open_ready(page)
        assert_layout(page)
        page.screenshot(path=str(OUTPUT / "desktop.png"), full_page=False)
        page.locator("#calculator").scroll_into_view_if_needed()
        page.wait_for_timeout(100)
        page.screenshot(path=str(OUTPUT / "calculator-desktop.png"), full_page=False)

        initial_dsr = float(page.locator("#dsr-value").inner_text())
        assert 0 < initial_dsr < 1
        page.locator("#effective_independent_trials").fill("1000")
        page.wait_for_timeout(100)
        deflated_dsr = float(page.locator("#dsr-value").inner_text())
        assert deflated_dsr < initial_dsr
        assert "trials=1000" in page.url

        page.reload(wait_until="networkidle")
        assert page.locator("#effective_independent_trials").input_value() == "1000"
        assert float(page.locator("#dsr-value").inner_text()) == deflated_dsr

        page.locator("#dsr-copy").click()
        copied = page.evaluate("navigator.clipboard.readText()")
        assert copied == page.url

        with page.expect_download() as download_info:
            page.locator("#dsr-export").click()
        download = download_info.value
        payload = json.loads(Path(download.path()).read_text(encoding="utf-8"))
        assert payload["schema"] == "canli.deflated-sharpe-calculation.v1"
        assert payload["inputs"]["effective_independent_trials"] == 1000
        assert payload["source_bindings"]["calculator_contract_content_hash"].startswith("sha256:")

        page.locator("#observations").fill("1")
        page.wait_for_timeout(100)
        assert page.locator("#dsr-error").is_visible()
        invalid_status = page.locator("#dsr-status").text_content()
        assert invalid_status == "Cannot calculate", invalid_status
        page.locator("#dsr-reset").click()
        assert page.locator("#effective_independent_trials").input_value() == "229"
        assert not page.locator("#dsr-error").is_visible()

        page.locator("body").press("Home")
        page.keyboard.press("Tab")
        focused = page.evaluate("document.activeElement && document.activeElement.tagName")
        assert focused in {"A", "BUTTON", "INPUT", "SUMMARY"}
        assert console_errors == [], console_errors
        assert page_errors == [], page_errors
        report["desktop"] = {
            "initial_dsr": initial_dsr,
            "dsr_at_1000_trials": deflated_dsr,
            "query_state": "PASS",
            "clipboard": "PASS",
            "json_export": "PASS",
            "invalid_input": "PASS",
            "keyboard": "PASS",
        }
        desktop.close()

        mobile = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=1)
        mobile_page = mobile.new_page()
        mobile_console, mobile_page_errors = capture_errors(mobile_page)
        open_ready(mobile_page)
        assert_layout(mobile_page)
        mobile_page.screenshot(path=str(OUTPUT / "mobile.png"), full_page=False)
        mobile_page.locator("#calculator").scroll_into_view_if_needed()
        mobile_page.wait_for_timeout(100)
        mobile_page.screenshot(path=str(OUTPUT / "calculator-mobile.png"), full_page=False)
        mobile_page.locator(".dsr-chamber").screenshot(path=str(OUTPUT / "chamber-mobile.png"))
        assert mobile_page.locator("#dsr-form").is_visible()
        assert mobile_console == [], mobile_console
        assert mobile_page_errors == [], mobile_page_errors
        report["mobile"] = {"overflow": "PASS", "calculator_visible": "PASS"}
        mobile.close()

        reduced = browser.new_context(
            viewport={"width": 1440, "height": 1000},
            reduced_motion="reduce",
        )
        reduced_page = reduced.new_page()
        reduced_console, reduced_page_errors = capture_errors(reduced_page)
        open_ready(reduced_page)
        transition = reduced_page.locator("#dsr-observed-marker").evaluate(
            "element => getComputedStyle(element).transitionDuration"
        )
        assert transition == "0s"
        reduced_page.screenshot(path=str(OUTPUT / "reduced-motion.png"), full_page=False)
        assert reduced_console == [], reduced_console
        assert reduced_page_errors == [], reduced_page_errors
        report["reduced_motion"] = {"marker_transition": transition, "status": "PASS"}
        reduced.close()

        browser.close()

    (OUTPUT / "report.json").write_text(
        json.dumps(report, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(report, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
