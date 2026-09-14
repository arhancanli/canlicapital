from pathlib import Path
from PIL import Image
import json
root = Path(__file__).resolve().parents[1]
out = root / 'public/cinema/optical-layers'
out.mkdir(parents=True, exist_ok=True)
manifest = []
for source in sorted((root / 'artifacts/production/optical-layers').glob('layer-*.png')):
    image = Image.open(source)
    dest = out / (source.stem + '.webp')
    image.save(dest, 'WEBP', quality=88, method=6)
    manifest.append({'file': dest.name, 'width': image.width, 'height': image.height, 'bytes': dest.stat().st_size})
(out / 'manifest.json').write_text(json.dumps({'source': 'Original optical-master Blender geometry, isolated components', 'layers': manifest}, indent=2) + '\n')
print(manifest)
