"""Verify the versioned concept declarations against captured FASB schema bytes."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import xml.etree.ElementTree as ET
source, output = map(Path, sys.argv[1:3])
config = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', 'import {EXTENDED_CONCEPTS,TAXONOMY_BINDING} from "./scripts/lib/company-extended-concepts.mjs"; import {createHash} from "node:crypto"; console.log(JSON.stringify({concepts:EXTENDED_CONCEPTS,binding:TAXONOMY_BINDING,definitionHash:createHash("sha256").update(JSON.stringify(EXTENDED_CONCEPTS)).digest("hex")}));'], text=True))
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
