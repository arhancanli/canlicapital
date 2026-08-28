"""Browser QA for the source-bound evidence-chain explorer."""

from __future__ import annotations

import json
from pathlib import Path

from playwright.sync_api import ConsoleMessage, Error, Page, sync_playwright


BASE_URL = "http://127.0.0.1:4173/tools/evidence-chain.html"
OUTPUT = Path("artifacts/qa/evidence-chain")


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


def open_ready(page: Page, url: str = BASE_URL) -> None:
    response = page.goto(url, wait_until="networkidle")
    assert response is not None and response.status == 200
    page.evaluate("document.fonts.ready")
    page.locator("#chain-verification-status").wait_for(state="visible")
    assert page.locator("#chain-verification-status").inner_text() == "PASS"


def assert_layout(page: Page) -> None:
    diagnostics = page.evaluate(
        """
        () => ({
          client: document.documentElement.clientWidth,
          scroll: document.documentElement.scrollWidth,
          canvasWidth: document.querySelector('#chain-canvas').getBoundingClientRect().width,
          rangeLabel: document.querySelector('#chain-range').getAttribute('aria-label'),
          headings: document.querySelectorAll('h1, h2, h3').length,
        })
        """
    )
    assert diagnostics["scroll"] <= diagnostics["client"] + 1, diagnostics
    assert diagnostics["canvasWidth"] > 250, diagnostics
    assert diagnostics["rangeLabel"] == "Select transparency-chain sequence"
    assert diagnostics["headings"] >= 10


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
        facts = page.evaluate(
            "JSON.parse(document.querySelector('#evidence-chain-config').textContent).facts"
        )
        assert page.locator("#chain-verification-label").inner_text() == (
            f"{facts['entries']} links + {facts['entries']} signatures + {facts['anchors']} anchors"
        )
        page.screenshot(path=str(OUTPUT / "desktop.png"), full_page=False)

        page.locator("#microscope").scroll_into_view_if_needed()
        page.wait_for_timeout(120)
        page.screenshot(path=str(OUTPUT / "microscope-desktop.png"), full_page=False)

        page.locator("#chain-boundary-jump").click()
        boundary = facts["first_disclosed_seq"]
        assert page.locator("#entry-seq").inner_text() == str(boundary)
        assert page.locator("#entry-disclosure").inner_text() == "PUBLIC PAYLOAD"
        assert page.locator("#entry-anchor").inner_text().startswith("BITCOIN BLOCK")
        assert f"seq={boundary}" in page.url
        assert page.locator("#entry-proof-score").inner_text() == "4 / 4"

        page.locator("#chain-copy").click()
        copied = json.loads(page.evaluate("navigator.clipboard.readText()"))
        assert copied["seq"] == boundary
        assert copied["payload_schema"] == "canli.alphac-track-record-daily-digest.v1"

        page.locator("#chain-mutate").click()
        page.locator("#mutation-result").wait_for(state="visible")
        assert page.locator("#mutation-lab").get_attribute("data-state") == "broken"
        assert f"BREAK AT SEQ {boundary}" in page.locator("#mutation-result").inner_text()
        assert page.locator("#mutation-original-hash").inner_text() != page.locator(
            "#mutation-test-hash"
        ).inner_text()
        page.locator("#chain-verify").click()
        assert page.locator("#chain-verification-status").inner_text() == "PASS"

        page.locator("#chain-head-jump").click()
        assert page.locator("#entry-seq").inner_text() == str(facts["head_seq"])
        assert "seq=" not in page.url
        page.locator("#chain-range").focus()
        page.keyboard.press("ArrowLeft")
        previous = facts["head_seq"] - 1
        assert page.locator("#entry-seq").inner_text() == str(previous)
        assert f"seq={previous}" in page.url
        page.reload(wait_until="networkidle")
        assert page.locator("#chain-verification-status").inner_text() == "PASS"
        assert page.locator("#entry-seq").inner_text() == str(previous)

        page.locator("body").press("Home")
        page.keyboard.press("Tab")
        focused = page.evaluate("document.activeElement && document.activeElement.tagName")
        assert focused in {"A", "BUTTON", "INPUT", "SUMMARY"}
        assert console_errors == [], console_errors
        assert page_errors == [], page_errors
        report["desktop"] = {
            "full_chain": "PASS",
            "boundary_jump": "PASS",
            "bitcoin_checkpoint": "PASS",
            "clipboard_json": "PASS",
            "local_mutation": "PASS",
            "query_state": "PASS",
            "range_keyboard": "PASS",
            "overflow": "PASS",
        }
        desktop.close()

        mobile = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=1)
        mobile_page = mobile.new_page()
        mobile_console, mobile_page_errors = capture_errors(mobile_page)
        open_ready(mobile_page)
        assert_layout(mobile_page)
        mobile_facts = mobile_page.evaluate(
            "JSON.parse(document.querySelector('#evidence-chain-config').textContent).facts"
        )
        mobile_page.screenshot(path=str(OUTPUT / "mobile.png"), full_page=False)
        mobile_page.locator("#microscope").scroll_into_view_if_needed()
        mobile_page.wait_for_timeout(120)
        mobile_page.screenshot(path=str(OUTPUT / "microscope-mobile.png"), full_page=False)
        mobile_page.locator("#chain-boundary-jump").click()
        assert mobile_page.locator("#entry-seq").inner_text() == str(
            mobile_facts["first_disclosed_seq"]
        )
        assert mobile_page.locator("#entry-prev").is_visible()
        assert mobile_console == [], mobile_console
        assert mobile_page_errors == [], mobile_page_errors
        report["mobile"] = {
            "full_chain": "PASS",
            "microscope_visible": "PASS",
            "boundary_jump": "PASS",
            "overflow": "PASS",
        }
        mobile.close()

        reduced = browser.new_context(
            viewport={"width": 1440, "height": 1000},
            reduced_motion="reduce",
        )
        reduced_page = reduced.new_page()
        reduced_console, reduced_page_errors = capture_errors(reduced_page)
        open_ready(reduced_page)
        scroll_behavior = reduced_page.evaluate(
            "getComputedStyle(document.documentElement).scrollBehavior"
        )
        assert scroll_behavior == "auto"
        reduced_page.screenshot(path=str(OUTPUT / "reduced-motion.png"), full_page=False)
        assert reduced_console == [], reduced_console
        assert reduced_page_errors == [], reduced_page_errors
        report["reduced_motion"] = {"scroll_behavior": scroll_behavior, "status": "PASS"}
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
