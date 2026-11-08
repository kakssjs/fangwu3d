"""Batch-render I Renovation GLB jobs with Blender Cycles.

Usage inside Blender:
  blender --background --python scripts/blender_batch_render.py -- --jobs ./exports --samples 256
Each job folder should contain scene.glb and job.json.
"""
import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument('--jobs', default='exports')
    parser.add_argument('--samples', type=int, default=256)
    parser.add_argument('--output-name', default='render.png')
    return parser.parse_args(argv)


def reset_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def add_area_light(name, location, energy, size, color=(1.0, 0.92, 0.78)):
    bpy.ops.object.light_add(type='AREA', location=location)
    light = bpy.context.object
    light.name = name
    light.data.energy = energy
    light.data.shape = 'DISK'
    light.data.size = size
    light.data.color = color
    return light


def point_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()


def load_job(job_dir: Path, samples: int, output_name: str):
    glb = job_dir / 'scene.glb'
    if not glb.exists():
        candidates = sorted(job_dir.glob('*.glb'))
        if not candidates:
            print(f'[skip] no GLB in {job_dir}')
            return
        glb = candidates[0]
    job = {}
    job_file = job_dir / 'job.json'
    if job_file.exists():
        job = json.loads(job_file.read_text(encoding='utf-8'))

    reset_scene()
    bpy.ops.import_scene.gltf(filepath=str(glb))

    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = str(job_dir / output_name)
    scene.render.film_transparent = bool(job.get('transparentBackground', False))

    world = scene.world or bpy.data.worlds.new('World')
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.82, 0.80, 0.75, 1.0)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.22

    add_area_light('Key', (4.5, -5.5, 8.5), 1300, 6.5)
    fill = add_area_light('Fill', (-5.5, -1.5, 5.5), 650, 5.0, (0.72, 0.82, 1.0))
    point_at(fill, (0, 0, 1.0))
    add_area_light('Rim', (2.5, 6.5, 6.0), 850, 4.0, (1.0, 0.82, 0.62))

    camera_data = bpy.data.cameras.new('I Renovation Camera')
    camera = bpy.data.objects.new('I Renovation Camera', camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    cam = job.get('camera', {})
    camera.location = cam.get('location', [9.5, -11.5, 8.5])
    point_at(camera, cam.get('target', [0.0, 0.0, 1.0]))
    camera_data.lens = cam.get('lens', 42)

    bpy.ops.render.render(write_still=True)
    print(f'[done] {job_dir / output_name}')


def main():
    args = parse_args()
    jobs_root = Path(args.jobs).resolve()
    if not jobs_root.exists():
        raise FileNotFoundError(jobs_root)
    job_dirs = [p for p in sorted(jobs_root.iterdir()) if p.is_dir()]
    if not job_dirs:
        load_job(jobs_root, args.samples, args.output_name)
        return
    for job_dir in job_dirs:
        load_job(job_dir, args.samples, args.output_name)


if __name__ == '__main__':
    main()
