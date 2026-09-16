"""Small diagnostic animation, not a proposed website visual. Run in Blender."""
import bpy
import json
import math
import os
from pathlib import Path

out = Path(os.environ["CANLI_RENDER_TEST_OUT"])
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 8
scene.render.resolution_x = 256
scene.render.resolution_y = 144
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.fps = 12
scene.frame_start = 1
scene.frame_end = 12
scene.render.filepath = str(out / "frame-")
preferences = bpy.context.preferences.addons["cycles"].preferences
preferences.compute_device_type = "METAL"
preferences.get_devices()
devices = [{"name": d.name, "type": d.type} for d in preferences.devices]
metal = any(d.type == "METAL" for d in preferences.devices)
for device in preferences.devices:
    device.use = device.type == "METAL"
scene.cycles.device = "GPU" if metal else "CPU"
cube = bpy.data.objects["Cube"]
cube.rotation_euler.z = 0
cube.keyframe_insert(data_path="rotation_euler", frame=1)
cube.rotation_euler.z = math.pi / 2
cube.keyframe_insert(data_path="rotation_euler", frame=12)
bpy.ops.wm.save_as_mainfile(filepath=str(out / "diagnostic.blend"))
bpy.ops.render.render(animation=True)
bpy.ops.export_scene.gltf(filepath=str(out / "diagnostic.glb"), export_format="GLB")
(out / "render-report.json").write_text(json.dumps({
    "blender": bpy.app.version_string, "devices": devices,
    "renderDevice": scene.cycles.device, "frames": 12,
    "purpose": "Toolchain diagnostic only; not website art direction",
}, indent=2) + "\n")
