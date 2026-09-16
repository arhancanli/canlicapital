"""Read-only browser checks for the cinematic homepage enhancement."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts/qa/engine-journey"
ORIGIN = os.environ.get("HOMEPAGE_AUDIT_ORIGIN", "http://127.0.0.1:4187")
OUT.mkdir(parents=True, exist_ok=True)
report = []

with sync_playwright() as p:
    browser = p.chromium.launch()
    for name, width, height, reduced, javascript in [
        ("desktop", 1440, 1000, False, True),
        ("laptop", 1024, 768, False, True),
        ("mobile", 390, 844, False, True),
        ("small-mobile", 320, 740, False, True),
        ("tablet", 768, 1024, False, True),
        ("reduced", 1440, 1000, True, True),
        ("no-js", 390, 844, False, False),
    ]:
        context = browser.new_context(viewport={"width": width, "height": height}, java_script_enabled=javascript,
                                      reduced_motion="reduce" if reduced else "no-preference")
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(ORIGIN, wait_until="networkidle")
        page.screenshot(path=str(OUT / f"{name}-hero.png"))
        assert page.locator("[data-engine-step]").count() == 3
        assert page.locator(".home-questions details").count() == 4
        rendered = "is-rendered" in page.locator(".engine-journey").get_attribute("class")
        assert rendered == (width >= 1000 and not reduced and javascript), name
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), f"{name}: overflow"
        if rendered:
            before = page.locator("canvas.engine-canvas").evaluate("c => c.toDataURL()")
            page.locator('[data-engine-step="1"]').scroll_into_view_if_needed()
            page.wait_for_timeout(120)
            after = page.locator("canvas.engine-canvas").evaluate("c => c.toDataURL()")
            assert before != after, "scroll should change the cutaway"
            page.screenshot(path=str(OUT / f"{name}-opened.png"))
            # The sticky canvas must remain in the viewport through the story.
            assert abs(page.locator(".engine-stage").bounding_box()["y"] - 78) < 2
        for selector, label in [("#sleeves", "strategies"), ("#developer-api", "developers"), (".home-questions", "faq")]:
            page.locator(selector).scroll_into_view_if_needed()
            page.screenshot(path=str(OUT / f"{name}-{label}.png"))
        question = page.locator(".home-questions summary").first
        question.focus()
        page.keyboard.press("Enter")
        assert page.locator(".home-questions details").first.get_attribute("open") is not None
        page.keyboard.press("Enter")
        assert page.locator(".home-questions details").first.get_attribute("open") is None
        if rendered:
            page.emulate_media(reduced_motion="reduce")
            page.wait_for_function("!document.querySelector('.engine-journey').classList.contains('is-rendered')")
            assert "is-rendered" not in page.locator(".engine-journey").get_attribute("class")
            assert page.locator(".glassbox-visual img").is_visible()
        assert not errors, errors
        report.append({"case": name, "passed": True, "canvas": rendered, "pageErrors": errors})
        context.close()

    # Failure to load data must preserve the generated SVG and all copy.
    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    page = context.new_page()
    page.route("**/paper-state.json", lambda route: route.fulfill(status=503, body="unavailable"))
    page.goto(ORIGIN, wait_until="networkidle")
    assert "is-rendered" not in page.locator(".engine-journey").get_attribute("class")
    assert page.locator(".glassbox-visual img").is_visible()
    report.append({"case": "snapshot-unavailable", "passed": True})
    context.close()
    browser.close()

(OUT / "report.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report, indent=2))
