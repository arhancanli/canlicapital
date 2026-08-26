"""Browser regression audit for authentic, lazy, accessible system films."""

from __future__ import annotations

import json
import os
from pathlib import Path

from playwright.sync_api import Browser, Page, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = Path(
    os.environ.get("SYSTEM_FILMS_AUDIT_OUTPUT", ROOT / "artifacts" / "qa" / "system-films")
).expanduser().resolve()
ORIGIN = os.environ.get("SYSTEM_FILMS_AUDIT_ORIGIN", "http://127.0.0.1:4174").rstrip("/")


def collect_errors(page: Page) -> tuple[list[str], list[str]]:
    console_errors: list[str] = []
    page_errors: list[str] = []
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
    page.on("pageerror", lambda error: page_errors.append(str(error)))
    return console_errors, page_errors


def assert_initial_contract(page: Page) -> None:
    assert page.locator("[data-film-card]").count() == 3
    assert page.locator("[data-film-video]").count() == 3
    assert page.locator("[data-film-poster]").count() == 3
    assert page.locator("source[src]").count() == 0
    assert page.locator("video[poster]").count() == 0
    assert page.locator("[data-film-toggle]:visible").count() == 0
    assert page.locator("[data-film-timestamp]").evaluate_all(
        "nodes => nodes.every(node => node.textContent.trim() !== 'Printed in poster')"
    )


def scroll_first_film_near_viewport(page: Page) -> None:
    page.evaluate("document.documentElement.style.scrollBehavior = 'auto'")
    for _ in range(6):
        rectangle = page.locator("[data-film-card]").first.bounding_box()
        assert rectangle is not None
        if -120 < rectangle["y"] < 720:
            return
        page.evaluate(
            "delta => window.scrollBy(0, delta)",
            rectangle["y"] - 140,
        )
        page.wait_for_timeout(250)
    rectangle = page.locator("[data-film-card]").first.bounding_box()
    assert rectangle is not None and -120 < rectangle["y"] < 720


def audit_desktop(browser: Browser) -> dict[str, object]:
    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    page = context.new_page()
    console_errors, page_errors = collect_errors(page)
    video_requests: list[str] = []
    page.on(
        "request",
        lambda request: video_requests.append(request.url)
        if request.url.endswith((".webm", ".mp4"))
        else None,
    )
    page.goto(ORIGIN, wait_until="networkidle")
    assert_initial_contract(page)
    assert video_requests == []

    section = page.locator("#system-films")
    scroll_first_film_near_viewport(page)
    page.wait_for_function("document.querySelectorAll('[data-film-card][data-playback=playing]').length === 3")
    assert page.locator("source[src]").count() == 6
    assert page.locator("video[poster]").count() == 3
    assert page.locator("[data-film-toggle]:visible").count() == 3
    assert len(video_requests) >= 3

    first_video = page.locator("[data-film-video]").first
    before = first_video.evaluate("video => video.currentTime")
    page.wait_for_function(
        "start => document.querySelector('[data-film-video]').currentTime > start + 0.15",
        arg=before,
        timeout=5_000,
    )
    after = first_video.evaluate("video => video.currentTime")
    assert after > before

    first_toggle = page.locator("[data-film-toggle]").first
    first_toggle.click()
    assert first_video.evaluate("video => video.paused") is True
    paused_at = first_video.evaluate("video => video.currentTime")
    page.wait_for_timeout(350)
    assert abs(first_video.evaluate("video => video.currentTime") - paused_at) < 0.05
    assert "Play" in first_toggle.inner_text()

    first_toggle.click()
    page.wait_for_function("document.querySelector('[data-film-video]').currentTime > 1")
    page.evaluate("document.activeElement?.blur()")
    page.screenshot(path=str(OUTPUT / "system-films-desktop.png"), full_page=False)
    horizontal_overflow = page.evaluate(
        "document.documentElement.scrollWidth > document.documentElement.clientWidth"
    )

    page.emulate_media(reduced_motion="reduce")
    page.wait_for_function("document.querySelectorAll('source[src]').length === 0")
    assert page.locator("video[poster]").count() == 0
    assert page.locator("[data-film-toggle]:visible").count() == 0
    assert page.locator("[data-film-card][data-playback=poster]").count() == 3

    page.emulate_media(reduced_motion="no-preference")
    page.wait_for_function("document.querySelectorAll('[data-film-card][data-playback=playing]').length >= 2")
    assert page.locator("source[src]").count() == 6
    context.close()
    return {
        "viewport": {"width": 1440, "height": 1000},
        "initial_video_requests": 0,
        "near_viewport_video_requests": len(video_requests),
        "dynamic_reduced_motion_unloaded_sources": True,
        "pause_control_holds_frame": True,
        "horizontal_overflow": horizontal_overflow,
        "console_errors": console_errors,
        "page_errors": page_errors,
        "screenshot": "artifacts/qa/system-films/system-films-desktop.png",
    }


def audit_mobile(browser: Browser) -> dict[str, object]:
    context = browser.new_context(viewport={"width": 390, "height": 844})
    page = context.new_page()
    console_errors, page_errors = collect_errors(page)
    page.goto(ORIGIN, wait_until="networkidle")
    assert_initial_contract(page)
    scroll_first_film_near_viewport(page)
    page.wait_for_function("document.querySelector('[data-film-card]').dataset.playback === 'playing'")
    assert page.locator("[data-film-toggle]").first.is_visible()
    horizontal_overflow = page.evaluate(
        "document.documentElement.scrollWidth > document.documentElement.clientWidth"
    )
    page.screenshot(path=str(OUTPUT / "system-films-mobile.png"), full_page=False)
    context.close()
    return {
        "viewport": {"width": 390, "height": 844},
        "first_film_plays_near_viewport": True,
        "horizontal_overflow": horizontal_overflow,
        "console_errors": console_errors,
        "page_errors": page_errors,
        "screenshot": "artifacts/qa/system-films/system-films-mobile.png",
    }


def audit_reduced_motion(browser: Browser) -> dict[str, object]:
    context = browser.new_context(
        viewport={"width": 1440, "height": 1000},
        reduced_motion="reduce",
    )
    page = context.new_page()
    console_errors, page_errors = collect_errors(page)
    video_requests: list[str] = []
    page.on(
        "request",
        lambda request: video_requests.append(request.url)
        if request.url.endswith((".webm", ".mp4"))
        else None,
    )
    page.goto(ORIGIN, wait_until="networkidle")
    assert_initial_contract(page)
    scroll_first_film_near_viewport(page)
    page.wait_for_timeout(500)
    assert page.locator("source[src]").count() == 0
    assert page.locator("[data-film-card][data-playback=poster]").count() == 3
    assert page.locator("[data-film-poster]:visible").count() == 3
    assert video_requests == []
    page.screenshot(path=str(OUTPUT / "system-films-reduced-motion.png"), full_page=False)
    context.close()
    return {
        "viewport": {"width": 1440, "height": 1000},
        "video_requests": 0,
        "poster_only": True,
        "console_errors": console_errors,
        "page_errors": page_errors,
        "screenshot": "artifacts/qa/system-films/system-films-reduced-motion.png",
    }


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        records = [
            audit_desktop(browser),
            audit_mobile(browser),
            audit_reduced_motion(browser),
        ]
        browser.close()

    failures: list[str] = []
    for record in records:
        label = f"{record['viewport']['width']}px"
        if record.get("horizontal_overflow"):
            failures.append(f"{label}:horizontal_overflow")
        if record["console_errors"]:
            failures.append(f"{label}:console_errors:{record['console_errors']}")
        if record["page_errors"]:
            failures.append(f"{label}:page_errors:{record['page_errors']}")

    report = {
        "schema": "canli.system-films-browser-audit.v1",
        "origin": ORIGIN,
        "status": "PASS" if not failures else "FAIL",
        "records": records,
        "failures": failures,
        "claim_boundary": (
            "Headless Chromium evidence for lazy playback, poster fallbacks, controls, responsive layout, "
            "and reduced-motion behavior. It is not a human screen-reader certification."
        ),
    }
    output = OUTPUT / "report.json"
    output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    print(f"{report['status']}: {output}")
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
