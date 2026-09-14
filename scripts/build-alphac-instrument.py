"""Original ALPHAC concept model and controlled cinematic renders.

No source data is represented by this object. All imagery is conceptual.
Run with Blender --background --factory-startup --python this_file -- --out DIR.
Use --frames 1,48,96 for a proof before committing to the full sequence.
"""
import argparse
import bpy
import json
import math
from mathutils import Vector
from pathlib import Path
import sys

parser = argparse.ArgumentParser()
parser.add_argument("--out", required=True)
parser.add_argument("--frames", default="1,48,96")
parser.add_argument("--width", type=int, default=1280)
parser.add_argument("--samples", type=int, default=32)
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
out = Path(args.out).resolve()
out.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = args.samples
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 8
scene.cycles.transmission_bounces = 6
prefs = bpy.context.preferences.addons["cycles"].preferences
prefs.compute_device_type = "METAL"
prefs.get_devices()
for d in prefs.devices: d.use = d.type == "METAL"
scene.cycles.device = "GPU" if any(d.type == "METAL" for d in prefs.devices) else "CPU"
scene.render.resolution_x = args.width
scene.render.resolution_y = round(args.width * .625)
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.fps = 24
scene.frame_start, scene.frame_end = 1, 96
scene.view_settings.view_transform = "AgX"
scene.world.use_nodes = True
background = scene.world.node_tree.nodes.get("Background")
background.inputs[0].default_value = (.04, .05, .07, 1)
background.inputs[1].default_value = .25

def material(name, color, metal=0, rough=.3, transmission=0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Transmission Weight"].default_value = transmission
    bsdf.inputs["IOR"].default_value = 1.46
    return mat

titanium = material("Brushed titanium", (.22,.25,.29), .95, .27)
polished = material("Polished edge", (.75,.81,.87), 1, .12)
glass = material("Sapphire optical glass", (.52,.71,.91), 0, .025, .98)
copper = material("Copper contacts", (.7,.25,.075), .85, .22)
ceramic = material("Carbon ceramic", (.018,.022,.027), .6, .24)
blue = material("Cobalt enamel", (.007,.025,.35), .65, .24)

def finish(obj, mat, parent=None):
    obj.data.materials.append(mat)
    if parent: obj.parent = parent
    if obj.type == "MESH":
        for polygon in obj.data.polygons: polygon.use_smooth = True
    return obj

def torus(name, radius, thickness, x, mat, parent):
    bpy.ops.mesh.primitive_torus_add(major_radius=radius, minor_radius=thickness,
        major_segments=128, minor_segments=12, location=(x,0,0), rotation=(0,math.pi/2,0))
    obj = bpy.context.object
    obj.name = name
    return finish(obj, mat, parent)

def sphere_band(name, x0, x1, radius, mat, parent):
    vertices, faces = [], []
    nu, nv = 10, 128
    for i in range(nu+1):
        x = x0 + (x1-x0)*i/nu
        r = math.sqrt(max(.01, radius*radius-x*x))
        for j in range(nv):
            a = j*math.tau/nv
            vertices.append((x,r*math.cos(a),r*math.sin(a)))
    for i in range(nu):
        for j in range(nv):
            a=i*nv+j; b=i*nv+(j+1)%nv
            faces.append((a,b,b+nv,a+nv))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update()
    obj=bpy.data.objects.new(name,mesh);scene.collection.objects.link(obj)
    solid=obj.modifiers.new("Optical thickness", "SOLIDIFY");solid.thickness=.045
    return finish(obj,mat,parent)

assembly = bpy.data.objects.new("ALPHAC / conceptual assembly", None)
scene.collection.objects.link(assembly)
modules=[]
for i, x in enumerate([-1.38,-.46,.46,1.38]):
    module=bpy.data.objects.new(["AlphaMax","AlphaTrend","AlphaVintage","AlphaForge"][i],None)
    scene.collection.objects.link(module);module.parent=assembly;modules.append(module)
    radius=math.sqrt(2.12**2-x*x)
    sphere_band("Glass module " + module.name,x-.32,x+.32,2.12,glass,module)
    for edge in [-.34,.34]:
        ex=x+edge;r=math.sqrt(2.12**2-ex*ex)
        torus("Machined rim",r,.055,ex,titanium,module)
        torus("Polished lip",r+.006,.012,ex-.035,polished,module)
    torus("Copper data contact",radius-.16,.022,x,copper,module)
    torus("Inner cobalt channel",radius-.22,.07,x,blue,module)
    for j in range(12):
        a=j*math.tau/12
        clip_x=x+(.34 if j%2 else -.34)
        clip_r=math.sqrt(2.12**2-clip_x*clip_x)
        bpy.ops.mesh.primitive_cube_add(size=1,location=(clip_x,clip_r*math.cos(a),clip_r*math.sin(a)))
        bracket=bpy.context.object;bracket.name="Precision retaining clip"
        bracket.scale=(.14,.11,.09);bracket.rotation_euler.x=a
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        bevel=bracket.modifiers.new("Soft machined corners","BEVEL");bevel.width=.02;bevel.segments=3
        finish(bracket,titanium,module)
        for bx in [0]:
            bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=6,radius=.028,
                location=(clip_x+bx,(clip_r+.058)*math.cos(a),(clip_r+.058)*math.sin(a)))
            finish(bpy.context.object,ceramic,module)
    # Same geometry and materials persist through the opening movement.
    module.location.x=0;module.keyframe_insert(data_path="location",frame=1)
    module.keyframe_insert(data_path="location",frame=18)
    module.location.x=(i-1.5)*1.15;module.keyframe_insert(data_path="location",frame=72)
    module.keyframe_insert(data_path="location",frame=96)

bpy.ops.mesh.primitive_uv_sphere_add(segments=64,ring_count=32,radius=.56)
core=finish(bpy.context.object,copper,assembly);core.name="Shared research core / concept"
for x in [-.35,0,.35]:
    torus("Core calibration ring",math.sqrt(.6**2-x*x),.026,x,ceramic,assembly)

assembly.rotation_euler=(0,0,-.13);assembly.keyframe_insert(data_path="rotation_euler",frame=1)
assembly.rotation_euler=(.08,-.12,.04);assembly.keyframe_insert(data_path="rotation_euler",frame=96)

def aim(obj,point): obj.rotation_euler=(Vector(point)-obj.location).to_track_quat("-Z","Y").to_euler()
def area(name, location, energy, color, size, target=(0,0,0)):
    data=bpy.data.lights.new(name,"AREA");data.energy=energy;data.color=color;data.shape="DISK";data.size=size
    obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=location;aim(obj,target)

area("Large overhead softbox",(1,-4,7),1100,(.82,.91,1),6)
area("Copper rim strip",(3,3,4),1700,(1,.55,.28),4)
area("Cobalt reflection",(-4,1,1),1200,(.10,.24,1),3)
area("Front edge detail",(-3,-5,1),350,(1,1,1),4)

bpy.ops.object.camera_add(location=(7,-10,5))
camera=bpy.context.object;camera.name="Continuous product camera";scene.camera=camera
camera.data.type="ORTHO";camera.data.ortho_scale=7.4
aim(camera,(0,0,0));camera.keyframe_insert(data_path="location",frame=1)
camera.keyframe_insert(data_path="rotation_euler",frame=1);camera.data.keyframe_insert(data_path="ortho_scale",frame=1)
camera.location=(5,-12,7);aim(camera,(0,0,0));camera.data.ortho_scale=11.7
camera.keyframe_insert(data_path="location",frame=96);camera.keyframe_insert(data_path="rotation_euler",frame=96)
camera.data.keyframe_insert(data_path="ortho_scale",frame=96)

scene.render.film_transparent=True
scene.render.image_settings.color_mode="RGBA"
scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(out / "alphac-instrument.blend"))
# Export remains available for a lightweight real-time variant after optimization.
bpy.ops.export_scene.gltf(filepath=str(out/"alphac-instrument.glb"),export_format="GLB",export_animations=True)
frames = list(range(1, 97)) if args.frames == "all" else [int(n) for n in args.frames.split(",") if n.strip()]
for frame in frames:
    scene.frame_set(frame)
    scene.render.filepath=str(out/f"frame-{frame:04d}.png")
    bpy.ops.render.render(write_still=True)
(out/"manifest.json").write_text(json.dumps({"conceptual":True,"source":"Original Blender geometry",
    "blender":bpy.app.version_string,"framesRendered":args.frames,"sequenceFrames":96,
    "width":args.width,"height":scene.render.resolution_y,"samples":args.samples,
    "device":scene.cycles.device},indent=2)+"\n")
