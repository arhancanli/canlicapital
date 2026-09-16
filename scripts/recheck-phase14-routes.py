"""One bounded recheck of failed routes; never overwrite the initial audit."""
import json,re
from pathlib import Path
from urllib.request import Request,urlopen
out=Path('artifacts/qa/phase14-preview/http')
origin=json.loads((out.parent/'deployment.json').read_text())['url']
assert re.fullmatch(r'https://meridian-[a-z0-9]+-arhans-projects-ac470eaa\.vercel\.app',origin)
initial=json.loads((out/'routes.json').read_text())
failed=[row for row in initial if not row['passed']]
assert len(failed)<=5,'Unexpected broad failure: diagnose before retrying'
rows=[]
for row in failed:
 result={'route':row['route'],'initialError':row.get('error'),'attempt':2}
 try:
  with urlopen(Request(origin+row['route'],method='HEAD'),timeout=30) as response:
   headers={key:response.headers.get(key) for key in ['content-type','x-content-type-options','x-robots-tag']}
   result.update(status=response.status,headers=headers,passed=response.status==200 and 'text/html' in (headers['content-type'] or '') and headers['x-content-type-options']=='nosniff' and 'noindex' in (headers['x-robots-tag'] or ''))
 except Exception as error:result.update(passed=False,error=str(error))
 rows.append(result)
(out/'route-rechecks.json').write_text(json.dumps(rows,indent=2)+'\n')
print(json.dumps(rows,indent=2))
assert all(row['passed'] for row in rows)
