"""Check literal library prose and stable repeated hub enhancement."""
import hashlib,json,os,subprocess
from pathlib import Path
from html.parser import HTMLParser
class Library(HTMLParser):
    def __init__(self):super().__init__();self.active=False;self.rows=[];self.part=None
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=='ul' and a.get('id')=='researchLibraryList':self.active=True
        if not self.active:return
        if tag=='a':self.rows.append({'path':a['href'],'title':'','description':''})
        if tag=='span':self.part='title' if 'title' in a.get('class','') else 'description'
    def handle_endtag(self,tag):
        if tag=='ul':self.active=False
        if tag=='span':self.part=None
    def handle_data(self,data):
        if self.active and self.part:self.rows[-1][self.part]+=data
parser=Library();parser.feed(Path('research.html').read_text())
expected=json.loads(subprocess.check_output(['/Users/arhancanli/.nvm/versions/node/v22.23.2/bin/node','--input-type=module','-e',"import {readFileSync} from 'node:fs';import {normalizeEditableCopy as n} from './scripts/editable-copy.mjs';console.log(JSON.stringify(JSON.parse(readFileSync('public/research-index.json')).papers.map(p=>({path:p.path,title:n(p.title),description:n(p.description||'')}))))"]))
assert parser.rows==expected,'Static index changed source prose or dollar signs'
files=list(json.loads(Path('artifacts/qa/phase6-hubs/before.json').read_text()))
def hashes():return {f:hashlib.sha256(Path(f).read_bytes()).hexdigest() for f in files}
before=hashes()
env=dict(os.environ);env['PATH']='/Users/arhancanli/.nvm/versions/node/v22.23.2/bin:'+env['PATH']
for _ in range(2):
    subprocess.run(['node','scripts/build-hub-experience.mjs'],env=env,check=True)
    assert hashes()==before,'Enhancement is not idempotent'
report={'pages':len(files),'literalLibraryRows':len(expected),'repeatedBuilds':2,'passed':True}
Path('artifacts/qa/phase6-hubs/build-regression.json').write_text(json.dumps(report,indent=2)+'\n');print(report)
