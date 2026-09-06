"""Browser-level regression audit for the evidence-first Canli Capital homepage."""

from __future__ import annotations

import json
import os
import re
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


def audit_page(
    page: Page,
    *,
    name: str,
    width: int,
    height: int,
    reduced_motion: bool = False,
) -> dict[str, object]:
    console_errors: list[str] = []
    page_errors: list[str] = []
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
    page.on("pageerror", lambda error: page_errors.append(str(error)))
    page.set_viewport_size({"width": width, "height": height})
    page.goto(ORIGIN, wait_until="networkidle")

    hero = page.locator("#hero-title")
    # The status strip is the first text in the document. It shipped as four
    # "Loading..." placeholders, which is what a crawler, a social-card generator
    # and anyone with scripts blocked saw as the opening line of the site.
    # build-hero-fallbacks.mjs writes the real values in at build time; this
    # asserts they are there AND that JavaScript agrees with them, so the two can
    # never drift apart in either direction.
    # EVERY element with an id, not a list of four, and every tag, not just
    # <strong>. The earlier version checked four hero cells matched against a
    # `<strong id=...>` pattern; the evidence table's cells are dd, span, small
    # and time, so twenty-four of them said "Pending" to every crawler and every
    # language model while a browser showed the real figures and nothing looked
    # wrong to anyone who could see the page.
    #
    # This same comparison, once widened, immediately found three drawdowns
    # published a hundred times too small and a compact-currency formatter whose
    # output depends on whether Node or Chrome ran it.
    static_html = (ROOT / "index.html").read_text(encoding="utf-8")
    PLACEHOLDER = re.compile(
        r"^(?:loading|pending|checking(?:\s+scope)?|unavailable|tbd|n/a)\b"
        r"|\b(?:loading|unavailable)\b\.?$",
        re.IGNORECASE,
    )
    cells = re.findall(r'<[a-z]+(?:\s[^>]*?)? id="([^"]+)"[^>]*>([^<]*)<', static_html)
    compared = 0
    for element_id, static_raw in cells:
        static_text = static_raw.strip()
        if not static_text:
            continue
        assert not PLACEHOLDER.search(static_text), (
            f"#{element_id} static text is a placeholder ({static_text!r}); "
            "that is what a crawler and a language model read as the record"
        )
        locator = page.locator(f"#{element_id}")
        if locator.count() != 1:
            continue
        # text_content, not inner_text: some of these cells are SVG <title> and
        # <desc> nodes, which are not HTMLElements and raise on inner_text. They
        # are also exactly the cells a screen reader and a crawler read.
        rendered = (locator.text_content() or "").strip()
        if not rendered:
            continue
        compared += 1
        assert not PLACEHOLDER.search(rendered), f"#{element_id} still renders a placeholder"
        assert static_text == rendered, (
            f"#{element_id}: the crawler sees {static_text!r} but JavaScript renders "
            f"{rendered!r}. The static fallback and the claim contract have drifted."
        )
    # A comparison loop whose corpus silently empties reports success forever.
    assert compared >= 40, f"only {compared} homepage cells compared; the sweep collapsed"

    # The per-sleeve broker rows are addressed by attribute rather than by id, so
    # the id sweep above cannot see them. They said "Checking" to every crawler.
    for row in page.locator("[data-broker-row]").all():
        key = row.get_attribute("data-broker-row")
        for selector in ("[data-broker-observation]", "[data-broker-state]"):
            cell = row.locator(selector)
            if cell.count() != 1:
                continue
            rendered = (cell.text_content() or "").strip()
            if not rendered:
                continue
            assert not PLACEHOLDER.search(rendered), (
                f"broker row {key} {selector} still renders a placeholder"
            )
            pattern = rf'data-broker-row="{key}"[\s\S]{{0,600}}?{selector[1:-1]}[^>]*>([^<]*)<'
            match = re.search(pattern, static_html)
            assert match, f"broker row {key} has no static {selector} cell"
            assert match.group(1).strip() == rendered, (
                f"broker row {key} {selector}: crawler sees {match.group(1).strip()!r} "
                f"but JavaScript renders {rendered!r}"
            )

    # The entry scene. Its contract is that it NEVER degrades the page: it only
    # marks itself ready once it holds real data, and the hero must be complete
    # whether or not that happens. Both halves are asserted, because a scene that
    # renders is worth nothing if it can also break the page it sits behind.
    scene = page.locator("#entry-scene")
    if scene.count() == 1:
        label = scene.get_attribute("aria-label") or ""
        if "is-ready" in (scene.get_attribute("class") or ""):
            # Ready means it drew real trials, so it must say how many, and the
            # count must match the published distribution rather than a number
            # someone typed into the mount script.
            distribution = json.loads(
                (ROOT / "public/glassbox/trial_sharpe_distribution.json").read_text(encoding="utf-8")
            )
            assert str(distribution["trials_measured"]) in label, (
                f"entry scene reports {label!r} but the distribution has "
                f"{distribution['trials_measured']} measured trials"
            )
            assert scene.get_attribute("aria-hidden") is None, (
                "entry scene is ready and labelled but still hidden from assistive technology"
            )
        else:
            assert not label, "entry scene is not ready but carries a description of data it never drew"

    assert hero.is_visible()
    assert hero.inner_text() == "A systematic portfolio you can audit while it runs."
    assert page.get_by_role("link", name="View the live record").first.is_visible()
    assert page.get_by_role("link", name="Read the methodology").first.is_visible()
    assert page.locator(".live-console").is_visible()
    assert page.locator(".evidence-ledger").is_visible()
    assert page.locator("#trace-title").is_visible()
    assert page.locator("#sleeves-title").is_visible()
    assert page.locator("#research-title").is_visible()
    assert page.locator("#trust-title").is_visible()
    assert page.locator("#access-title").is_visible()
    public_claims = page.evaluate(
        "async () => (await fetch('/contracts/public-claims.json')).json()"
    )
    claims_by_id = {claim["id"]: claim for claim in public_claims["claims"]}
    reconciled_sleeves = claims_by_id["broker.reconciled-alpaca-sleeves"]["value"]
    assert page.locator("#evidence-accounts").inner_text() == f"{reconciled_sleeves} / paper"
    assert page.locator("#evidence-status").inner_text() == "Broker pass"
    assert page.locator("#hero-record-basis").inner_text() == "Observed paper"
    assert page.locator("#hero-broker-execution").inner_text() == f"{reconciled_sleeves} Alpaca paper sleeves"
    assert page.locator("#hero-paper-since").inner_text().startswith("Since ")
    assert page.locator("#hero-grade").inner_text().startswith("Self-grade ")
    assert page.locator("#objective-forward-sharpe").get_attribute("data-claim-maturity") == "planned"
    assert page.locator("#model-p95-drawdown").get_attribute("data-claim-maturity") == "model_estimated"
    assert page.locator("#correlation-reading").get_attribute("data-claim-maturity") == "simulated"
    assert page.locator("[data-claim-id]").count() >= 21
    assert "Loading" not in page.locator("#evidence-signed-time").inner_text()
    assert "Pending" not in page.locator("#evidence-forward-window").inner_text()
    assert "gross" in page.locator("#evidence-gross-range").inner_text()
    assert page.locator("[data-broker-state='pass']").count() == reconciled_sleeves
    assert "forward goals open" in page.locator("#evidence-validation-label").inner_text()
    assert page.locator("#core-trial-count").inner_text() != "Pending"
    assert page.locator("#core-signed-count").inner_text() != "Pending"
    unresolved = page.locator(
        "#hero-record-basis, #hero-broker-execution, #hero-paper-since, #hero-grade, "
        "#evidence-observations, #evidence-accounts, #evidence-positions, #evidence-status, "
        "#objective-forward-sharpe, #objective-max-drawdown, #model-expected-drawdown, "
        "#model-p95-drawdown, #current-sleeve-count, #target-sleeve-count, #correlation-reading"
    ).evaluate_all(
        "nodes => nodes.filter(node => ['Loading…', 'Pending', 'Not available'].includes(node.textContent.trim())).map(node => node.id)"
    )
    assert unresolved == []

    console_box = page.locator(".live-console").bounding_box()
    console_above_initial_fold = bool(console_box and console_box["y"] < height)
    if width >= 1000 and not reduced_motion:
        assert console_above_initial_fold

    initial_path = page.locator("#equity-path").get_attribute("d")
    page.get_by_role("button", name="Forge").click()
    assert page.get_by_role("button", name="Forge").get_attribute("aria-pressed") == "true"
    assert page.locator("#chart-title").text_content() == "AlphaForge paper equity curve"
    assert page.locator("#equity-path").get_attribute("d") != initial_path
    assert "curve=alphaforge" in page.url

    evidence_core = page.locator("#evidence-core")
    evidence_core.scroll_into_view_if_needed()
    if width >= 1000 and not reduced_motion:
        page.wait_for_function(
            "document.querySelector('#evidence-core').dataset.renderer === 'webgl'",
            timeout=10_000,
        )
        page.evaluate("window.scrollBy(0, window.innerHeight * 1.8)")
        page.wait_for_timeout(900)
        assert evidence_core.get_attribute("data-renderer") == "webgl"
        assert page.locator("#evidence-core-canvas").is_visible()
        assert page.locator("#core-stage-label").inner_text() != "Idea field"
        core_screenshot = OUTPUT / "evidence-core-desktop.png"
        page.screenshot(path=str(core_screenshot), full_page=False)
    else:
        assert evidence_core.get_attribute("data-renderer") == "static"
        core_screenshot = None
    evidence_core_renderer = evidence_core.get_attribute("data-renderer")
    evidence_core_chapter = page.locator("#core-stage-label").inner_text()

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
        "reduced_motion": reduced_motion,
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
        "hydrated_claim_elements": page.locator("[data-claim-id]").count(),
        "unresolved_claim_elements": unresolved,
        "evidence_core_renderer": evidence_core_renderer,
        "evidence_core_chapter": evidence_core_chapter,
        "evidence_core_screenshot": str(core_screenshot.relative_to(ROOT)) if core_screenshot else None,
    }


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        desktop_context = browser.new_context()
        mobile_context = browser.new_context()
        reduced_context = browser.new_context(reduced_motion="reduce")
        records = [
            audit_page(desktop_context.new_page(), name="desktop", width=1440, height=1000),
            audit_page(mobile_context.new_page(), name="mobile", width=390, height=844),
            audit_page(
                reduced_context.new_page(),
                name="reduced-motion",
                width=1440,
                height=1000,
                reduced_motion=True,
            ),
        ]
        desktop_context.close()
        mobile_context.close()
        reduced_context.close()
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
