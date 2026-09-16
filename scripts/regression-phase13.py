"""Reuse existing release behavior tests without overwriting earlier evidence."""
import sys
from pathlib import Path
mode=sys.argv[1] if len(sys.argv)>1 else 'journeys'
sourcefile='audit-phase4-safari.py' if mode=='safari' else 'audit-phase8-journeys.py'
out=Path('artifacts/qa/phase13-corrections')/mode;out.mkdir(parents=True,exist_ok=True)
source=Path('scripts',sourcefile).read_text()
source=source.replace('artifacts/qa/phase4-shell/safari',str(out)).replace('artifacts/qa/phase8-release',str(out))
source=source.replace("page.route('**/api/v1/keys',lambda r:r.abort());","page.route('**/*',lambda r:r.continue_() if r.request.method in ['GET','HEAD','OPTIONS'] else r.abort());page.route('**/api/v1/keys',lambda r:r.abort());")
sys.argv=[sys.argv[0]]+(['--normal'] if mode=='normal' else [])
exec(compile(source,sourcefile,'exec'),{'__name__':'__main__'})
