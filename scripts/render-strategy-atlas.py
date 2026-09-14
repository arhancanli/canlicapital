"""Original explanatory studio models, rendered at native output resolution.

Blender --background --factory-startup --python scripts/render-strategy-atlas.py
  -- --out artifacts/production/strategy-atlas --scene max --width 1600
All geometry is conceptual: no plotted prices, returns, holdings or live state.
"""
import argparse
import math
import sys
import json
from pathlib import Path
import bpy
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

p = argparse.ArgumentParser()
p.add_argument('--out', required=True)
p.add_argument('--scene', choices=['max', 'trend', 'vintage', 'forge', 'hero', 'process'], default='max')
p.add_argument('--width', type=int, default=2400)
p.add_argument('--samples', type=int, default=64)
a = p.parse_args(sys.argv[sys.argv.index('--') + 1:])
out = Path(a.out).resolve()
out.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
s = bpy.context.scene
s.render.engine = 'CYCLES'
s.cycles.samples = a.samples
s.cycles.use_denoising = True
s.cycles.max_bounces = 6
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'METAL'
prefs.get_devices()
for d in prefs.devices:
    d.use = d.type == 'METAL'
s.cycles.device = 'GPU' if any(d.use for d in prefs.devices) else 'CPU'
s.render.resolution_x = a.width
s.render.resolution_y = round(a.width * .5)
s.render.resolution_percentage = 100
s.render.image_settings.file_format = 'PNG'
s.render.image_settings.color_mode = 'RGBA'
s.render.film_transparent = True
s.world.use_nodes = True
s.world.node_tree.nodes['Background'].inputs[0].default_value = (.82,.86,.95,1)
s.world.node_tree.nodes['Background'].inputs[1].default_value = .6
s.view_settings.view_transform = 'AgX'

def mat(name, rgb, metal=0, rough=.3):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgb,1)
    m.use_nodes = True
    n = m.node_tree.nodes['Principled BSDF']
    n.inputs['Base Color'].default_value = (*rgb,1)
    n.inputs['Metallic'].default_value = metal
    n.inputs['Roughness'].default_value = rough
    return m

paper = mat('Porcelain / explanatory surface',(.85,.87,.9))
blue = mat('Cobalt / mechanism',(.004,.018,.62),.25,.23)
ink = mat('Graphite / labels',(.008,.012,.022))
copper = mat('Copper / connection',(.95,.23,.035),.62,.23)
silver = mat('Brushed aluminium / reference',(.5,.58,.68),.7,.3)

def box(name, pos, size, material, bevel=.06):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    o = bpy.context.object
    o.name = name
    o.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(material)
    mod = o.modifiers.new('Machined edge','BEVEL')
    mod.width = bevel
    mod.segments = 4
    o.modifiers.new('Weighted surface normals','WEIGHTED_NORMAL')
    return o

def path(name, coords, material, radius=.04):
    c = bpy.data.curves.new(name,'CURVE')
    c.dimensions='3D'
    c.bevel_depth=radius
    c.bevel_resolution=4
    poly=c.splines.new('POLY')
    poly.points.add(len(coords)-1)
    for pt, xyz in zip(poly.points,coords):
        pt.co=(*xyz,1)
    o=bpy.data.objects.new(name,c)
    s.collection.objects.link(o)
    o.data.materials.append(material)
    return o

def label(words, pos, size=.21, material=ink):
    c=bpy.data.curves.new(words,'FONT')
    c.body=words
    c.size=size
    c.extrude=.001
    o=bpy.data.objects.new(words,c)
    s.collection.objects.link(o)
    o.location=pos
    o.data.materials.append(material)
    return o

def model(kind, x=0, y=0, scale=1):
    before=set(s.objects)
    box(kind+' / plinth',(0,0,.06),(8,4.8,.12),paper)
    if kind=='max':
        label('RANK THE EQUITY UNIVERSE',(-3.55,-1.95,.14))
        for i in range(12):
            h=.3+(i/11)**1.4*1.5
            box('Illustrative rank, not a return',(-3.25+i*.59,.25,.16+h/2),(.36,1.75,h),blue if i>7 else silver,.025)
        path('Selected rank boundary',[(1.25,-1.1,.19),(3.6,-1.1,.19),(3.6,1.45,.19)],copper)
        label('RELATIVE MOMENTUM',(-3.5,1.85,.14),.17)
    elif kind=='trend':
        label('FOLLOW EACH MARKET OVER TIME',(-3.55,-1.95,.14))
        for j,title in enumerate(['EQUITY','RATES','COMMODITY','FX']):
            yj=-.85+j*.8
            label(title,(-3.55,yj,.15),.16)
            coords=[(-1.8+i*.12,yj,.28+.23*math.sin(i*.13+j)+i*.008) for i in range(43)]
            path('Illustrative trend / '+title,coords,blue if j%2==0 else copper,.065)
            path('Time reference', [(-1.8,yj,.16),(3.45,yj,.16)],silver,.012)
    elif kind=='vintage':
        label('READ THE INFLATION SURPRISE',(-3.55,-1.95,.14))
        for xj,title,h in [(-1.8,'IWM',.5),(1.8,'SPY',1.1)]:
            box('Spread leg / '+title,(xj,.25,h/2+.16),(2.4,2.2,h),blue if title=='IWM' else silver)
            label(title,(xj-.65,-.12,h+.18),.5,paper if title=='IWM' else ink)
        path('Two-leg spread',[(-1.8,-1.2,.3),(0,-1.2,.3),(1.8,-1.2,.3)],copper,.06)
        label('POINT-IN-TIME RELEASE',(-3.55,1.9,.14),.18)
    elif kind=='forge':
        label('INSPECT THE FUNDING PAYMENT',(-3.55,-1.95,.14))
        for xj,title,material in [(-2,'BOOKS',silver),(2,'PERPS',blue)]:
            for k in range(4):
                box(title+' layer',(xj,.3,.28+k*.25),(2,2,.16),material)
            label(title,(xj-.76,-.15,1.13),.34,paper if title=='PERPS' else ink)
        path('Funding connection',[(-.85,.3,.8),(0,.3,.8),(.85,.3,.8)],copper,.1)
        label('LIVE INPUTS / SIMULATED FILLS',(-3.55,1.9,.14),.18)
    else:
        for j,title in enumerate(['RESEARCH','PAPER','RECORD']):
            xj=-2.7+j*2.7
            box(title+' document',(xj,0,.24+j*.1),(2.15,2.65,.22),blue if j==1 else paper)
            label(title,(xj-.87,-.7,.37+j*.1),.23,paper if j==1 else ink)
            for k in range(4):
                box('Document rule',(xj,.15+k*.27,.37+j*.1),(1.55-k*.16,.035,.012),silver,.002)
        path('Trace across states',[(-3,-1.65,.2),(3,-1.65,.2)],copper,.055)
        label('INPUTS  >  OBSERVATIONS  >  PUBLICATION',(-3.55,1.9,.14),.16)
    for o in set(s.objects)-before:
        o.location=Vector((x,y,0))+o.location*scale
        o.scale*=scale

if a.scene=='hero':
    for kind,x,y in [('max',-4.4,2.65),('trend',4.4,2.65),('vintage',-4.4,-2.65),('forge',4.4,-2.65)]:
        model(kind,x,y,.96)
else:
    model(a.scene)
floor = box('Studio shadow catcher',(0,0,-.22),(200,200,.3),paper)
floor.is_shadow_catcher = True

def aim(o,target):
    o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()

for name,pos,power,size in [('Key',(-6,-4,12),2000,9),('Fill',(7,4,9),1600,8),('Top',(-2,6,8),800,6)]:
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size
    o=bpy.data.objects.new(name,d);s.collection.objects.link(o);o.location=pos;aim(o,(0,0,0))
bpy.ops.object.camera_add(location=(7,-10,12) if a.scene!='hero' else (7,-13,19))
s.camera=bpy.context.object
s.camera.data.type='ORTHO'
s.camera.data.ortho_scale=14 if a.scene!='hero' else 24.5
aim(s.camera,(0,0,.25))
if a.scene == 'hero':
    # Fit the complete model geometry inside a 4% safe frame. Do not fit the
    # 200-unit shadow catcher or infer the framing from a downscaled preview.
    bpy.context.view_layer.update()
    projected = [world_to_camera_view(s, s.camera, o.matrix_world @ Vector(corner))
                 for o in s.objects if o != floor and o.type in {'MESH', 'CURVE', 'FONT'}
                 for corner in o.bound_box]
    fit = max(max(abs(v.x-.5), abs(v.y-.5)) / .46 for v in projected)
    s.camera.data.ortho_scale *= max(1, fit)
bpy.ops.wm.save_as_mainfile(filepath=str(out/(a.scene+'.blend')))
s.render.filepath=str(out/(a.scene+'.png'))
bpy.ops.render.render(write_still=True)
(out/(a.scene+'.json')).write_text(json.dumps({'scene':a.scene,'width':s.render.resolution_x,'height':s.render.resolution_y,'samples':a.samples,'source':'Original native Blender geometry','basis':'Conceptual mechanism illustration, not market or performance data'},indent=2)+'\n')
