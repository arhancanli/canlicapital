"""Save Figma tool-generated screenshot bytes without logging short-lived URLs."""
import argparse
import base64
import json
import time
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import urlopen

parser = argparse.ArgumentParser()
parser.add_argument('result')
parser.add_argument('output')
args = parser.parse_args()
result = json.loads(Path(args.result).read_text())
data = None
for content in result.get('content', []):
    if content.get('type') == 'image':
        data = base64.b64decode(content['data'])
        break
    if content.get('type') == 'text':
        try: payload = json.loads(content['text'])
        except (ValueError, TypeError): continue
        if not isinstance(payload, dict) or not payload.get('image_url'): continue
        url = urlparse(payload['image_url'])
        if url.scheme != 'https' or url.hostname != 'www.figma.com' or not url.path.startswith('/api/mcp/asset/'):
            raise ValueError('Unexpected screenshot source')
        # A freshly requested render may return HTTP 202 with no bytes yet.
        # Bound the readiness wait; never treat an empty response as an image.
        for attempt in range(6):
            with urlopen(payload['image_url'], timeout=20) as response:
                status = response.status
                data = response.read()
            if status != 202: break
            if attempt < 5: time.sleep(2)
        break
if not data: raise ValueError('No screenshot in tool result')
target = Path(args.output)
target.parent.mkdir(parents=True, exist_ok=True)
target.write_bytes(data)
print(json.dumps({'saved': str(target), 'bytes': len(data)}))
