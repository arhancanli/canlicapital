"""Browser regression for the Product System v3 shell across route families."""

from __future__ import annotations

import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
ORIGIN = os.environ.get("PRODUCT_SHELL_AUDIT_ORIGIN", "http://127.0.0.1:4173").rstrip("/")
OUTPUT = ROOT / "artifacts" / "qa" / "product-shell"

ROUTES = (
    "/",
    "/systems",
    "/research",
    "/open",
    "/progress",
    "/performance",
    "/trials",
    "/methodology",
    "/verify",
    "/founder",
    "/measurements/forward-evidence-maturity",
    "/research/forward-sharpe-evidence-standard",
    "/publication/alphamax/v0.1.0",
    "/engineering",
    "/notes",
    "/notes/deflating-a-sharpe-ratio",
)

EXPECTED_CORE = {"Live", "Research", "Trials", "Systems", "Methodology", "Verify"}
EXPECTED_INSTITUTION = {"Corrections", "Status", "Founder", "Open data", "Measurements"}
EXPECTED_SOURCE = {
    "Engineering hub",
    "Engineering notes",
    "alphac (engine)",
    "canli-pit-lake",
    "canli-backtest",
}

#: Below this width the source control is deliberately hidden and the expanded menu
#: carries the repositories instead. Asserted rather than assumed, because "the
#: button disappeared on mobile" and "the button was removed" look identical in a
#: screenshot, and only one of them is intended.
SOURCE_CONTROL_HIDDEN_BELOW_PX = 640


def audit_route(browser, route: str, *, mobile: bool = False) -> dict[str, object]:
    width, height = ((390, 844) if mobile else (1440, 1000))
    context = browser.new_context(viewport={"width": width, "height": height})
    page = context.new_page()
    console_errors: list[str] = []
    page_errors: list[str] = []
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
    page.on("pageerror", lambda error: page_errors.append(str(error)))
    response = page.goto(f"{ORIGIN}{route}", wait_until="domcontentloaded", timeout=15_000)
    assert response and response.ok, f"{route}: HTTP {response.status if response else 'none'}"
    page.wait_for_timeout(1_200)

    header = page.locator("header[data-product-shell='v3']")
    footer = page.locator("footer[data-product-shell='v3']")
    assert header.count() == 1, f"{route}: expected one v3 header"
    assert footer.count() == 1, f"{route}: expected one v3 footer"
    assert page.locator("header.site-header, header.paper__masthead, header.nav").count() == 0
    assert page.locator("footer.site-footer, footer.footer").count() == 0

    core_links = set(header.locator(".cc-shell__primary .cc-shell__link").all_inner_texts())
    assert core_links == EXPECTED_CORE, f"{route}: primary routes differ: {core_links}"
    assert header.locator(".cc-shell__cta").get_attribute("href") == "https://app.canlicapital.com/dashboard"
    source = header.locator(".cc-shell__source")
    assert source.count() == 1, f"{route}: expected exactly one source control"
    assert source.get_attribute("href") == "/engineering", f"{route}: source control does not point at /engineering"
    if width >= SOURCE_CONTROL_HIDDEN_BELOW_PX:
        assert source.is_visible(), f"{route}: source control is in the DOM but not visible at {width}px"
    else:
        assert not source.is_visible(), (
            f"{route}: source control is visible at {width}px; below "
            f"{SOURCE_CONTROL_HIDDEN_BELOW_PX}px the expanded menu is meant to carry it instead"
        )
    assert footer.get_by_text("Founded and built by Arhan Canli in Dubai.", exact=True).count() == 1
    assert not page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth")
    if route.startswith("/publication/"):
        assert page.locator(".publication-hero").count() == 1, f"{route}: publication wrapper did not resolve"
        assert page.get_by_role("link", name="Read immutable paper").get_attribute("href") == f"{route}/paper"

    if mobile:
        menu = header.locator("details.cc-shell__index")
        menu.locator("summary").click()
        assert menu.get_attribute("open") is not None
        assert menu.locator(".cc-shell__panel").is_visible()
        institution_links = set(menu.locator("nav[aria-label='Institution routes'] a").all_inner_texts())
        assert institution_links == EXPECTED_INSTITUTION
        source_links = set(menu.locator("nav[aria-label='Source code'] a").all_inner_texts())
        assert source_links == EXPECTED_SOURCE, f"{route}: source routes differ: {source_links}"
        assert not page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth")

    screenshot = None
    if (route, mobile) in {
        ("/systems", False),
        ("/research/forward-sharpe-evidence-standard", False),
        ("/publication/alphamax/v0.1.0", False),
        ("/", True),
    }:
        slug = "home" if route == "/" else route.strip("/").replace("/", "-")
        screenshot_path = OUTPUT / f"{slug}-{'mobile' if mobile else 'desktop'}.png"
        page.screenshot(path=str(screenshot_path), full_page=False)
        screenshot = str(screenshot_path.relative_to(ROOT))

    record = {
        "route": route,
        "viewport": {"width": width, "height": height},
        "status": "PASS",
        "console_errors": console_errors,
        "page_errors": page_errors,
        "screenshot": screenshot,
    }
    context.close()
    return record


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    failures: list[str] = []
    records: list[dict[str, object]] = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        for route in ROUTES:
            for mobile in (False, True):
                try:
                    record = audit_route(browser, route, mobile=mobile)
                    records.append(record)
                    if record["console_errors"] or record["page_errors"]:
                        failures.append(f"{route} {'mobile' if mobile else 'desktop'}: browser errors")
                except Exception as error:
                    failures.append(f"{route} {'mobile' if mobile else 'desktop'}: {error}")
                    for context in list(browser.contexts):
                        context.close()
        browser.close()

    report = {
        "schema": "canli.product-shell-browser-audit.v1",
        "origin": ORIGIN,
        "status": "PASS" if not failures else "FAIL",
        "route_count": len(ROUTES),
        "view_count": len(ROUTES) * 2,
        "records": records,
        "failures": failures,
        "claim_boundary": (
            "Headless Chromium verifies the shared shell, navigation model, responsive menu and "
            "overflow at named viewports. It is not a human accessibility certification."
        ),
    }
    output = OUTPUT / "report.json"
    output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    print(f"{report['status']}: {output} ({len(records)}/{report['view_count']} views completed)")
    if failures:
        for failure in failures:
            print(f"  {failure}")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
