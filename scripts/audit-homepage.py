"""Browser-level regression audit for the evidence-first Canli Capital homepage."""

from __future__ import annotations

import json
from pathlib import Path

from playwright.sync_api import Page, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "artifacts" / "qa" / "advisor-homepage"
ORIGIN = "http://127.0.0.1:4173"


def audit_page(page: Page, *, name: str, width: int, height: int) -> dict[str, object]:
    console_errors: list[str] = []
    page_errors: list[str] = []
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
    page.on("pageerror", lambda error: page_errors.append(str(error)))
    page.set_viewport_size({"width": width, "height": height})
    page.goto(ORIGIN, wait_until="networkidle")

    hero = page.locator("#hero-title")
    assert hero.is_visible()
    assert hero.inner_text() == "Watch the portfolio.\nAudit the decisions."
    assert page.get_by_role("link", name="View the live record").first.is_visible()
    assert page.get_by_role("link", name="Read the methodology").first.is_visible()
    assert page.locator(".status-strip").is_visible()
    assert page.locator("#offering-title").is_visible()
    assert page.locator("#evidence-title").is_visible()
    assert page.locator("#trust-title").is_visible()

    status_box = page.locator(".status-strip").bounding_box()
    status_above_initial_fold = bool(status_box and status_box["y"] < height)
    if width >= 1000:
        assert status_above_initial_fold

    initial_path = page.locator("#equity-path").get_attribute("d")
    page.get_by_role("button", name="AlphaForge").click()
    assert page.get_by_role("button", name="AlphaForge").get_attribute("aria-pressed") == "true"
    assert page.locator("#chart-title").text_content() == "AlphaForge paper equity curve"
    assert page.locator("#equity-path").get_attribute("d") != initial_path

    heading_levels = page.locator("h1, h2, h3, h4, h5, h6").evaluate_all(
        "nodes => nodes.map(node => Number(node.tagName.slice(1)))"
    )
    heading_skips = [
        [heading_levels[index - 1], heading_levels[index]]
        for index in range(1, len(heading_levels))
        if heading_levels[index] > heading_levels[index - 1] + 1
    ]
    unlabeled_inputs = page.locator(
        "input:not([aria-label]):not([aria-labelledby])"
    ).evaluate_all(
        "nodes => nodes.filter(node => !document.querySelector(`label[for='${node.id}']`)).map(node => node.id)"
    )
    unnamed_buttons = page.locator("button").evaluate_all(
        "nodes => nodes.filter(node => !(node.innerText.trim() || node.getAttribute('aria-label') || node.getAttribute('aria-labelledby'))).length"
    )
    horizontal_overflow = page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth")

    page.reload(wait_until="networkidle")
    page.keyboard.press("Home")
    page.keyboard.press("Tab")
    focused = page.evaluate("document.activeElement && document.activeElement.className")
    focus_outline = page.evaluate(
        "getComputedStyle(document.activeElement).outlineStyle"
    )

    screenshot = OUTPUT / f"home-{name}.png"
    page.screenshot(path=str(screenshot), full_page=True)
    return {
        "viewport": {"width": width, "height": height},
        "screenshot": str(screenshot.relative_to(ROOT)),
        "status_above_initial_fold": status_above_initial_fold,
        "console_errors": console_errors,
        "page_errors": page_errors,
        "heading_skips": heading_skips,
        "unlabeled_inputs": unlabeled_inputs,
        "unnamed_buttons": unnamed_buttons,
        "horizontal_overflow": horizontal_overflow,
        "first_tab_target_class": focused,
        "first_tab_target_outline": focus_outline,
        "observed_labels": page.locator(".evidence-kind--observed").count(),
        "simulated_labels": page.locator(".evidence-kind--simulated").count(),
        "planned_labels": page.locator(".evidence-kind--planned").count(),
    }


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        records = [
            audit_page(browser.new_page(), name="desktop", width=1440, height=1000),
            audit_page(browser.new_page(), name="mobile", width=390, height=844),
        ]
        browser.close()

    failures: list[str] = []
    for record in records:
        name = f"{record['viewport']['width']}px"
        for key in ("console_errors", "page_errors", "heading_skips", "unlabeled_inputs"):
            if record[key]:
                failures.append(f"{name}:{key}:{record[key]}")
        if record["unnamed_buttons"]:
            failures.append(f"{name}:unnamed_buttons:{record['unnamed_buttons']}")
        if record["horizontal_overflow"]:
            failures.append(f"{name}:horizontal_overflow")
        if record["first_tab_target_class"] != "skip-link":
            failures.append(f"{name}:first_tab_target:{record['first_tab_target_class']}")
        if record["first_tab_target_outline"] == "none":
            failures.append(f"{name}:focus_outline_missing")

    report = {
        "schema": "canli.homepage-advisor-brief-browser-audit.v1",
        "status": "PASS" if not failures else "FAIL",
        "records": records,
        "failures": failures,
        "claim_boundary": (
            "Local Chromium regression evidence for the evidence-first homepage at two named "
            "viewports. It is not a human screen-reader certification, conversion-rate study, "
            "or proof about an undeployed build."
        ),
    }
    output = OUTPUT / "report.json"
    output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    print(f"{report['status']}: {output}")
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
