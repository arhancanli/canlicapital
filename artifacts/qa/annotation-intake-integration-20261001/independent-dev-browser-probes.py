"""Independent synthetic browser peer probes. Never submit labels or visit external sites."""
import hashlib
import json
import subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path('/Users/arhancanli/canlicapital-annotation-peer-20261001')
OUT = Path('/Users/arhancanli/canlicapital-coordination-20261001/annotation-peer')
OUT.mkdir(exist_ok=True)
BASE = 'http://127.0.0.1:5199'
packet = json.loads((ROOT / 'public/datasets/filing-facts/v0/gold-packet-v0.json').read_text())
digest = subprocess.check_output(['node', '--input-type=module', '-e', "import {readFileSync} from 'node:fs';import {packetDigest} from './scripts/datasets/filing-facts/agreement.mjs';console.log(packetDigest(JSON.parse(readFileSync('public/datasets/filing-facts/v0/gold-packet-v0.json'))));"], cwd=ROOT, text=True).strip()
key = 'canli.annotate.filing-facts.v1.' + digest
first = packet['labels'][0]['id']
schema = 'canli.filing-facts-annotation-draft.v1'
results = []

def seed(**changes):
    return dict({'schema': schema, 'packet_sha256': digest, 'index': 0, 'annotator': 'synthetic-peer', 'answers': {}}, **changes)

def fresh(browser, storage=None, init=None, changed=None):
    page = browser.new_page(viewport={'width': 1280, 'height': 900}, reduced_motion='reduce')
    errors, external = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda req: external.append(req.url) if not req.url.startswith(BASE) else None)
    page.route('**/*', lambda route: route.continue_() if route.request.url.startswith(BASE) else route.abort())
    if storage:
        page.add_init_script("if (!sessionStorage.getItem('peer-seeded')) { for (const [k,v] of Object.entries(" + json.dumps(storage) + ")) localStorage.setItem(k,v); sessionStorage.setItem('peer-seeded','1'); }")
    if init:
        page.add_init_script(init)
    if changed:
        page.route('**/datasets/filing-facts/v0/gold-packet-v0.json', lambda route: route.fulfill(json=changed))
    page.goto(BASE + '/annotate.html')
    page.wait_for_load_state('networkidle')
    return page, errors, external

def finish(name, page, errors, external, **evidence):
    assert not errors, (name, errors)
    assert not external, (name, external)
    results.append({'case': name, 'passed': True, 'page_errors': errors, 'external_requests': external, **evidence})
    page.close()

def download(page, role_name, filename):
    with page.expect_download() as pending:
        page.get_by_role('button', name=role_name, exact=True).click()
    destination = OUT / filename
    pending.value.save_as(destination)
    return destination.read_text()

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page, errors, external = fresh(browser, {key: json.dumps(seed(packet_sha256='a' * 64, answers={first: {'question_clear': 'yes'}}))})
    assert page.locator('input[type=radio]:checked').count() == 0
    original = download(page, 'Download earlier draft 1', 'foreign-original.json')
    assert json.loads(original)['packet_sha256'] == 'a' * 64
    finish('foreign-current-digest-refused-with-exact-recovery', page, errors, external)

    raw = '{broken synthetic JSON\n'
    page, errors, external = fresh(browser, {key: raw})
    assert download(page, 'Download earlier draft 1', 'damaged-original.json') == raw
    page.locator('#annotate-question_clear-yes').check()
    page.reload(); page.wait_for_load_state('networkidle')
    assert page.locator('#annotate-question_clear-yes').is_checked()
    assert page.get_by_role('button', name='Download earlier draft').count() == 1
    assert download(page, 'Download earlier draft 1', 'damaged-reloaded.json') == raw
    finish('damaged-draft-recovery-survives-save-and-reload-without-duplication', page, errors, external)

    raw = json.dumps(seed(index=999, annotator={}, answers={first: {'question_clear': 'yes', 'answer_matches_filing': 'maybe', 'notes': ['bad']}, 'foreign': {'citation_correct': 'yes'}}))
    page, errors, external = fresh(browser, {key: raw})
    assert page.locator('#annotate-question_clear-yes').is_checked()
    assert page.locator('input[type=radio]:checked').count() == 1
    assert page.locator('#annotate-notes').input_value() == ''
    assert download(page, 'Download earlier draft 1', 'sanitized-original.json') == raw
    finish('matching-malformed-fields-sanitized-and-original-bytes-retained', page, errors, external)

    clip = "Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.__peerCopy=text}}});"
    answers = {first: {'question_clear': 'yes', 'answer_matches_filing': 'cannot_find', 'citation_correct': 'yes', 'notes': '   '}}
    page, errors, external = fresh(browser, {key: json.dumps(seed(answers=answers))}, init=clip)
    assert page.locator('.annotate__warn').is_visible()
    page.get_by_role('button', name='Copy completed reviews', exact=True).click()
    copied = page.evaluate('window.__peerCopy')
    assert json.loads(copied[copied.index('{'):copied.rindex('}') + 1])['labels'] == []
    draft = json.loads(download(page, 'Download my draft', 'partial-draft.json'))
    assert len(draft['labels']) == 50 and draft['labels'][0]['answer_matches_filing'] == 'cannot_find'
    assert draft['packet_sha256'] == digest
    page.locator('#annotate-notes').fill('Synthetic source note: statement checked, item absent.')
    page.get_by_role('button', name='Copied completed reviews', exact=True).click()
    copied = page.evaluate('window.__peerCopy')
    body = json.loads(copied[copied.index('{'):copied.rindex('}') + 1])
    assert len(body['labels']) == 1 and body['packet_sha256'] == digest and body['labels'][0]['notes']
    finish('negative-without-note-excluded-from-copy-and-preserved-in-draft', page, errors, external, packet_sha256=digest)

    page, errors, external = fresh(browser, {key: json.dumps(seed(annotator=''))}, init=clip)
    page.get_by_role('button', name='Copy completed reviews', exact=True).click()
    assert page.evaluate('window.__peerCopy') is None
    assert page.locator('#annotate-name').evaluate('(el)=>el===document.activeElement')
    finish('unnamed-copy-refused-and-name-control-focused', page, errors, external)

    page, errors, external = fresh(browser, init="Storage.prototype.getItem=function(){throw new Error('synthetic blocked storage')}")
    assert page.locator('.annotate__storage').is_visible()
    page.locator('#annotate-question_clear-no').check()
    page.locator('#annotate-notes').fill('Synthetic unsaved source note')
    draft = json.loads(download(page, 'Download my draft', 'unsaved-memory.json'))
    assert draft['labels'][0]['question_clear'] == 'no' and draft['labels'][0]['notes'] == 'Synthetic unsaved source note'
    finish('blocked-storage-shown-and-unsaved-memory-remains-downloadable', page, errors, external)

    page, errors, external = fresh(browser, init="Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw new Error('synthetic clipboard failure')}}});")
    page.locator('#annotate-name').fill('synthetic-peer')
    page.get_by_role('button', name='Copy completed reviews', exact=True).click()
    assert page.get_by_role('button', name='Copy failed: use Download', exact=True).count() == 1
    finish('clipboard-failure-disclosed-with-download-available', page, errors, external)

    page, errors, external = fresh(browser)
    page.locator('#annotate-question_clear-yes').focus()
    page.keyboard.press('ArrowRight')
    assert page.locator('#annotate-question_clear-no').is_checked()
    assert page.locator('#annotate-question_clear-no').evaluate('(el)=>el===document.activeElement')
    page.keyboard.press('ArrowLeft')
    assert page.locator('#annotate-question_clear-yes').is_checked()
    assert page.locator('#annotate-question_clear-yes').evaluate('(el)=>el===document.activeElement')
    page.get_by_role('button', name='Next', exact=True).click()
    assert page.locator('#annotate-question').evaluate('(el)=>el===document.activeElement')
    finish('native-radio-arrows-retain-focus-across-renders-and-item-navigation', page, errors, external)

    changed = json.loads(json.dumps(packet)); changed['labels'][0]['question'] += ' changed synthetic source'
    page, errors, external = fresh(browser, {key: json.dumps(seed(answers={first: {'question_clear': 'yes'}}))}, changed=changed)
    assert page.locator('input[type=radio]:checked').count() == 0
    changedDraft = json.loads(download(page, 'Download my draft', 'changed-packet-draft.json'))
    assert changedDraft['packet_sha256'] != digest
    finish('changed-question-gets-distinct-binding-and-old-labels-stay-unapplied', page, errors, external)

    unsafe = json.loads(json.dumps(packet)); unsafe['labels'][0]['filings'] = ['javascript:alert(1)']
    page, errors, external = fresh(browser, changed=unsafe)
    assert page.locator('.annotate__question').count() == 0
    assert 'could not be loaded and checked' in page.locator('#annotate-app').inner_text()
    finish('unsafe-packet-refused-before-any-form-render', page, errors, external)
    version = browser.version
    browser.close()

result = {'reviewed_commit': subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(), 'synthetic_only': True, 'browser': version, 'mode': 'isolated Vite development server', 'cases': results, 'passed': len(results), 'human_labels_or_submissions': 0}
(OUT / 'review.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'reviewed_commit': result['reviewed_commit'], 'passed': len(results), 'browser': version, 'external_requests': 0, 'human_labels_or_submissions': 0}))
