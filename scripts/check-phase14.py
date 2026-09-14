"""Read-only hosted regressions, preserving all earlier phase evidence."""
import json,re,sys
from pathlib import Path

root=Path('artifacts/qa/phase14-preview')
origin=json.loads((root/'deployment.json').read_text())['url']
assert re.fullmatch(r'https://meridian-[a-z0-9]+-arhans-projects-ac470eaa\.vercel\.app',origin)
mode=sys.argv[1]
choices={
 'targeted':('audit-phase13.py','artifacts/qa/phase13-corrections'),
 'contrast':('inspect-phase13.py','artifacts/qa/phase13-corrections'),
 'normal':('audit-phase8-journeys.py','artifacts/qa/phase8-release'),
 'safari':('audit-phase4-safari.py','artifacts/qa/phase4-shell/safari'),
 'http':('audit-phase9-http.py','artifacts/qa/phase9-preview'),
 'startup':('trace-phase3-startup.py','artifacts/qa/phase3-publication'),
}
sourcefile,oldout=choices[mode]
out=root/mode;out.mkdir(parents=True,exist_ok=True)
source=Path('scripts',sourcefile).read_text().replace(oldout,str(out))
source=source.replace('http://127.0.0.1:4188',origin).replace('https://meridian-f3xjbosh7-arhans-projects-ac470eaa.vercel.app',origin)
source=source.replace("page.route('**/api/v1/keys',lambda r:r.abort());","page.route('**/*',lambda r:r.continue_() if r.request.method in ['GET','HEAD','OPTIONS'] else r.abort());page.route('**/api/v1/keys',lambda r:r.abort());")
sys.argv=[sys.argv[0]]+(['--origin',origin] if mode in ['targeted','contrast'] else ['--normal'] if mode=='normal' else [])
exec(compile(source,sourcefile,'exec'),{'__name__':'__main__'})
if mode=='contrast':
 assert all(not row['violations'] for row in json.loads((out/'contrast.json').read_text()))
if mode=='http':
 for file in ['routes.json','http-checks-corrected.json']:
  assert all(row['passed'] for row in json.loads((out/file).read_text())),file
