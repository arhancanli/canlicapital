"""Read-only hosted routing/header/asset checks; never submit forms or keys."""
import argparse,concurrent.futures,hashlib,json,re
from pathlib import Path
from urllib.request import Request,urlopen,build_opener,HTTPRedirectHandler
from urllib.error import HTTPError
ORIGIN='https://meridian-f3xjbosh7-arhans-projects-ac470eaa.vercel.app'
OUT=Path('artifacts/qa/phase9-preview');OUT.mkdir(parents=True,exist_ok=True)
parser=argparse.ArgumentParser();parser.add_argument('--extras-only',action='store_true');args=parser.parse_args()
class NoRedirect(HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):return None
opener=build_opener(NoRedirect)
def request(path,method='GET'):
 try:response=opener.open(Request(ORIGIN+path,method=method),timeout=30)
 except HTTPError as e:response=e
 with response:
  headers={k.lower():v for k,v in response.headers.items() if k.lower() in ['content-type','cache-control','x-robots-tag','location','content-security-policy','permissions-policy','referrer-policy','x-content-type-options','x-frame-options']}
  return response.status,headers,response.read()
inventory=json.loads(Path('artifacts/qa/redesign-scope/inventory.json').read_text())
def inspect_route(r):
 try:
  status,headers,_=request(r['route'],'HEAD')
  return {'route':r['route'],'status':status,'headers':headers,'passed':status==200 and 'text/html' in headers.get('content-type','') and headers.get('x-content-type-options')=='nosniff' and 'noindex' in headers.get('x-robots-tag','')}
 except Exception as e:return {'route':r['route'],'passed':False,'error':str(e)}
rows=json.loads((OUT/'routes.json').read_text()) if args.extras_only else []
if not args.extras_only:
 with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
  for row in pool.map(inspect_route,inventory['routes']):
   rows.append(row)
   if len(rows)%100==0:print({'routesChecked':len(rows),'issues':sum(not x['passed'] for x in rows)},flush=True)
 (OUT/'routes.json').write_text(json.dumps(rows,indent=2)+'\n')
checks=[]
for path,expected in [('/developers.html',308),('/research/',308),('/phase9-deliberately-missing-route',404),('/api/v1/status',200),('/api/v1/chain/head',200),('/api/v1/openapi',200),('/api/v1/validate/status',200),('/sitemap.xml',200),('/robots.txt',200),('/fonts/inter/InterVariable.woff2',200)]:
 status,headers,body=request(path);row={'path':path,'status':status,'headers':headers,'passed':status==expected}
 if path=='/developers.html':row['passed'] &= headers.get('location')=='/developers'
 if path=='/research/':row['passed'] &= headers.get('location')=='/research'
 if path.endswith('.woff2'):row['passed'] &= hashlib.sha256(body).hexdigest()==hashlib.sha256(Path('public'+path).read_bytes()).hexdigest() and 'immutable' in headers.get('cache-control','')
 if path=='/api/v1/validate/status' and status==200:
  data=json.loads(body);row['health']=data
 checks.append(row)
status,headers,body=request('/')
assets=sorted(set(re.findall(r'(?:src|href)="(/assets/[^" ]+\.(?:js|css))"',body.decode())))
for path in assets:
 status,headers,body=request(path);checks.append({'path':path,'status':status,'headers':headers,'passed':status==200 and 'immutable' in headers.get('cache-control','') and Path('dist'+path).exists() and hashlib.sha256(body).digest()==hashlib.sha256(Path('dist'+path).read_bytes()).digest()})
for doc in inventory['protectedDocuments']:
 path=doc['route'];status,headers,body=request(path)
 clean=path.removesuffix('.html');redirect_ok=status==308 and headers.get('location')==clean
 status,headers,body=request(clean)
 preserved=hashlib.sha256(body).digest()==hashlib.sha256(Path(doc['file']).read_bytes()).digest()
 checks.append({'path':path,'cleanPath':clean,'redirectPassed':redirect_ok,'status':status,'originalBytesPreserved':preserved,'passed':redirect_ok and status==200 and preserved})
(OUT/'http-checks-corrected.json').write_text(json.dumps(checks,indent=2)+'\n')
print({'routeChecks':len(rows),'additionalChecks':len(checks),'issues':[r.get('route',r.get('path')) for r in rows+checks if not r['passed']]},flush=True)
