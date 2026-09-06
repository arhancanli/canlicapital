"""Render critical public routes at desktop and mobile sizes and fail on visual breakage."""

from __future__ import annotations

import json
from pathlib import Path

from playwright.sync_api import ConsoleMessage, Error, sync_playwright


BASE_URL = "http://127.0.0.1:4173"
OUTPUT = Path("artifacts/qa/visual")
ROUTES = {
    "home": "/",
    "performance": "/performance.html",
    "research": "/research.html",
    "founder": "/founder.html",
    "review": "/review.html",
    "foundry": "/foundry.html",
    "deflated-sharpe": "/tools/deflated-sharpe.html",
    "program-status": "/measurements/program-status.html",
    "external-validation": "/measurements/external-validation-opportunities.html",
    "verify": "/verify.html",
}
VIEWPORTS = {
    "desktop": {"width": 1440, "height": 1000},
    "mobile": {"width": 390, "height": 844},
}


def main() -> int:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    results: list[dict[str, object]] = []

    with sync_playwright() as playwright:
        for viewport_name, viewport in VIEWPORTS.items():
            for route_name, route in ROUTES.items():
                # Isolate every evidence page. Chromium retains large paint
                # surfaces across contexts, which can exhaust screenshot
                # resources after visiting the longest records.
                browser = playwright.chromium.launch(headless=True)
                context = browser.new_context(viewport=viewport, device_scale_factor=1)
                page = context.new_page()
                console_errors: list[str] = []
                page_errors: list[str] = []

                def record_console(message: ConsoleMessage) -> None:
                    if message.type == "error":
                        console_errors.append(message.text)

                def record_page_error(error: Error) -> None:
                    page_errors.append(str(error))

                page.on("console", record_console)
                page.on("pageerror", record_page_error)
                response = page.goto(f"{BASE_URL}{route}", wait_until="networkidle")
                page.evaluate("document.fonts.ready")
                screenshot = OUTPUT / f"{route_name}-{viewport_name}.png"
                # Capture the first viewport before exercising the entire page.
                # Several evidence routes are taller than Chromium's reliable
                # single-bitmap limit, while their complete layouts are still
                # inspected by the scroll and DOM checks below.
                page.screenshot(path=str(screenshot), full_page=False)
                page.evaluate(
                    """
                    async () => {
                      const step = Math.max(320, Math.floor(innerHeight * 0.75));
                      for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
                        scrollTo(0, y);
                        await new Promise((resolve) => setTimeout(resolve, 35));
                      }
                      scrollTo(0, 0);
                      await new Promise((resolve) => setTimeout(resolve, 150));
                    }
                    """
                )

                diagnostics = page.evaluate(
                    """
                    () => {
                      const root = document.documentElement;
                      const brokenImages = [...document.images]
                        .filter((image) => image.complete && image.naturalWidth === 0)
                        .map((image) => image.currentSrc || image.src);
                      const isIntentionallyClipped = (element) => {
                        if (element.closest('[aria-hidden="true"], .honeypot')) return true;
                        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
                          const overflow = getComputedStyle(parent).overflowX;
                          if (['auto', 'scroll', 'hidden', 'clip'].includes(overflow)) return true;
                        }
                        return false;
                      };
                      const overflowing = [...document.querySelectorAll('body *')]
                        .map((element) => {
                          const rect = element.getBoundingClientRect();
                          const style = getComputedStyle(element);
                          return {
                            tag: element.tagName.toLowerCase(),
                            id: element.id,
                            className: typeof element.className === 'string'
                              ? element.className.slice(0, 120)
                              : '',
                            left: rect.left,
                            right: rect.right,
                            width: rect.width,
                            position: style.position,
                          };
                        })
                        .filter((item) => item.width > 1
                          && item.position !== 'fixed'
                          && (item.left < -1 || item.right > root.clientWidth + 1))
                        .slice(0, 20);
                      const unclippedOverflowing = [...document.querySelectorAll('body *')]
                        .filter((element) => {
                          const rect = element.getBoundingClientRect();
                          const style = getComputedStyle(element);
                          return rect.width > 1
                            && style.position !== 'fixed'
                            && (rect.left < -1 || rect.right > root.clientWidth + 1)
                            && !isIntentionallyClipped(element);
                        })
                        .map((element) => ({
                          tag: element.tagName.toLowerCase(),
                          id: element.id,
                          className: typeof element.className === 'string'
                            ? element.className.slice(0, 120)
                            : '',
                        }))
                        .slice(0, 20);
                      const hiddenMainSections = [...document.querySelectorAll('main section, main article')]
                        .filter((element) => element.innerText.trim().length > 20)
                        .filter((element) => {
                          if (element.closest('[aria-hidden="true"]')) return false;
                          for (let node = element; node && node !== document.body; node = node.parentElement) {
                            const style = getComputedStyle(node);
                            if (style.display === 'none' || style.visibility === 'hidden'
                                || Number(style.opacity) < 0.01) return true;
                          }
                          return false;
                        })
                        .map((element) => ({
                          tag: element.tagName.toLowerCase(),
                          id: element.id,
                          className: typeof element.className === 'string'
                            ? element.className.slice(0, 120)
                            : '',
                        }))
                        .slice(0, 20);
                      return {
                        title: document.title,
                        h1Count: document.querySelectorAll('h1').length,
                        mainCount: document.querySelectorAll('main').length,
                        documentHeight: root.scrollHeight,
                        horizontalOverflow: root.scrollWidth - root.clientWidth,
                        brokenImages,
                        overflowing,
                        unclippedOverflowing,
                        hiddenMainSections,
                      };
                    }
                    """
                )
                results.append(
                    {
                        "route": route,
                        "viewport": viewport_name,
                        "http_status": response.status if response else None,
                        "console_errors": console_errors,
                        "page_errors": page_errors,
                        "screenshot": str(screenshot),
                        "screenshot_scope": "first_viewport",
                        **diagnostics,
                    }
                )
                page.close()
                context.close()
                browser.close()

    failures = [
        result
        for result in results
        if result["http_status"] != 200
        or result["console_errors"]
        or result["page_errors"]
        or result["h1Count"] != 1
        or result["mainCount"] != 1
        or result["horizontalOverflow"] > 1
        or result["brokenImages"]
        or result["unclippedOverflowing"]
        or result["hiddenMainSections"]
    ]
    report = {
        "schema": "canli.website-visual-qa.v1",
        "base_url": BASE_URL,
        "routes": len(ROUTES),
        "viewports": VIEWPORTS,
        "checks": len(results),
        "passed": not failures,
        "failures": failures,
        "results": results,
    }
    (OUTPUT / "report.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({key: report[key] for key in ("checks", "passed", "failures")}, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
