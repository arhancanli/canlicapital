"""Compare homepage source text/links with the unchanged Phase 12 deployment."""
from html.parser import HTMLParser
from urllib.request import urlopen
from pathlib import Path
import json,re
class Main(HTMLParser):
 def __init__(self):super().__init__();self.active=False;self.skip=False;self.text=[];self.links=[]
 def handle_starttag(self,tag,attrs):
  if tag=='main':self.active=True
  if tag=='script':self.skip=True
  if self.active and tag=='a':self.links.append(dict(attrs).get('href'))
 def handle_endtag(self,tag):
  if tag=='main':self.active=False
  if tag=='script':self.skip=False
 def handle_data(self,data):
  if self.active and not self.skip:self.text.append(data)
def parse(html):
 p=Main();p.feed(html);return re.sub(r'\s+',' ',' '.join(p.text)).strip(),p.links
origin='https://meridian-a8gj4f0mf-arhans-projects-ac470eaa.vercel.app'
with urlopen(origin,timeout=30) as response:old=response.read().decode()
new=Path('index.html').read_text()
chain=json.loads(Path('public/glassbox/transparency_log.json').read_text())
assert f'id="trust-chain">{len(chain["entries"])}<' in new
restored=re.sub(r'(<strong id="trust-chain">)[^<]*(</strong>)',r'\g<1>538\2',new)
before=parse(old);after=parse(restored)
report={'baseline':origin,'mainTextPreservedExceptDocumentedCount':before[0]==after[0],'mainLinksPreserved':before[1]==after[1],'intentionalChange':{'id':'trust-chain','before':538,'after':len(chain['entries']),'source':'public/glassbox/transparency_log.json'},'passed':before==after}
Path('artifacts/qa/phase13-corrections/home-preservation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report));assert report['passed']
