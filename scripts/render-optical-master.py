"""Native-resolution original glass study; review before website selection.

Blender --background --factory-startup --python this_file -- --out DIR
No third-party model or live data. Generates a new scene, not a raster upscale.
"""
import argparse
import json
import math
from pathlib import Path
import sys
import bpy
from mathutils import Vector

parser = argparse.ArgumentParser()
parser.add_argument('--out', required=True)
parser.add_argument('--width', type=int, default=3840)
parser.add_argument('--samples', type=int, default=128)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
out = Path(args.out).resolve()
out.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = args.samples
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 16
scene.cycles.transmission_bounces = 12
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'METAL'
prefs.get_devices()
for device in prefs.devices:
    device.use = device.type == 'METAL'
scene.cycles.device = 'GPU' if any(d.use for d in prefs.devices) else 'CPU'
scene.render.resolution_x = args.width
scene.render.resolution_y = args.width
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.film_transparent = True
scene.view_settings.view_transform = 'AgX'
scene.world.use_nodes = True
bg = scene.world.node_tree.nodes.get('Background')
bg.inputs[0].default_value = (.009, .012, .025, 1)
bg.inputs[1].default_value = .12

def material(name, color, transmission=0, metal=0, rough=.06):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    p = mat.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Transmission Weight'].default_value = transmission
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    p.inputs['IOR'].default_value = 1.46
    return mat

glass = material('Clear optical shell', (.88, .93, 1), 1, 0, .022)
copper = material('Polished copper filament', (.8, .24, .065), 0, .95, .16)
graphite = material('Graphite research core', (.009, .015, .03), 0, .72, .18)
for part, (x0, x1) in enumerate([(-2.09,-1.04),(-.98,-.03),(.03,.98),(1.04,2.09)]):
    verts, faces = [], []
    nu, nv, radius = 64, 256, 2.1
    for i in range(nu+1):
        x = x0 + (x1-x0)*i/nu
        r = math.sqrt(max(.0001, radius*radius-x*x))
        for j in range(nv):
            a = j*math.tau/nv
            verts.append((x, r*math.cos(a), r*math.sin(a)))
    for i in range(nu):
        for j in range(nv):
            a=i*nv+j; b=i*nv+(j+1)%nv
            faces.append((a,b,b+nv,a+nv))
    mesh = bpy.data.meshes.new('Optical shell topology')
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(f'Glass layer {part+1}', mesh)
    scene.collection.objects.link(obj)
    obj.data.materials.append(glass)
    for face in mesh.polygons:
        face.use_smooth = True
    solid = obj.modifiers.new('True optical wall', 'SOLIDIFY')
    solid.thickness = .07
    bevel = obj.modifiers.new('Precision glass edges', 'BEVEL')
    bevel.width = .018
    bevel.segments = 4

bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=.015, depth=4.4,
    rotation=(0, math.pi/2, 0))
bpy.context.object.name = 'Continuous copper filament'
bpy.context.object.data.materials.append(copper)
bpy.ops.mesh.primitive_uv_sphere_add(segments=128, ring_count=64, radius=1.1)
bpy.context.object.name = 'Smoked interior'
bpy.context.object.data.materials.append(graphite)
for f in bpy.context.object.data.polygons:
    f.use_smooth = True

def aim(obj, target=(0,0,0)):
    obj.rotation_euler = (Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
def light(name, location, energy, color, size, size_y):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy = energy; data.color = color; data.shape = 'RECTANGLE'
    data.size = size; data.size_y = size_y
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = location
    aim(obj)

light('Long silver grazing strip', (-4,1,6), 650, (.8,.88,1), 8, .18)
light('Warm upper edge', (3,2,5), 700, (1,.35,.09), 5, .18)
light('Cobalt lower edge', (-1,1,-3), 700, (.005,.045,1), 5, .4)
light('Subtle side fill', (-5,-1,0), 180, (.55,.65,1), 5, .12)
bpy.ops.object.camera_add(location=(5,-11,3.2))
scene.camera = bpy.context.object
scene.camera.data.type = 'ORTHO'
scene.camera.data.ortho_scale = 4.9
aim(scene.camera)
bpy.ops.wm.save_as_mainfile(filepath=str(out/'optical-master.blend'))
scene.render.filepath = str(out/'optical-master.png')
bpy.ops.render.render(write_still=True)
(out/'manifest.json').write_text(json.dumps({'width':args.width,'height':args.width,
    'samples':args.samples,'source':'Original Blender geometry','conceptual':True},indent=2)+'\n')
