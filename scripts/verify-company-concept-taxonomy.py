"""Verify the versioned concept declarations against captured FASB schema bytes."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import xml.etree.ElementTree as ET
source, output = map(Path, sys.argv[1:3])
# Third argument selects the definition map: 'extended' (default, company-extended-concepts.mjs)
# or 'expanded-v23' (company-expanded-concepts-v23.mjs). Each map gets its own review file.
MAPS = {
    'extended': ('./scripts/lib/company-extended-concepts.mjs', 'EXTENDED_CONCEPTS'),
    'expanded-v23': ('./scripts/lib/company-expanded-concepts-v23.mjs', 'EXPANDED_CONCEPTS_V23'),
}
module, export = MAPS[sys.argv[3] if len(sys.argv) > 3 else 'extended']
config = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', f'import {{{export}}} from "{module}"; import {{TAXONOMY_BINDING}} from "./scripts/lib/company-extended-concepts.mjs"; import {{createHash}} from "node:crypto"; console.log(JSON.stringify({{concepts:{export},binding:TAXONOMY_BINDING,definitionHash:createHash("sha256").update(JSON.stringify({export})).digest("hex")}}));'], text=True))
raw = source.read_bytes()
assert hashlib.sha256(raw).hexdigest() == config['binding']['sha256'], 'Taxonomy bytes changed'
root = ET.fromstring(raw)
elements = {e.attrib['name']: e.attrib for e in root.findall('{http://www.w3.org/2001/XMLSchema}element')}
period = '{http://www.xbrl.org/2003/instance}periodType'
types = {'money': 'xbrli:monetaryItemType', 'shares': 'xbrli:sharesItemType', 'per-share': 'dtr-types:perShareItemType'}
checked = []
for tag, definition in config['concepts'].items():
    element = elements[tag]
    assert element[period] == definition['kind'], tag
    assert element['type'] == types[definition['unitKind']], tag
    assert element.get('abstract', 'false') != 'true', tag
    checked.append({'tag': tag, 'period_type': element[period], 'type': element['type'], 'label': definition['label']})
output.write_text(json.dumps({'schema': 'canli.company-concept-taxonomy-review.v1', 'source': config['binding'], 'definitions_sha256': config['definitionHash'], 'concepts': checked, 'publication_approved': False, 'scope': '2026 period/type declarations; does not establish historical taxonomy equivalence or editorial publication approval'}, indent=2)+'\n')
print(f'{len(checked)} concept period/type declarations verified')
