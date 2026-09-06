"""Browser QA for the complete-union trial-accounting explorer."""

from __future__ import annotations

import json
from pathlib import Path

from playwright.sync_api import ConsoleMessage, Error, Page, sync_playwright


BASE_URL = "http://127.0.0.1:4173/tools/trial-accounting.html"
OUTPUT = Path("artifacts/qa/trial-accounting")
SELECTION_N = 229


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
    page.wait_for_function(
        """expected =>
          document.querySelectorAll('#union-matrix [data-identity]').length === expected &&
          document.querySelector('#union-visible')?.textContent === String(expected)
        """,
        arg=SELECTION_N,
    )


def assert_layout(page: Page) -> None:
    diagnostics = page.evaluate(
        """
        () => ({
          client: document.documentElement.clientWidth,
          scroll: document.documentElement.scrollWidth,
          identities: document.querySelectorAll('#union-matrix [data-identity]').length,
          denominator: document.querySelector('.union-counter strong').textContent.trim(),
          matrixWidth: document.querySelector('#union-matrix').getBoundingClientRect().width,
          inspectorWidth: document.querySelector('#union-inspector').getBoundingClientRect().width,
          headings: document.querySelectorAll('h1, h2, h3').length,
          clipped: [...document.querySelectorAll('main *')]
            .filter(element => {
              const box = element.getBoundingClientRect();
              const style = getComputedStyle(element);
              return style.display !== 'none' && box.width > 0 &&
                (box.left < -1 || box.right > innerWidth + 1);
            })
            .slice(0, 12)
            .map(element => ({
              tag: element.tagName,
              className: element.className,
              text: element.textContent.trim().slice(0, 60),
              box: element.getBoundingClientRect().toJSON(),
            })),
        })
        """
    )
    assert diagnostics["scroll"] <= diagnostics["client"] + 1, diagnostics
    assert diagnostics["identities"] == SELECTION_N, diagnostics
    assert diagnostics["denominator"] == str(SELECTION_N), diagnostics
    assert diagnostics["matrixWidth"] > 250, diagnostics
    assert diagnostics["inspectorWidth"] > 250, diagnostics
    assert diagnostics["headings"] >= 9, diagnostics
    assert diagnostics["clipped"] == [], diagnostics


def admitted_value(page: Page) -> str:
    return page.locator("#union-inspector dl div").filter(has_text="Admitted").locator("dd").inner_text()


def main() -> int:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    report: dict[str, object] = {}

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)

        desktop = browser.new_context(
            viewport={"width": 1440, "height": 1000},
            device_scale_factor=1,
            permissions=["clipboard-read", "clipboard-write"],
            accept_downloads=True,
        )
        page = desktop.new_page()
        console_errors, page_errors = capture_errors(page)
        open_ready(page)
        assert_layout(page)
        facts = page.evaluate(
            "JSON.parse(document.querySelector('#trial-accounting-config').textContent).facts"
        )
        assert facts["selection_n"] == SELECTION_N
        assert facts["immutable_execution_records"] - facts["window_only_remeasurements"] - facts["cross_profile_duplicate_identities"] == SELECTION_N
        assert page.locator("#union-list > button").count() == SELECTION_N
        page.screenshot(path=str(OUTPUT / "desktop.png"), full_page=False)

        page.locator("#union-explorer").scroll_into_view_if_needed()
        page.wait_for_timeout(120)
        page.screenshot(path=str(OUTPUT / "workbench-desktop.png"), full_page=False)

        page.locator("#union-status").select_option("legacy_complete_packet")
        assert page.locator("#union-visible").inner_text() == "2"
        assert page.locator("#union-list > button").count() == 2
        page.locator("#union-list > button").first.click()
        assert page.locator("#union-inspector .union-inspector__status").inner_text() == "COMPLETE EVIDENCED PACKET"
        assert admitted_value(page) == "NO"
        assert "complete packet is not a passed strategy" in page.locator(".union-boundary").inner_text().lower()

        page.locator("#union-status").select_option("prospective_final_incomplete_not_admitted")
        assert page.locator("#union-visible").inner_text() == "1"
        assert page.locator("#union-list > button").count() == 1
        prospective_key = page.locator("#union-list code").inner_text()
        page.locator("#union-list > button").click()
        assert page.locator("#union-inspector .union-inspector__status").inner_text() == "PROSPECTIVE / NOT ADMITTED"
        assert admitted_value(page) == "NO"
        assert f"identity={prospective_key}" in page.url

        page.locator("#union-copy").click()
        copied = page.evaluate("navigator.clipboard.readText()")
        assert copied == page.url

        page.locator("#union-reset").click()
        family_option = page.locator("#union-family option").nth(1).get_attribute("value")
        assert family_option is not None
        page.locator("#union-family").select_option(family_option)
        visible_family = int(page.locator("#union-visible").inner_text())
        assert 0 < visible_family < SELECTION_N
        assert page.locator(".union-counter strong").inner_text() == str(SELECTION_N)
        assert page.locator(".union-map > header p").inner_text().endswith(str(SELECTION_N))

        page.locator("#union-query").fill(prospective_key)
        assert page.locator("#union-visible").inner_text() == "0"
        page.locator("#union-family").select_option("all")
        assert page.locator("#union-visible").inner_text() == "1"
        assert f"q={prospective_key}" in page.url
        page.reload(wait_until="networkidle")
        assert page.locator("#union-visible").inner_text() == "1"
        assert page.locator("#union-query").input_value() == prospective_key

        with page.expect_download() as download_info:
            page.locator("#union-export").click()
        download = download_info.value
        export_path = OUTPUT / "filtered-export.json"
        download.save_as(export_path)
        exported = json.loads(export_path.read_text(encoding="utf-8"))
        assert exported["schema"] == "canli.trial-accounting-filter-export.v1"
        assert exported["selection_n"] == SELECTION_N
        assert len(exported["visible_identities"]) == 1
        assert exported["visible_identities"][0]["hypothesis_key"] == prospective_key
        assert exported["visible_identities"][0]["admitted"] is False

        page.locator("body").press("Home")
        page.keyboard.press("Tab")
        focused = page.evaluate("document.activeElement && document.activeElement.tagName")
        assert focused in {"A", "BUTTON", "INPUT", "SELECT", "SUMMARY"}
        assert console_errors == [], console_errors
        assert page_errors == [], page_errors
        report["desktop"] = {
            "complete_union": "PASS",
            "accounting_equation": "PASS",
            "legacy_completeness_not_admission": "PASS",
            "prospective_non_admission": "PASS",
            "family_filter_preserves_n": "PASS",
            "search_and_query_state": "PASS",
            "clipboard": "PASS",
            "filtered_export": "PASS",
            "keyboard": "PASS",
            "overflow": "PASS",
        }
        desktop.close()

        mobile = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=1)
        mobile_page = mobile.new_page()
        mobile_console, mobile_page_errors = capture_errors(mobile_page)
        open_ready(mobile_page)
        assert_layout(mobile_page)
        mobile_page.screenshot(path=str(OUTPUT / "mobile.png"), full_page=False)
        mobile_page.locator("#union-explorer").scroll_into_view_if_needed()
        mobile_page.wait_for_timeout(120)
        mobile_page.screenshot(path=str(OUTPUT / "workbench-mobile.png"), full_page=False)
        mobile_page.locator("#union-status").select_option("prospective_final_incomplete_not_admitted")
        assert mobile_page.locator("#union-visible").inner_text() == "1"
        assert mobile_page.locator(".union-counter strong").inner_text() == str(SELECTION_N)
        assert mobile_page.locator("#union-inspector").is_visible()
        assert mobile_console == [], mobile_console
        assert mobile_page_errors == [], mobile_page_errors
        report["mobile"] = {
            "complete_union": "PASS",
            "responsive_workbench": "PASS",
            "prospective_filter": "PASS",
            "denominator_immutable": "PASS",
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
