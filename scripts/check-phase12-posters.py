"""Read-only rendered film-poster decoding check, separate from HTTP success."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
origin='https://meridian-a8gj4f0mf-arhans-projects-ac470eaa.vercel.app'
out=Path('artifacts/qa/phase12-review')
with sync_playwright() as p:
    b=p.chromium.launch(headless=True)
    page=b.new_page(reduced_motion='reduce')
    page.route('**/*',lambda r:r.continue_() if r.request.method in ['GET','HEAD','OPTIONS'] else r.abort())
    page.goto(origin,wait_until='networkidle')
    page.locator('#record-details > summary').click()
    page.locator('#system-films').scroll_into_view_if_needed()
    page.wait_for_timeout(2000)
    displayed=page.locator('[data-film-poster]').evaluate_all('(xs)=>xs.map(i=>({src:i.currentSrc,complete:i.complete,naturalWidth:i.naturalWidth}))')
    urls=[origin+'/system-films/'+n+'-poster.webp' for n in ['engine','broker','record']]
    decoded=page.evaluate('''async urls => await Promise.all(urls.map(async src=>{
        const i=new Image();i.src=src;
        try {await i.decode();return {src,decoded:true,width:i.naturalWidth};}
        catch(e){return {src,decoded:false,error:e.message};}
    }))''',urls)
    report={'displayed':displayed,'standaloneDecodes':decoded}
    page.screenshot(path=str(out/'film-poster-followup.png'))
    (out/'film-posters.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report))
    b.close()
