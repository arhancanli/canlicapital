"""Capture a production-build browser baseline before the product-system migration."""

from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from playwright.sync_api import Browser, Page, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
ORIGIN = os.environ.get("PERFORMANCE_BASELINE_ORIGIN", "http://127.0.0.1:4173").rstrip("/")
OUTPUT = ROOT / "artifacts" / "qa" / "performance-baseline.json"
VIEWPORTS = {
    "desktop": {"width": 1440, "height": 1000, "is_mobile": False, "has_touch": False},
    "mobile": {"width": 390, "height": 844, "is_mobile": True, "has_touch": True},
}

PERFORMANCE_OBSERVERS = """
(() => {
  window.__canliPerformance = {
    lcp: 0,
    cls: 0,
    longTasks: [],
    interactions: []
  };
  const state = window.__canliPerformance;
  const observe = (type, callback, options = {}) => {
    if (!PerformanceObserver.supportedEntryTypes.includes(type)) return;
    const observer = new PerformanceObserver((list) => callback(list.getEntries()));
    observer.observe({ type, buffered: true, ...options });
  };
  observe('largest-contentful-paint', (entries) => {
    const last = entries.at(-1);
    if (last) state.lcp = last.startTime;
  });
  observe('layout-shift', (entries) => {
    for (const entry of entries) {
      if (!entry.hadRecentInput) state.cls += entry.value;
    }
  });
  observe('longtask', (entries) => {
    state.longTasks.push(...entries.map((entry) => ({
      start: entry.startTime,
      duration: entry.duration
    })));
  });
  observe('event', (entries) => {
    state.interactions.push(...entries
      .filter((entry) => entry.interactionId > 0)
      .map((entry) => ({
        name: entry.name,
        duration: entry.duration,
        interactionId: entry.interactionId
      })));
  }, { durationThreshold: 16 });
})();
"""


def source_fingerprint() -> str:
    digest = hashlib.sha256()
    for relative_path in ("index.html", "css/home.css", "js/home.js", "package-lock.json"):
        path = ROOT / relative_path
        digest.update(relative_path.encode())
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return f"sha256:{digest.hexdigest()}"


def audit_page(page: Page, name: str) -> dict[str, object]:
    console_errors: list[str] = []
    page_errors: list[str] = []
    page.on(
        "console",
        lambda message: console_errors.append(message.text) if message.type == "error" else None,
    )
    page.on("pageerror", lambda error: page_errors.append(str(error)))
    response = page.goto(ORIGIN, wait_until="networkidle")
    page.wait_for_timeout(800)
    page.get_by_role("button", name="Forge").click()
    page.wait_for_timeout(350)

    metrics = page.evaluate(
        """
        () => {
          const state = window.__canliPerformance;
          const navigation = performance.getEntriesByType('navigation')[0];
          const resources = performance.getEntriesByType('resource');
          const sum = (values) => values.reduce((total, value) => total + value, 0);
          const byType = (type) => resources.filter((entry) => entry.initiatorType === type);
          const interactionDurations = state.interactions.map((entry) => entry.duration);
          const longTaskDurations = state.longTasks.map((entry) => entry.duration);
          return {
            navigation: {
              time_to_first_byte_ms: navigation.responseStart,
              dom_content_loaded_ms: navigation.domContentLoadedEventEnd,
              load_event_ms: navigation.loadEventEnd
            },
            web_vitals: {
              largest_contentful_paint_ms: state.lcp,
              cumulative_layout_shift: state.cls,
              interaction_to_next_paint_ms: null
            },
            synthetic_interaction: {
              maximum_event_duration_ms: interactionDurations.length
                ? Math.max(...interactionDurations)
                : null,
              observed_event_entries: state.interactions.length,
              note: 'A scripted local click is not field INP.'
            },
            main_thread: {
              long_task_count: state.longTasks.length,
              long_task_total_ms: sum(longTaskDurations),
              long_task_max_ms: longTaskDurations.length ? Math.max(...longTaskDurations) : 0
            },
            transfer: {
              request_count: resources.length + 1,
              total_transfer_bytes: navigation.transferSize + sum(resources.map((entry) => entry.transferSize || 0)),
              total_encoded_body_bytes: navigation.encodedBodySize + sum(resources.map((entry) => entry.encodedBodySize || 0)),
              javascript_transfer_bytes: sum(byType('script').map((entry) => entry.transferSize || 0)),
              css_transfer_bytes: sum(byType('link').map((entry) => entry.transferSize || 0))
            },
            observed_lcp_element: (() => {
              const entries = performance.getEntriesByType('largest-contentful-paint');
              const element = entries.at(-1)?.element;
              if (!element) return null;
              return {
                tag: element.tagName.toLowerCase(),
                id: element.id || null,
                class: typeof element.className === 'string' ? element.className : null
              };
            })()
          };
        }
        """
    )
    return {
        "name": name,
        "viewport": page.viewport_size,
        "http_status": response.status if response else None,
        "console_errors": console_errors,
        "page_errors": page_errors,
        **metrics,
    }


def capture(browser: Browser, name: str, viewport: dict[str, object]) -> dict[str, object]:
    context = browser.new_context(
        viewport={"width": viewport["width"], "height": viewport["height"]},
        device_scale_factor=1,
        is_mobile=viewport["is_mobile"],
        has_touch=viewport["has_touch"],
        reduced_motion="no-preference",
    )
    page = context.new_page()
    page.add_init_script(PERFORMANCE_OBSERVERS)
    try:
        return audit_page(page, name)
    finally:
        context.close()


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        records = [capture(browser, name, viewport) for name, viewport in VIEWPORTS.items()]
        browser_version = browser.version
        browser.close()

    report = {
        "schema": "canli.product-performance-baseline.v1",
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "origin": ORIGIN,
        "browser": {"name": "Chromium", "version": browser_version, "headless": True},
        "source_fingerprint": source_fingerprint(),
        "quality_targets": {
            "mobile_lcp_ms_max": 2500,
            "inp_ms_max": 200,
            "cls_max": 0.05,
        },
        "claim_boundary": (
            "Loopback measurements from a production Vite build in headless Chromium. They are a "
            "repeatable engineering baseline, not production field data. Scripted event timing does "
            "not establish Interaction to Next Paint."
        ),
        "records": records,
    }
    OUTPUT.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    print(json.dumps(report, indent=2, sort_keys=True))

    failures = [
        record
        for record in records
        if record["http_status"] != 200 or record["console_errors"] or record["page_errors"]
    ]
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
