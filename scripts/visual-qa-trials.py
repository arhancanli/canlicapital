"""Rendered desktop/mobile QA for the trial evidence register."""

from __future__ import annotations

from pathlib import Path

from playwright.sync_api import sync_playwright


BASE = "http://127.0.0.1:4173"
CASES = (
    ("index", "/trials", "Every registered trial"),
    ("complete", "/trials/8446702cb8dd1768", "eia_petroleum_inventory"),
    ("incomplete", "/trials/05908a8a641400e2", "carry_fund_21"),
)
VIEWPORTS = (
    ("desktop", {"width": 1440, "height": 1000}),
    ("mobile", {"width": 390, "height": 844}),
)


def main() -> None:
    failures: list[str] = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        for viewport_name, viewport in VIEWPORTS:
            context = browser.new_context(viewport=viewport)
            context.route(
                "https://fonts.googleapis.com/**",
                lambda route: route.fulfill(status=200, content_type="text/css", body=""),
            )
            page = context.new_page()
            console_errors: list[str] = []
            page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
            for case, route, expected_h1 in CASES:
                response = page.goto(f"{BASE}{route}", wait_until="domcontentloaded", timeout=15_000)
                if response is None or not response.ok:
                    failures.append(f"{viewport_name}/{case}: HTTP response failed")
                    continue
                h1 = page.locator("h1")
                h1.wait_for(state="visible")
                if h1.count() != 1 or expected_h1 not in h1.inner_text():
                    failures.append(f"{viewport_name}/{case}: unexpected H1")
                if page.locator("a.paper__skip").count() != 1:
                    failures.append(f"{viewport_name}/{case}: skip link missing")
                overflow = page.evaluate("""() => {
                    const width = document.documentElement.clientWidth;
                    return [...document.querySelectorAll('body *')]
                      .filter((element) => element.getBoundingClientRect().right > width + 1)
                      .slice(0, 4)
                      .map((element) => `${element.tagName.toLowerCase()}.${element.className}`);
                }""")
                if overflow:
                    failures.append(f"{viewport_name}/{case}: horizontal overflow from {overflow}")
                if case != "index":
                    if page.locator(".trial__section").count() != 11:
                        failures.append(f"{viewport_name}/{case}: evidence spine does not have 11 sections")
                    raw = page.locator('a[href^="/glassbox/trial-packets/"]')
                    if raw.count() != 1:
                        failures.append(f"{viewport_name}/{case}: raw packet link missing")
                page.screenshot(path=f"/tmp/canli-trials-{viewport_name}-{case}.png", full_page=True)
            if console_errors:
                failures.append(f"{viewport_name}: console errors: {console_errors}")
            context.close()
        browser.close()
    if failures:
        raise SystemExit("\n".join(failures))
    print("trial visual QA passed: index + complete/incomplete packet, desktop + mobile, no overflow or console errors")


if __name__ == "__main__":
    main()
