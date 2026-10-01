"""Exercise source binding, draft recovery, keyboard use and real exports with synthetic labels.

Serve the built site, then run: python3 scripts/annotate.browser.py --base-url http://127.0.0.1:5182
Requires Python Playwright and its Chromium browser. No filing review or external submission occurs.
"""
import argparse
import hashlib
import json
from pathlib import Path

from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument("--base-url", default="http://127.0.0.1:5182")
parser.add_argument("--out-dir", default="artifacts/qa/annotation-intake-20261001")
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
out = Path(args.out_dir).resolve()
out.mkdir(parents=True, exist_ok=True)
packet = json.loads((root / "public/datasets/filing-facts/v0/gold-packet-v0.json").read_text())
fields = ["id", "template", "company", "question", "answer", "filings"]
items = [{key: label[key] for key in fields if key in label} for label in sorted(packet["labels"], key=lambda label: label["id"])]
digest = hashlib.sha256(json.dumps({"schema": packet["schema"], "items": items}, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
prefix = "canli.annotate.filing-facts.v1."
key = prefix + digest
legacy = "canli.annotate.filing-facts-v0"
schema = "canli.filing-facts-annotation-draft.v1"
first = packet["labels"][0]["id"]
results = []


def draft(**changes):
    return dict({"schema": schema, "packet_sha256": digest, "index": 0, "annotator": "synthetic-browser-fixture", "answers": {}}, **changes)


def new_page(browser, storage=None, setup=None, width=1440, changed_packet=None):
    page = browser.new_page(viewport={"width": width, "height": 1000}, reduced_motion="reduce")
    errors = []
    external = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("request", lambda request: external.append(request.url) if not request.url.startswith(args.base_url) else None)
    if storage:
        page.add_init_script("if (!sessionStorage.getItem('synthetic-fixture-seeded')) { for (const [key,value] of Object.entries(" + json.dumps(storage) + ")) localStorage.setItem(key,value); sessionStorage.setItem('synthetic-fixture-seeded','1'); }")
    if setup:
        page.add_init_script(setup)
    if changed_packet:
        page.route("**/datasets/filing-facts/v0/gold-packet-v0.json", lambda route: route.fulfill(json=changed_packet))
    page.goto(args.base_url + "/annotate.html")
    page.wait_for_load_state("networkidle")
    return page, errors, external


def record(name, page, errors, external, **evidence):
    assert not errors, (name, errors)
    assert not external, (name, external)
    assert page.locator(".annotate__question").count() == 1, name
    assert page.evaluate("[...document.querySelector('#annotate-app').childNodes].filter(node=>node.nodeType===Node.TEXT_NODE).every(node=>!node.textContent.trim())"), name
    results.append({"case": name, "passed": True, "page_errors": errors, "external_requests": external, **evidence})
    page.close()


def download(page, button, filename):
    with page.expect_download() as pending:
        button.click()
    pending.value.save_as(out / filename)
    return (out / filename).read_text()


def radio(page, group, value):
    page.get_by_role("group", name=group).get_by_role("radio", name=value, exact=True).check()


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    version = browser.version
    for old in [{"index": 999, "answers": {}}, {"index": 0, "answers": None}, {"index": -1, "answers": {}}]:
        original = json.dumps(old, indent=2)
        page, errors, external = new_page(browser, {legacy: original})
        assert page.get_by_role("region", name="Earlier drafts").is_visible()
        assert page.locator("input[type=radio]:checked").count() == 0
        recovered = download(page, page.get_by_role("button", name="Download earlier draft 1", exact=True), f"legacy-{len(results)}.json")
        assert recovered == original
        radio(page, "Is the question clear?", "Yes")
        assert page.evaluate("key => localStorage.getItem(key)", legacy) == original
        record("legacy malformed draft preserved", page, errors, external, original=old, recovered_byte_for_byte=True)

    for bad in [draft(index=999, answers=None), draft(index=-1), draft(index="0", annotator=[]), draft(answers={first: {"question_clear": "yes", "answer_matches_filing": "maybe", "notes": 5}, "foreign": {"question_clear": "yes"}})]:
        original = json.dumps(bad, indent=2)
        page, errors, external = new_page(browser, {key: original})
        recovered = download(page, page.get_by_role("button", name="Download earlier draft 1", exact=True), f"damaged-{len(results)}.json")
        assert recovered == original
        assert "Item 1 of 50" in page.locator(".annotate__progress").inner_text()
        record("matching damaged draft normalized with recovery", page, errors, external, original_preserved=True)

    original = json.dumps(draft(packet_sha256="a" * 64, answers={first: {"question_clear": "yes"}}), indent=2)
    page, errors, external = new_page(browser, {key: original})
    assert page.locator("input[type=radio]:checked").count() == 0
    assert download(page, page.get_by_role("button", name="Download earlier draft 1", exact=True), "foreign-source.json") == original
    page.reload()
    page.wait_for_load_state("networkidle")
    assert page.get_by_role("button", name="Download earlier draft 1", exact=True).count() == 1
    assert page.get_by_role("button", name="Download earlier draft 2", exact=True).count() == 0
    record("foreign source refused; recovery does not multiply on reload", page, errors, external)

    page, errors, external = new_page(browser, {key: "{broken-json"})
    assert download(page, page.get_by_role("button", name="Download earlier draft 1", exact=True), "invalid-original.json") == "{broken-json"
    record("invalid JSON remains recoverable", page, errors, external)

    saved = draft(answers={first: {"question_clear": "yes", "answer_matches_filing": "no", "citation_correct": "yes", "notes": "Synthetic source-note fixture."}})
    page, errors, external = new_page(browser, {key: json.dumps(saved)})
    assert page.locator("input[type=radio]:checked").count() == 3
    assert "1 complete" in page.locator(".annotate__progress").inner_text()
    assert page.get_by_role("region", name="Earlier drafts").count() == 0
    page.get_by_role("button", name="Next", exact=True).click()
    assert page.evaluate("document.activeElement.id") == "annotate-question"
    page.reload()
    page.wait_for_load_state("networkidle")
    assert "Item 2 of 50" in page.locator(".annotate__progress").inner_text()
    page.get_by_role("button", name="Previous", exact=True).click()
    assert page.locator("input[type=radio]:checked").count() == 3
    record("matching source restores complete reviews and navigation", page, errors, external)

    clipboard = "Object.defineProperty(navigator, 'clipboard', {value:{writeText:async text=>{window.syntheticClipboard=text;}}});"
    page, errors, external = new_page(browser, setup=clipboard)
    selected = page.get_by_role("group", name="Is the question clear?").get_by_role("radio", name="Yes", exact=True)
    selected.focus()
    selected.press("Space")
    assert page.evaluate("document.activeElement.id") == "annotate-question_clear-yes"
    page.keyboard.press("ArrowRight")
    assert page.evaluate("document.activeElement.id") == "annotate-question_clear-no"
    radio(page, "Is the question clear?", "Yes")
    radio(page, "Does the stated answer match the filing?", "No")
    radio(page, "Is the citation the right filing?", "Yes")
    assert page.locator(".annotate__warn").is_visible()
    page.get_by_role("button", name="Copy completed reviews", exact=True).click()
    assert page.evaluate("window.syntheticClipboard ?? null") is None
    assert page.evaluate("document.activeElement.id") == "annotate-name"
    page.get_by_label("Name for credit (optional for a draft)").fill("synthetic-browser-fixture")
    page.get_by_role("button", name="Add your name before copying", exact=True).click()
    body = page.evaluate("window.syntheticClipboard")
    copied = json.loads(body[body.index("{"):body.rindex("}") + 1])
    assert copied["labels"] == []
    assert copied["packet_sha256"] == digest
    unfinished = json.loads(download(page, page.get_by_role("button", name="Download my draft", exact=True), "incomplete-draft.json"))
    assert unfinished["labels"][0]["answer_matches_filing"] == "no"
    assert unfinished["labels"][0]["notes"] == ""
    page.get_by_label("Notes", exact=True).fill("Synthetic fixture: the original statement reports another value.")
    assert not page.locator(".annotate__warn").is_visible()
    assert "1 complete" in page.locator(".annotate__progress").inner_text()
    page.get_by_role("button", name="Copied completed reviews", exact=True).click()
    body = page.evaluate("window.syntheticClipboard")
    copied = json.loads(body[body.index("{"):body.rindex("}") + 1])
    assert len(copied["labels"]) == 1 and copied["labels"][0]["notes"]
    (out / "copied-submission.json").write_text(json.dumps(copied, indent=2) + "\n")
    exported = json.loads(download(page, page.get_by_role("button", name="Download my draft", exact=True), "bound-draft.json"))
    assert exported["packet_sha256"] == digest
    assert exported["labels"][0]["notes"] == copied["labels"][0]["notes"]
    page.evaluate("scrollTo(0,0)")
    page.screenshot(path=str(out / "desktop.png"), full_page=True)
    record("keyboard, notes, named submission and real downloads", page, errors, external, complete_labels=1, incomplete_work_preserved=True, digest=digest)

    page, errors, external = new_page(browser, setup="Storage.prototype.setItem=function(){throw new DOMException('synthetic storage failure','QuotaExceededError');};")
    radio(page, "Is the question clear?", "Yes")
    assert page.locator(".annotate__storage").is_visible()
    assert "could not save" in page.locator(".annotate__storage").inner_text()
    page.get_by_label("Notes", exact=True).fill("Synthetic unsaved work.")
    exported = json.loads(download(page, page.get_by_role("button", name="Download my draft", exact=True), "unsaved-draft.json"))
    assert exported["labels"][0]["notes"] == "Synthetic unsaved work."
    record("failed storage is visible; memory work can still download", page, errors, external)

    changed = json.loads(json.dumps(packet))
    changed["labels"][0]["question"] += " (Synthetic changed-source fixture.)"
    original = json.dumps(saved, indent=2)
    page, errors, external = new_page(browser, {key: original}, changed_packet=changed)
    assert page.locator("input[type=radio]:checked").count() == 0
    assert download(page, page.get_by_role("button", name="Download earlier draft 1", exact=True), "prior-packet-draft.json") == original
    radio(page, "Is the question clear?", "Yes")
    assert page.evaluate("key => localStorage.getItem(key)", key) == original
    record("changed question gets separate draft and visible prior-source recovery", page, errors, external)

    for width in [320, 390]:
        page, errors, external = new_page(browser, width=width)
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), width
        page.screenshot(path=str(out / f"mobile-{width}.png"), full_page=True)
        record("narrow viewport without horizontal overflow", page, errors, external, width=width)
    browser.close()

report = {"schema": "canli.annotation-intake-browser-check.v1", "browser": version, "url": args.base_url, "source_packet_sha256": digest, "cases": results, "claims": "Synthetic browser fixtures only; no human review, expert labels, external submission or field-performance result."}
(out / "browser.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({"passed": len(results), "browser": version, "source_packet_sha256": digest, "out_dir": str(out)}, indent=2))
