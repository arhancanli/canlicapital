#!/usr/bin/env python3
"""Rendered quality audit for the Canli Capital landing and public app surfaces."""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

from playwright.sync_api import Error, Page, sync_playwright


OUTPUT = Path(os.environ.get("CANLI_AUDIT_DIR", "/tmp/canli-ui-audit"))
AXE_PATH = Path(os.environ.get("CANLI_AXE_PATH", "/tmp/canli-axe.min.js"))
PAGES = (
    ("landing-home", "http://127.0.0.1:4173/"),
    ("landing-systems", "http://127.0.0.1:4173/systems"),
    ("landing-evidence", "http://127.0.0.1:4173/performance"),
    ("landing-open", "http://127.0.0.1:4173/open"),
    ("landing-progress", "http://127.0.0.1:4173/progress"),
    ("app-home", "http://127.0.0.1:3000/"),
    ("app-how", "http://127.0.0.1:3000/how-it-works"),
    ("app-research", "http://127.0.0.1:3000/research"),
)
SCOPE = os.environ.get("CANLI_AUDIT_SCOPE", "all").strip().lower()
VIEWPORTS = (
    ("desktop", {"width": 1440, "height": 900}),
    ("mobile", {"width": 390, "height": 844}),
)


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9-]+", "-", value.lower()).strip("-")


def inspect_dom(page: Page) -> dict[str, object]:
    return page.evaluate(
        """
        () => {
          const visible = (el) => {
            const cs = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
          };
          const text = (el) => (el.innerText || el.textContent || '').trim().replace(/\\s+/g, ' ');
          const name = (el) => el.getAttribute('aria-label') ||
            (el.getAttribute('aria-labelledby') || '').split(/\\s+/).map(id => text(document.getElementById(id) || {})).join(' ').trim() ||
            (el.labels ? [...el.labels].map(text).join(' ') : '') || el.getAttribute('alt') || text(el);
          const focusableSelector = 'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"]),summary';
          const focusables = [...document.querySelectorAll(focusableSelector)].filter(visible);
          const smallTargets = focusables.flatMap(el => {
            const r = el.getBoundingClientRect();
            const isInline = el.tagName === 'A' && getComputedStyle(el).display === 'inline';
            return !isInline && (r.width < 24 || r.height < 24)
              ? [{tag: el.tagName, name: name(el).slice(0, 100), width: Math.round(r.width), height: Math.round(r.height)}]
              : [];
          });
          const unnamed = focusables.flatMap(el => name(el)
            ? [] : [{tag: el.tagName, html: el.outerHTML.slice(0, 180)}]);
          const ids = [...document.querySelectorAll('[id]')].map(el => el.id);
          const duplicateIds = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
          const hiddenFocusable = [...document.querySelectorAll('[aria-hidden="true"]')].flatMap(root =>
            [...root.querySelectorAll(focusableSelector)].filter(visible).map(el => ({
              root: root.outerHTML.slice(0, 120), child: el.outerHTML.slice(0, 120)
            }))
          );
          const images = [...document.images].flatMap(img => {
            const errors = [];
            if (!img.hasAttribute('alt')) errors.push('missing-alt');
            if (!img.getAttribute('width') || !img.getAttribute('height')) errors.push('missing-dimensions');
            return errors.length ? [{src: img.currentSrc || img.src, errors}] : [];
          });
          const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
            .filter(visible).map(el => ({level: Number(el.tagName.slice(1)), text: text(el).slice(0, 140)}));
          const headingSkips = headings.flatMap((h, i) => i && h.level > headings[i - 1].level + 1
            ? [{from: headings[i - 1], to: h}] : []);
          return {
            title: document.title,
            lang: document.documentElement.lang,
            canonical: document.querySelector('link[rel="canonical"]')?.href || null,
            description: document.querySelector('meta[name="description"]')?.content || null,
            h1Count: headings.filter(h => h.level === 1).length,
            headings,
            headingSkips,
            duplicateIds,
            unnamed,
            smallTargets,
            hiddenFocusable,
            images,
            focusableCount: focusables.length,
            overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
          };
        }
        """
    )


def keyboard_trace(page: Page, count: int = 18) -> list[dict[str, object]]:
    page.evaluate("document.activeElement?.blur()")
    trace: list[dict[str, object]] = []
    for _ in range(count):
        page.keyboard.press("Tab")
        item = page.evaluate(
            """
            () => {
              const el = document.activeElement;
              const cs = getComputedStyle(el);
              const r = el.getBoundingClientRect();
              return {
                tag: el?.tagName || null,
                text: (el?.getAttribute('aria-label') || el?.innerText || el?.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 100),
                href: el?.getAttribute?.('href') || null,
                width: Math.round(r.width), height: Math.round(r.height),
                visible: r.bottom > 0 && r.top < innerHeight,
                outline: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0,
                shadow: cs.boxShadow !== 'none',
              };
            }
            """
        )
        trace.append(item)
    return trace


def axe(page: Page) -> dict[str, object]:
    try:
        page.add_script_tag(path=AXE_PATH)
        result = page.evaluate(
            """
            async () => {
              const result = await axe.run(document, {
                runOnly: {type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}
              });
              return {
                violations: result.violations.map(v => ({
                  id: v.id, impact: v.impact, help: v.help,
                  nodes: v.nodes.map(n => ({target: n.target, summary: n.failureSummary, html: n.html}))
                })),
                passes: result.passes.length,
                incomplete: result.incomplete.map(v => ({id: v.id, impact: v.impact, help: v.help}))
              };
            }
            """
        )
        return result
    except Error as error:
        return {"error": str(error)}


def audit_page(page: Page, label: str, url: str, viewport_name: str) -> dict[str, object]:
    console_errors: list[str] = []
    page_errors: list[str] = []
    page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
    page.on("pageerror", lambda error: page_errors.append(str(error)))
    response = page.goto(url, wait_until="domcontentloaded", timeout=45_000)
    page.wait_for_timeout(1_200)
    page.screenshot(path=OUTPUT / f"{slug(label)}-{viewport_name}.png", full_page=True)
    dom = inspect_dom(page)
    axe_result = axe(page)
    keyboard = keyboard_trace(page)
    return {
        "label": label,
        "url": page.url,
        "viewport": viewport_name,
        "httpStatus": response.status if response else None,
        "consoleErrors": console_errors,
        "pageErrors": page_errors,
        "dom": dom,
        "keyboard": keyboard,
        "axe": axe_result,
    }


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    results: list[dict[str, object]] = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        selected_pages = tuple(
            page for page in PAGES if SCOPE == "all" or page[0].startswith(f"{SCOPE}-")
        )
        for viewport_name, viewport in VIEWPORTS:
            context = browser.new_context(viewport=viewport, color_scheme="dark")
            for label, url in selected_pages:
                page = context.new_page()
                try:
                    results.append(audit_page(page, label, url, viewport_name))
                except Error as error:
                    results.append({"label": label, "url": url, "viewport": viewport_name, "error": str(error)})
                finally:
                    page.close()
            context.close()
        if SCOPE in {"all", "landing"}:
            reduced = browser.new_context(
                viewport={"width": 1440, "height": 900}, reduced_motion="reduce", color_scheme="dark"
            )
            page = reduced.new_page()
            page.goto(PAGES[0][1], wait_until="domcontentloaded", timeout=45_000)
            page.wait_for_timeout(1_200)
            results.append({
                "label": "landing-home-reduced-motion",
                "activeAnimations": page.evaluate(
                    "[...document.getAnimations()].filter(a => a.playState === 'running').map(a => ({duration: a.effect?.getTiming().duration, iterations: a.effect?.getTiming().iterations}))"
                ),
            })
            reduced.close()
        browser.close()
    report = {"schema": "canli.render-audit.v1", "output": str(OUTPUT), "results": results}
    (OUTPUT / "report.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
