"""Original native 1080p/24fps loop from the project's editable optical model."""
import bpy
import math
from pathlib import Path
from mathutils import Vector

root = Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(root / 'artifacts/production/optical-master-v3/optical-master.blend'))
scene = bpy.context.scene
scene.render.resolution_x = 1920
scene.render.resolution_y = 1080
scene.render.resolution_percentage = 100
scene.render.film_transparent = False
scene.cycles.samples = 24
scene.camera.data.ortho_scale = 8.2
scene.world.node_tree.nodes.get('Background').inputs[0].default_value = (0, 0, 0, 1)
out = root / 'artifacts/production/optical-film'
out.mkdir(parents=True, exist_ok=True)
for frame in range(96):
    phase = frame / 96 * math.tau
    openness = (1 - math.cos(phase)) * .5
    for i in range(4):
        scene.objects[f'Glass layer {i+1}'].location.x = (i - 1.5) * .65 * openness
    scene.camera.location = (5 + math.sin(phase) * 1.6, -11, 3.2 + math.sin(phase) * .6)
    scene.camera.rotation_euler = (Vector((0,0,0))-scene.camera.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath = str(out / f'frame-{frame:04d}.png')
    bpy.ops.render.render(write_still=True)
