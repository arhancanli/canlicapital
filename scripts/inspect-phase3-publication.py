"""Viewport evidence and source-bound content for editable Figma compositions."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

out=Path('artifacts/qa/phase3-publication/inspection')
out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width,height in [(1440,1000),(390,844)]:
        page=browser.new_page(viewport={'width':width,'height':height},reduced_motion='reduce')
        page.goto('http://127.0.0.1:4188',wait_until='networkidle')
        page.locator('#record-details > summary').click()
        for name,selector in [('record','#live-record'),('api','#developer-api'),('research','#research'),('evidence','.evidence-detail__grid'),('trust','#trust'),('faq','.home-questions'),('access','#access'),('footer','.cc-handoff'),('offering','.offering'),('core','#evidence-core'),('films','#system-films'),('trace','#method')]:
            page.locator(selector).evaluate('e=>window.scrollTo(0,e.getBoundingClientRect().top+scrollY-100)')
            page.wait_for_timeout(300)
            page.screenshot(path=str(out/f'{width}-{name}.png'))
        if width==1440:
            data=page.evaluate('''()=>{
              const text=s=>document.querySelector(s)?.innerText.trim();
              const items=s=>[...document.querySelectorAll(s)].map(n=>({text:n.innerText.trim(),href:n.getAttribute('href')}));
              const svg=s=>{const n=document.querySelector(s),c=n.cloneNode(true);[n,...n.querySelectorAll('*')].forEach((v,i)=>{const t=[c,...c.querySelectorAll('*')][i],css=getComputedStyle(v);for(const key of ['fill','stroke','stroke-width','opacity']) t.setAttribute(key,css.getPropertyValue(key));t.removeAttribute('style')});c.setAttribute('xmlns','http://www.w3.org/2000/svg');c.setAttribute('width','1200');c.setAttribute('height',s.includes('publication')?'260':'400');return c.outerHTML};
              return {record:{title:text('#live-record h2'),copy:text('.record-chapter__copy > p:not(.eyebrow)'),metrics:items('.console-metrics > div'),foot:text('.console-foot'),svg:svg('.console-chart svg')},api:{title:text('#developer-chapter-title'),copy:items('.developer-chapter__copy > p:not(.eyebrow)'),body:items('.api-preview__body > p'),steps:items('.api-preview__steps li'),svg:svg('.publication-route svg'),labels:items('.publication-route figcaption span'),note:text('.publication-route > p')},research:{title:text('#research-title'),copy:items('.research__intro > p:not(.eyebrow)'),counts:text('.research-counts'),cards:items('.paper-card')},trust:{title:text('#trust h2'),copy:text('#trust .section-heading > p'),cards:items('.trust-grid article')},faq:{title:text('.home-questions h2'),questions:items('.home-questions summary')},access:{title:text('#access h2'),copy:text('#access > div > p:not(.eyebrow)'),status:text('#form-status')},evidence:{title:text('#evidence h2'),cards:items('.evidence-ledger article'),objectives:items('.evidence-frontier article'),facts:items('.evidence-detail__grid article'),basis:items('.basis-grid article')},footer:{title:text('.cc-handoff h2'),copy:text('.cc-handoff__intro > p:last-child'),steps:items('.cc-handoff__steps a'),boundary:text('.cc-handoff__boundary')}};
            }''')
            (out/'figma-content.json').write_text(json.dumps(data,indent=2)+'\n')
        page.close()
    browser.close()
