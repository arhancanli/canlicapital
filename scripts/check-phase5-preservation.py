"""Compare the approved phase's immutable start, never rewrite older baselines."""
import re,json
from pathlib import Path
root=Path('artifacts/qa/phase5-developer')
before=json.loads((root/'before.json').read_text())
def signature(main):
 main=re.sub(r'<script\b[^>]*>[\s\S]*?</script>','',main)
 main=re.sub(r'<nav class="dev-page-index"[\s\S]*?</nav>','',main)
 return {'text':re.sub(r'\s+',' ',re.sub(r'<[^>]+>',' ',re.sub(r'<!--[\s\S]*?-->','',main))).strip(),
         'links':re.findall(r'href="([^"]+)"',main),
         'ids':re.findall(r'\bid="([^"]+)"',main),
         'controls':re.findall(r'<(?:button|input|textarea|select)\b[^>]*>',main)}
failures=[]
for path,data in before.items():
 main=re.search(r'<main\b[^>]*>([\s\S]*?)</main>',Path(path).read_text()).group(1)
 a,b=signature(data['main']),signature(main)
 failures.extend(f'{path}: {key}' for key in a if a[key]!=b[key])
report={'pages':len(before),'intentionalAddition':'Developer section navigation only','failures':failures,'passed':not failures}
(root/'preservation.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
assert not failures
