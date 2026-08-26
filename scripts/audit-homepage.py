"""Browser-level regression audit for the evidence-first Canli Capital homepage."""

from __future__ import annotations

import json
import os
from pathlib import Path

from playwright.sync_api import Page, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = Path(
    os.environ.get(
        "HOMEPAGE_AUDIT_OUTPUT",
        str(ROOT / "artifacts" / "qa" / "advisor-homepage"),
    )
).expanduser().resolve()
ORIGIN = os.environ.get("HOMEPAGE_AUDIT_ORIGIN", "http://127.0.0.1:4173").rstrip("/")


def audit_page(page: Page, *, name: str, width: int, height: int) -> dict[str, object]:
    console_errors: list[str] = []
    page_errors: list[str] = []
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
    page.on("pageerror", lambda error: page_errors.append(str(error)))
    page.set_viewport_size({"width": width, "height": height})
    page.goto(ORIGIN, wait_until="networkidle")

    hero = page.locator("#hero-title")
    assert hero.is_visible()
    assert hero.inner_text() == "Systematic research, with the receipts attached."
    assert page.get_by_role("link", name="View the live record").first.is_visible()
    assert page.get_by_role("link", name="Read the methodology").first.is_visible()
    assert page.locator(".live-console").is_visible()
    assert page.locator(".evidence-ribbon").is_visible()
    assert page.locator("#trace-title").is_visible()
    assert page.locator("#sleeves-title").is_visible()
    assert page.locator("#research-title").is_visible()
    assert page.locator("#trust-title").is_visible()
    assert page.locator("#access-title").is_visible()
    assert page.locator("#evidence-accounts").inner_text() == "3 × ~$1M"
    assert page.locator("#evidence-status").inner_text() == "Broker PASS"

    console_box = page.locator(".live-console").bounding_box()
    console_above_initial_fold = bool(console_box and console_box["y"] < height)
    if width >= 1000:
        assert console_above_initial_fold

    initial_path = page.locator("#equity-path").get_attribute("d")
    page.get_by_role("button", name="Forge").click()
    assert page.get_by_role("button", name="Forge").get_attribute("aria-pressed") == "true"
    assert page.locator("#chart-title").text_content() == "AlphaForge paper equity curve"
    assert page.locator("#equity-path").get_attribute("d") != initial_path
    assert "curve=alphaforge" in page.url

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
    try:
        screenshot_reference = str(screenshot.relative_to(ROOT))
    except ValueError:
        screenshot_reference = str(screenshot)

    return {
        "viewport": {"width": width, "height": height},
        "screenshot": screenshot_reference,
        "console_above_initial_fold": console_above_initial_fold,
        "console_errors": console_errors,
        "page_errors": page_errors,
        "heading_skips": heading_skips,
        "unlabeled_inputs": unlabeled_inputs,
        "unnamed_buttons": unnamed_buttons,
        "horizontal_overflow": horizontal_overflow,
        "first_tab_target_class": focused,
        "first_tab_target_outline": focus_outline,
        "broker_labels": page.locator(".state-pill--broker").count(),
        "local_simulation_labels": page.locator(".state-pill--local").count(),
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
        "origin": ORIGIN,
        "status": "PASS" if not failures else "FAIL",
        "records": records,
        "failures": failures,
        "claim_boundary": (
            f"Chromium regression evidence for {ORIGIN} at two named viewports. It is not a "
            "human screen-reader certification or a conversion-rate study."
        ),
    }
    output = OUTPUT / "report.json"
    output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    print(f"{report['status']}: {output}")
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
