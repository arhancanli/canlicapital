"""Hosted read-only regression against this phase's exact preview deployment."""
import json,sys
from pathlib import Path
out=Path('artifacts/qa/phase10-backend')
origin=json.loads((out/'deployment.json').read_text())['url']
if len(sys.argv)>1 and sys.argv[1]=='safari':
 source=Path('scripts/audit-phase4-safari.py').read_text().replace('artifacts/qa/phase4-shell/safari',str(out/'safari'))
else:
 source=Path('scripts/audit-phase8-journeys.py').read_text().replace('artifacts/qa/phase8-release',str(out))
 source=source.replace("page.route('**/api/v1/keys',lambda r:r.abort());","page.route('**/*',lambda r:r.continue_() if r.request.method in ['GET','HEAD','OPTIONS'] else r.abort());page.route('**/api/v1/keys',lambda r:r.abort());")
 sys.argv=[sys.argv[0],'--normal']
exec(compile(source.replace('http://127.0.0.1:4188',origin),'phase10-browser-regression','exec'),{'__name__':'__main__'})
