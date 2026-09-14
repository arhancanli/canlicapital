"""Preserve original main content, allowing documented additions and outer whitespace."""
import json,re
from pathlib import Path
root=Path('artifacts/qa/phase6-hubs');before=json.loads((root/'before.json').read_text());failures=[]
for file,baseline in before.items():
    main=re.search(r'<main\b[^>]*>([\s\S]*?)</main>',Path(file).read_text()).group(1)
    main=re.sub(r'\n<!-- hub-index:start -->[\s\S]*?<!-- hub-index:end -->\n','',main)
    main=re.sub(r'<!-- hub-library:start -->[\s\S]*?<!-- hub-library:end -->','',main)
    main=re.sub(r'<!-- release-basis:start -->[\s\S]*?<!-- release-basis:end -->','',main)
    main=re.sub(r'<!-- hub-library-title:start -->[\s\S]*?<!-- hub-library-title:end -->','--',main)
    main=re.sub(r'<dd class="hub-definition-note">(<small>[^<]*</small>)</dd>',r'\1',main)
    if file=='research.html':main=re.sub(r'(<div[^>]*id="researchLibrary")(?! hidden)',r'\1 hidden',main)
    if main.strip()!=baseline['main'].strip():failures.append(file)
report={'pages':len(before),'failures':failures,'passed':not failures,'additions':['Local section/related-hub navigation','Build-time research library populated from public/research-index.json; no-JS visible']}
(root/'preservation.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2));assert not failures
