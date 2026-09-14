"""Reuse Phase 8 journeys on the approved hosted preview, blocking all writes."""
from pathlib import Path
import sys
origin='https://meridian-f3xjbosh7-arhans-projects-ac470eaa.vercel.app'
out=Path('artifacts/qa/phase9-preview');out.mkdir(parents=True,exist_ok=True)
source=Path('scripts/audit-phase8-journeys.py').read_text().replace('http://127.0.0.1:4188',origin).replace('artifacts/qa/phase8-release',str(out))
source=source.replace("page.route('**/api/v1/keys',lambda r:r.abort());", "page.route('**/*',lambda r:r.continue_() if r.request.method in ['GET','HEAD','OPTIONS'] else r.abort());page.route('**/api/v1/keys',lambda r:r.abort());")
# Keep a view of the actual hosted candidate before every cross-family journey.
source=source.replace("toggle=page.locator('.cc-shell__index > summary');", "page.screenshot(path=str(out/f'{engine}-{width}-home.png'));toggle=page.locator('.cc-shell__index > summary');")
exec(compile(source,'scripts/audit-phase8-journeys.py','exec'),{'__name__':'__main__'})
