"""Encode original Blender output for the web; no generated art is retouched."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--source', default='artifacts/production/instrument-sequence')
parser.add_argument('--out', default='public/cinema/instrument')
args = parser.parse_args()
source, out = Path(args.source), Path(args.out)
ffmpeg = Path('node_modules/ffmpeg-static/ffmpeg').resolve()
frames = sorted(source.glob('frame-*.png'))
assert len(frames) == 96, f'Expected 96 source frames, got {len(frames)}'
for variant in ['desktop', 'mobile']: (out / variant).mkdir(parents=True, exist_ok=True)

def encode(job):
    frame, variant, width = job
    target = out / variant / frame.with_suffix('.webp').name
    subprocess.run([str(ffmpeg), '-hide_banner', '-loglevel', 'error', '-y', '-i', str(frame),
        '-vf', f'scale={width}:-1', '-frames:v', '1', '-c:v', 'libwebp', '-quality', '82',
        '-compression_level', '5', str(target)], check=True)
    return target.stat().st_size

with ThreadPoolExecutor(max_workers=4) as pool:
    sizes = list(pool.map(encode, [(frame, variant, width) for frame in frames
        for variant, width in [('desktop', 1280), ('mobile', 768)]]))
manifest = {'source': 'Original ALPHAC Blender model', 'conceptual': True, 'frames': 96,
    'variants': {'desktop': [1280, 800], 'mobile': [768, 480]}, 'totalBytes': sum(sizes),
    'loading': '3 concurrent requests; 20 decoded frames maximum; near-viewport only',
    'fallback': 'Static open assembly for reduced motion, no JavaScript, or failed loads'}
(out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps(manifest, indent=2))
