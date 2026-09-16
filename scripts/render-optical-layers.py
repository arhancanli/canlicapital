"""Render original hero geometry as compositable optical layers, not an upscale."""
import bpy
from pathlib import Path

root = Path('/Users/arhancanli/canlicapital-website-20260908')
bpy.ops.wm.open_mainfile(filepath=str(root / 'artifacts/production/optical-master-v3/optical-master.blend'))
scene = bpy.context.scene
scene.render.resolution_x = 1536
scene.render.resolution_y = 1536
scene.cycles.samples = 48
out = root / 'artifacts/production/optical-layers'
out.mkdir(parents=True, exist_ok=True)
parts = [o for o in scene.objects if o.type == 'MESH']
groups = [[o for o in parts if o.name == f'Glass layer {i}'] for i in range(1, 5)]
groups.append([o for o in parts if not o.name.startswith('Glass layer')])
for index, group in enumerate(groups):
    for obj in parts:
        obj.hide_render = obj not in group
    scene.render.filepath = str(out / f'layer-{index}.png')
    bpy.ops.render.render(write_still=True)
