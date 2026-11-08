'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { generatePlanGeometry, type PlanGeometry, type Wall, type PlanRoom, type RoomGeom } from '@i-renovation/shared/plan';
import { MATERIAL_PRESETS, getMaterialPreset, type MaterialPresetId, type MaterialFamily } from '@i-renovation/shared/materials';
import { furnitureManifest } from '@i-renovation/shared/furniture';
import {
  buildBlenderCyclesScript,
  buildBlenderBatchScript,
  buildBlenderJob,
  buildPascalEditorPayload,
  downloadText,
  exportSceneGlb,
} from '@/lib/scene-export';

interface Props {
  geometry?: PlanGeometry | null;
  rooms?: PlanRoom[];
  presetId?: MaterialPresetId;
  onPresetChange?: (id: MaterialPresetId) => void | Promise<void>;
}

type CamState = { theta: number; phi: number; radius: number; target: THREE.Vector3 };

function familyMaterial(family: MaterialFamily, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({
    color: family.color,
    roughness: family.roughness,
    metalness: family.metalness,
    transparent: (family.opacity ?? 1) < 1,
    opacity: family.opacity ?? 1,
    ...extra,
  });
}

function makeLabel(text: string, sub: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(24, 36, 31, 0.86)';
  ctx.beginPath();
  (ctx.roundRect ?? ctx.rect).call(ctx, 8, 8, 240, 80, 14);
  ctx.fill();
  ctx.fillStyle = '#f8f4ea';
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(text, 128, 44);
  ctx.fillStyle = '#d4b786';
  ctx.font = '22px sans-serif';
  ctx.fillText(sub, 128, 74);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.6, 0.6, 1);
  sprite.userData.exportable = false;
  return sprite;
}

function addBox(
  group: THREE.Group,
  size: [number, number, number],
  position: [number, number, number],
  material: THREE.Material,
  rotationY = 0,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.rotation.y = rotationY;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function addCylinder(
  group: THREE.Group,
  radius: number,
  height: number,
  position: [number, number, number],
  material: THREE.Material,
  segments = 24,
) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function addOpeningDetails(
  group: THREE.Group,
  wall: Wall,
  opening: Wall['openings'][number],
  materials: ReturnType<typeof makeMaterials>,
) {
  const L = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
  if (L < 0.05) return;
  const horizontal = Math.abs(wall.y2 - wall.y1) < 1e-6;
  const dirX = (wall.x2 - wall.x1) / L;
  const dirZ = (wall.y2 - wall.y1) / L;
  const a = Math.max(0, opening.offset - opening.width / 2);
  const len = Math.min(opening.width, L - a);
  if (len <= 0.05) return;
  const cx = wall.x1 + dirX * (opening.offset);
  const cz = wall.y1 + dirZ * (opening.offset);
  const frame = 0.06;
  const depth = wall.thickness + 0.035;

  if (opening.type === 'window') {
    const glass = familyMaterial(materials.glass, { side: THREE.DoubleSide });
    addBox(group, horizontal ? [len - 0.12, opening.height - 0.12, 0.025] : [0.025, opening.height - 0.12, len - 0.12], [cx, opening.sill + opening.height / 2, cz], glass);
    const frameMat = familyMaterial(materials.windowFrame);
    const bar = (size: [number, number, number], pos: [number, number, number]) => addBox(group, size, pos, frameMat);
    if (horizontal) {
      bar([len, frame, depth], [cx, opening.sill + frame / 2, cz]);
      bar([len, frame, depth], [cx, opening.sill + opening.height - frame / 2, cz]);
      bar([frame, opening.height, depth], [cx - len / 2 + frame / 2, opening.sill + opening.height / 2, cz]);
      bar([frame, opening.height, depth], [cx + len / 2 - frame / 2, opening.sill + opening.height / 2, cz]);
    } else {
      bar([depth, frame, len], [cx, opening.sill + frame / 2, cz]);
      bar([depth, frame, len], [cx, opening.sill + opening.height - frame / 2, cz]);
      bar([depth, opening.height, frame], [cx, opening.sill + opening.height / 2, cz - len / 2 + frame / 2]);
      bar([depth, opening.height, frame], [cx, opening.sill + opening.height / 2, cz + len / 2 - frame / 2]);
    }
    return;
  }

  const doorMat = familyMaterial(materials.door);
  const doorThickness = 0.055;
  addBox(group, horizontal ? [len - 0.1, opening.height - 0.08, doorThickness] : [doorThickness, opening.height - 0.08, len - 0.1], [cx, opening.height / 2, cz], doorMat);
  const handleMat = familyMaterial(materials.metal, { metalness: 0.9, roughness: 0.22 });
  const handleX = horizontal ? cx + len * 0.28 : cx + doorThickness * 1.45;
  const handleZ = horizontal ? cz + doorThickness * 1.45 : cz + len * 0.28;
  addCylinder(group, 0.035, 0.12, [handleX, 1.05, handleZ], handleMat, 16);
}

function makeMaterials(preset: ReturnType<typeof getMaterialPreset>) {
  return {
    wall: preset.wall,
    exteriorWall: preset.exteriorWall,
    floor: preset.floor,
    ceiling: preset.ceiling,
    trim: preset.trim,
    door: preset.door,
    windowFrame: preset.windowFrame,
    glass: preset.glass,
    metal: preset.metal,
    fabric: preset.fabric,
    wood: preset.wood,
    stone: preset.stone,
    accent: preset.accent,
  };
}

function addWall(scene: THREE.Scene, wall: Wall, group: THREE.Group, materials: ReturnType<typeof makeMaterials>) {
  const L = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
  if (L < 0.05) return;
  const horizontal = Math.abs(wall.y2 - wall.y1) < 1e-6;
  const dirX = (wall.x2 - wall.x1) / L;
  const dirZ = (wall.y2 - wall.y1) / L;
  const mat = familyMaterial(wall.exterior ? materials.exteriorWall : materials.wall);

  const cuts = [...wall.openings]
    .sort((a, b) => a.offset - b.offset)
    .map((o) => [Math.max(0, o.offset - o.width / 2), Math.min(L, o.offset + o.width / 2)] as [number, number]);
  const solids: [number, number][] = [];
  let cursor = 0;
  for (const [a, b] of cuts) {
    if (a > cursor + 0.01) solids.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < L - 0.01) solids.push([cursor, L]);

  const place = (along: number, y0: number, len: number, height: number, thickness: number) => {
    const cx = wall.x1 + dirX * (along + len / 2);
    const cz = wall.y1 + dirZ * (along + len / 2);
    const geo = horizontal
      ? new THREE.BoxGeometry(len, height, thickness)
      : new THREE.BoxGeometry(thickness, height, len);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, y0 + height / 2, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  };

  for (const [a, b] of solids) place(a, 0, b - a, wall.height, wall.thickness);

  for (const opening of wall.openings) {
    const a = Math.max(0, opening.offset - opening.width / 2);
    const len = Math.min(opening.width, L - a);
    if (len <= 0.05) continue;
    if (opening.sill > 0.01) place(a, 0, len, opening.sill, wall.thickness);
    const top = opening.sill + opening.height;
    if (wall.height - top > 0.01) place(a, top, len, wall.height - top, wall.thickness);
    addOpeningDetails(group, wall, opening, materials);
  }
  scene.add(group);
}

function addRoundedBox(
  group: THREE.Group,
  size: [number, number, number],
  position: [number, number, number],
  material: THREE.Material,
  radius = 0.08,
  rotationY = 0,
) {
  const safeRadius = Math.min(radius, Math.min(...size) * 0.22);
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(size[0], size[1], size[2], 4, safeRadius), material);
  mesh.position.set(...position);
  mesh.rotation.y = rotationY;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function addFurniture(group: THREE.Group, room: RoomGeom, materials: ReturnType<typeof makeMaterials>) {
  const centerX = room.x + room.w / 2;
  const centerZ = room.y + room.d / 2;
  const minSide = Math.min(room.w, room.d);
  const name = room.name;
  const fabric = familyMaterial(materials.fabric);
  const wood = familyMaterial(materials.wood);
  const trim = familyMaterial(materials.trim);
  const stone = familyMaterial(materials.stone);
  const metal = familyMaterial(materials.metal);
  const accent = familyMaterial(materials.accent);
  const glass = familyMaterial(materials.glass, { side: THREE.DoubleSide });

  const addPlant = (x: number, z: number, scale = 1) => {
    addCylinder(group, 0.28 * scale, 0.34 * scale, [x, 0.18 * scale, z], stone, 24);
    addCylinder(group, 0.07 * scale, 0.72 * scale, [x, 0.68 * scale, z], wood, 16);
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.32 * scale, 18, 12), familyMaterial(materials.accent, { roughness: 0.72 }));
      leaf.scale.set(0.65, 1.25, 0.38);
      leaf.position.set(x + Math.cos(i * 1.05) * 0.32 * scale, 1.12 * scale + (i % 2) * 0.18 * scale, z + Math.sin(i * 1.05) * 0.32 * scale);
      leaf.rotation.y = i * 0.9;
      leaf.castShadow = true;
      group.add(leaf);
    }
  };

  const addFloorLamp = (x: number, z: number) => {
    addCylinder(group, 0.22, 0.08, [x, 0.04, z], metal, 24);
    addCylinder(group, 0.035, 1.45, [x, 0.78, z], metal, 18);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 0.42, 24, 1, true), familyMaterial({ color: '#F1E2C2', roughness: 0.78, metalness: 0 }));
    shade.position.set(x, 1.55, z);
    shade.castShadow = true;
    group.add(shade);
  };

  const addChair = (x: number, z: number, rotation = 0, compact = false) => {
    const seatW = compact ? 0.46 : 0.52;
    const seatD = compact ? 0.46 : 0.52;
    addRoundedBox(group, [seatW, 0.16, seatD], [x, 0.48, z], fabric, 0.06, rotation);
    addRoundedBox(group, [seatW, 0.68, 0.14], [x - Math.sin(rotation) * 0.23, 0.82, z - Math.cos(rotation) * 0.23], fabric, 0.055, rotation);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      addCylinder(group, 0.028, 0.46, [x + dx * seatW * 0.36, 0.23, z + dz * seatD * 0.36], metal, 12);
    }
  };

  const addRug = (x: number, z: number, w: number, d: number, color = materials.fabric.color) => {
    const rug = new THREE.Mesh(new RoundedBoxGeometry(w, 0.035, d, 3, 0.12), familyMaterial({ color, roughness: 0.96, metalness: 0 }));
    rug.position.set(x, 0.14, z);
    rug.receiveShadow = true;
    group.add(rug);
  };

  const addSofa = () => {
    const width = Math.min(3.25, room.w * 0.58);
    const depth = Math.min(1.02, room.d * 0.24);
    const z = room.y + room.d * 0.28;
    addRug(centerX, room.y + room.d * 0.58, Math.min(3.45, room.w * 0.68), Math.min(2.25, room.d * 0.48), '#B6A494');
    addRoundedBox(group, [width, 0.48, depth], [centerX, 0.42, z], fabric, 0.14);
    addRoundedBox(group, [width - 0.18, 0.26, depth - 0.16], [centerX, 0.78, z + 0.02], fabric, 0.12);
    addRoundedBox(group, [width - 0.22, 0.72, 0.18], [centerX, 1.02, z - depth * 0.38], fabric, 0.1);
    addRoundedBox(group, [0.24, 0.72, depth + 0.08], [centerX - width / 2 + 0.1, 0.76, z], fabric, 0.1);
    addRoundedBox(group, [0.24, 0.72, depth + 0.08], [centerX + width / 2 - 0.1, 0.76, z], fabric, 0.1);
    for (let i = 0; i < 3; i++) {
      addRoundedBox(group, [0.56, 0.16, 0.42], [centerX - width * 0.28 + i * width * 0.28, 0.98, z + 0.1], familyMaterial(i === 1 ? materials.accent : materials.fabric, { roughness: 0.9 }), 0.1, i === 1 ? 0.08 : -0.08);
    }
    for (const dx of [-1, 1]) {
      for (const dz of [-1, 1]) {
        addCylinder(group, 0.035, 0.18, [centerX + dx * (width / 2 - 0.18), 0.12, z + dz * (depth / 2 - 0.18)], metal, 12);
      }
    }
    addRoundedBox(group, [1.35, 0.12, 0.72], [centerX, 0.38, room.y + room.d * 0.57], wood, 0.12);
    addRoundedBox(group, [0.11, 0.28, 0.11], [centerX - 0.52, 0.22, room.y + room.d * 0.57], metal, 0.03);
    addRoundedBox(group, [0.11, 0.28, 0.11], [centerX + 0.52, 0.22, room.y + room.d * 0.57], metal, 0.03);
    addRoundedBox(group, [2.35, 0.58, 0.36], [centerX, 0.42, room.y + room.d * 0.83], wood, 0.08);
    addRoundedBox(group, [1.82, 1.05, 0.08], [centerX, 1.42, room.y + room.d * 0.86], familyMaterial({ color: '#252826', roughness: 0.35, metalness: 0.18 }), 0.05);
    addFloorLamp(centerX - width * 0.42, room.y + room.d * 0.18);
    addPlant(centerX + width * 0.42, room.y + room.d * 0.18, 0.86);
  };

  const addBedroom = () => {
    const width = Math.min(1.95, room.w * 0.56);
    const length = Math.min(2.18, room.d * 0.56);
    const z = centerZ + 0.12;
    addRug(centerX, z, Math.min(3.15, room.w * 0.76), Math.min(2.8, room.d * 0.7), '#C6B7A7');
    addRoundedBox(group, [width + 0.18, 0.32, length + 0.12], [centerX, 0.33, z], wood, 0.1);
    addRoundedBox(group, [width, 0.38, length - 0.08], [centerX, 0.72, z], fabric, 0.16);
    addRoundedBox(group, [width + 0.24, 1.12, 0.18], [centerX, 1.13, z - length / 2], trim, 0.12);
    addRoundedBox(group, [width * 0.86, 0.18, 0.62], [centerX, 1.08, z - length * 0.22], familyMaterial({ color: '#E6DED1', roughness: 0.92, metalness: 0 }), 0.12);
    for (const dx of [-1, 1]) {
      addRoundedBox(group, [0.52, 0.16, 0.68], [centerX + dx * width * 0.26, 1.15, z - length * 0.32], familyMaterial({ color: '#F4EEE4', roughness: 0.92, metalness: 0 }), 0.1, dx * 0.05);
    }
    for (const dx of [-1, 1]) {
      addRoundedBox(group, [0.52, 0.46, 0.42], [centerX + dx * (width / 2 + 0.36), 0.38, z - length * 0.32], wood, 0.08);
      addCylinder(group, 0.035, 0.28, [centerX + dx * (width / 2 + 0.36), 0.84, z - length * 0.32], metal, 12);
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.28, 20, 1, true), familyMaterial({ color: '#E6D0A5', roughness: 0.82, metalness: 0 }));
      shade.position.set(centerX + dx * (width / 2 + 0.36), 1.08, z - length * 0.32);
      group.add(shade);
    }
    addRoundedBox(group, [Math.min(2.2, room.w * 0.58), 0.58, 0.62], [centerX, 1.2, room.y + 0.32], wood, 0.08);
    for (let i = 0; i < 4; i++) addBox(group, [0.035, 0.42, 0.025], [centerX - 0.72 + i * 0.48, 1.2, room.y + 0.01], metal);
  };

  const addDining = () => {
    const width = Math.min(2.05, room.w * 0.52);
    const depth = Math.min(1.05, room.d * 0.34);
    addRug(centerX, centerZ, Math.min(3.15, room.w * 0.72), Math.min(2.35, room.d * 0.62), '#B9AA99');
    addRoundedBox(group, [width, 0.14, depth], [centerX, 0.82, centerZ], wood, 0.08);
    addRoundedBox(group, [width * 0.78, 0.12, depth * 0.68], [centerX, 0.73, centerZ], familyMaterial(materials.wood), 0.04);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      addCylinder(group, 0.055, 0.72, [centerX + dx * width * 0.36, 0.4, centerZ + dz * depth * 0.32], metal, 16);
    }
    for (const side of [-1, 1]) {
      addChair(centerX + side * (width / 2 + 0.5), centerZ, side > 0 ? Math.PI : 0, true);
      addChair(centerX + side * (width / 2 + 0.5), centerZ + 0.72, side > 0 ? Math.PI : 0, true);
    }
    addChair(centerX, centerZ - depth / 2 - 0.52, 0, true);
    addChair(centerX, centerZ + depth / 2 + 0.52, Math.PI, true);
    addCylinder(group, 0.18, 0.08, [centerX, 0.98, centerZ], stone, 24);
    addPlant(centerX + width * 0.34, centerZ - depth * 0.3, 0.5);
  };

  const addKitchen = () => {
    const length = Math.min(room.w * 0.82, 4.35);
    const z = room.y + 0.52;
    addRoundedBox(group, [length, 0.86, 0.66], [centerX, 0.46, z], trim, 0.06);
    addRoundedBox(group, [length + 0.1, 0.12, 0.74], [centerX, 0.96, z], stone, 0.04);
    for (let i = 0; i < Math.floor(length / 0.72); i++) {
      addBox(group, [0.025, 0.55, 0.012], [centerX - length / 2 + 0.38 + i * 0.72, 0.5, z - 0.338], metal);
    }
    addRoundedBox(group, [1.9, 0.88, 0.92], [centerX, 0.46, centerZ + 0.28], wood, 0.08);
    addRoundedBox(group, [2.02, 0.12, 1.02], [centerX, 0.96, centerZ + 0.28], stone, 0.04);
    addBox(group, [0.62, 0.055, 0.42], [centerX - 0.42, 1.035, centerZ + 0.28], metal);
    addBox(group, [0.52, 0.055, 0.38], [centerX + 0.45, 1.035, centerZ + 0.28], familyMaterial({ color: '#242827', roughness: 0.28, metalness: 0.36 }));
    for (const dx of [-0.17, 0.17]) for (const dz of [-0.12, 0.12]) addCylinder(group, 0.085, 0.025, [centerX + 0.45 + dx, 1.075, centerZ + 0.28 + dz], accent, 20);
    addRoundedBox(group, [0.84, 1.88, 0.72], [room.x + room.w * 0.82, 0.95, room.y + room.d * 0.5], metal, 0.08);
    addBox(group, [0.025, 1.15, 0.018], [room.x + room.w * 0.82 - 0.3, 1.12, room.y + room.d * 0.5 - 0.365], trim);
    addPlant(room.x + room.w * 0.16, room.y + room.d * 0.75, 0.68);
  };

  const addBathroom = () => {
    const vanityW = Math.min(1.55, room.w * 0.45);
    addRoundedBox(group, [vanityW, 0.82, 0.64], [room.x + room.w * 0.25, 0.43, room.y + room.d * 0.27], wood, 0.08);
    addRoundedBox(group, [vanityW + 0.08, 0.12, 0.7], [room.x + room.w * 0.25, 0.9, room.y + room.d * 0.27], stone, 0.05);
    addRoundedBox(group, [vanityW * 0.62, 0.16, 0.42], [room.x + room.w * 0.25, 1.01, room.y + room.d * 0.27], familyMaterial({ color: '#F2F4F1', roughness: 0.18, metalness: 0.02 }), 0.12);
    addCylinder(group, 0.035, 0.22, [room.x + room.w * 0.25, 1.18, room.y + room.d * 0.18], metal, 16);
    addRoundedBox(group, [vanityW * 0.78, 0.82, 0.06], [room.x + room.w * 0.25, 1.68, room.y + 0.08], glass, 0.04);
    const showerX = room.x + room.w * 0.72;
    const showerZ = room.y + room.d * 0.64;
    addRoundedBox(group, [Math.min(1.35, room.w * 0.38), 0.08, Math.min(1.02, room.d * 0.32)], [showerX, 0.12, showerZ], stone, 0.04);
    addBox(group, [Math.min(1.35, room.w * 0.38), 2.08, 0.035], [showerX, 1.12, showerZ - Math.min(1.02, room.d * 0.32) / 2], glass);
    addBox(group, [0.035, 2.08, Math.min(1.02, room.d * 0.32)], [showerX - Math.min(1.35, room.w * 0.38) / 2, 1.12, showerZ], glass);
    addCylinder(group, 0.11, 0.035, [showerX, 2.12, showerZ], metal, 24);
    addCylinder(group, 0.025, 0.38, [showerX, 1.95, showerZ], metal, 16);
    const toiletX = room.x + room.w * 0.78;
    const toiletZ = room.y + room.d * 0.23;
    addRoundedBox(group, [0.42, 0.42, 0.62], [toiletX, 0.3, toiletZ], familyMaterial({ color: '#F5F4EF', roughness: 0.22, metalness: 0.01 }), 0.14);
    addRoundedBox(group, [0.46, 0.58, 0.18], [toiletX, 0.63, toiletZ - 0.22], familyMaterial({ color: '#F5F4EF', roughness: 0.22, metalness: 0.01 }), 0.1);
  };

  const addStudy = () => {
    const deskW = Math.min(2.15, room.w * 0.58);
    addRug(centerX, centerZ, Math.min(2.8, room.w * 0.66), Math.min(2.15, room.d * 0.58), '#AFA89B');
    addRoundedBox(group, [deskW, 0.12, 0.76], [centerX, 0.79, room.y + room.d * 0.3], wood, 0.06);
    for (const dx of [-1, 1]) addRoundedBox(group, [0.12, 0.72, 0.62], [centerX + dx * (deskW / 2 - 0.18), 0.39, room.y + room.d * 0.3], metal, 0.035);
    addRoundedBox(group, [0.62, 0.18, 0.62], [centerX, 0.5, room.y + room.d * 0.62], fabric, 0.1);
    addRoundedBox(group, [0.62, 0.82, 0.16], [centerX, 0.92, room.y + room.d * 0.74], fabric, 0.08);
    for (const dx of [-1, 1]) addCylinder(group, 0.035, 0.7, [centerX + dx * 0.23, 0.31, room.y + room.d * 0.62], metal, 12);
    addRoundedBox(group, [Math.min(1.75, room.w * 0.5), 0.38, 0.32], [centerX, 1.7, room.y + 0.18], trim, 0.05);
    for (let i = 0; i < 5; i++) addBox(group, [0.16, 0.3 + (i % 2) * 0.12, 0.18], [centerX - 0.65 + i * 0.32, 1.78, room.y + 0.15], i % 2 ? accent : wood);
    addFloorLamp(centerX + deskW * 0.38, room.y + room.d * 0.22);
  };

  const addBalcony = () => {
    addRug(centerX, centerZ, Math.min(2.25, room.w * 0.58), Math.min(1.75, room.d * 0.48), '#A7A394');
    addCylinder(group, 0.42, 0.12, [centerX, 0.75, centerZ], wood, 28);
    addCylinder(group, 0.075, 0.68, [centerX, 0.39, centerZ], metal, 18);
    addChair(centerX - 0.72, centerZ, Math.PI / 2, true);
    addChair(centerX + 0.72, centerZ, -Math.PI / 2, true);
    addRoundedBox(group, [Math.min(1.7, room.w * 0.48), 0.48, 0.52], [centerX, 0.3, room.y + room.d * 0.72], fabric, 0.12);
    addPlant(room.x + room.w * 0.18, room.y + room.d * 0.28, 0.78);
    addPlant(room.x + room.w * 0.82, room.y + room.d * 0.3, 0.62);
  };

  const addFlex = () => {
    addRoundedBox(group, [Math.min(1.25, room.w * 0.38), 0.74, 0.68], [centerX, 0.39, centerZ], fabric, 0.12);
    addPlant(centerX + room.w * 0.25, centerZ, 0.82);
    addFloorLamp(centerX - room.w * 0.25, centerZ + room.d * 0.12);
  };

  if (/客厅|起居|会客/.test(name)) addSofa();
  else if (/卧|睡房/.test(name)) addBedroom();
  else if (/餐/.test(name)) addDining();
  else if (/厨/.test(name)) addKitchen();
  else if (/卫|浴|洗手/.test(name)) addBathroom();
  else if (/书房|工作|办公/.test(name)) addStudy();
  else if (/阳台|露台/.test(name)) addBalcony();
  else if (minSide > 2.2) addFlex();
  else addFlex();
}

function addCeiling(group: THREE.Group, plan: PlanGeometry, materials: ReturnType<typeof makeMaterials>) {
  for (const room of plan.rooms) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(room.w - 0.04, 0.1, room.d - 0.04),
      familyMaterial(materials.ceiling, { transparent: true, opacity: 0.22 }),
    );
    mesh.position.set(room.x + room.w / 2, plan.wallHeight - 0.08, room.y + room.d / 2);
    mesh.receiveShadow = true;
    group.add(mesh);
  }
}

export default function Scene3D({ geometry, rooms, presetId, onPresetChange }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const planRef = useRef<PlanGeometry | null>(null);
  const camRef = useRef<CamState | null>(null);
  const tourRef = useRef(false);
  const tourIndexRef = useRef(0);
  const [view, setView] = useState<'persp' | 'top'>('persp');
  const [showCeiling, setShowCeiling] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [preset, setPreset] = useState<MaterialPresetId>(presetId ?? 'quiet-luxury');
  const [savingMaterial, setSavingMaterial] = useState(false);

  useEffect(() => {
    if (presetId && presetId !== preset) setPreset(presetId);
  }, [presetId]);

  const activePreset = getMaterialPreset(preset);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const plan: PlanGeometry | null = geometry ?? (rooms && rooms.length ? generatePlanGeometry(rooms) : null);
    if (!plan) return;
    planRef.current = plan;

    while (wrap.firstChild) wrap.removeChild(wrap.firstChild);
    const W = wrap.clientWidth || 640;
    const H = wrap.clientHeight || 420;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(activePreset.background);
    scene.fog = new THREE.FogExp2(activePreset.fog, 0.006);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 300);
    const target = new THREE.Vector3(plan.width / 2, 1.05, plan.depth / 2);
    camRef.current = { theta: 0.9, phi: 1.02, radius: Math.max(plan.width, plan.depth) * 1.85, target };

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    wrap.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(activePreset.light.ambient, activePreset.light.ambientIntensity));
    const sun = new THREE.DirectionalLight(activePreset.light.sun, activePreset.light.sunIntensity);
    sun.position.set(plan.width * 0.85, 20, plan.depth * 0.62);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -Math.max(plan.width, plan.depth);
    sun.shadow.camera.right = Math.max(plan.width, plan.depth);
    sun.shadow.camera.top = Math.max(plan.width, plan.depth);
    sun.shadow.camera.bottom = -Math.max(plan.width, plan.depth);
    scene.add(sun);
    const fill = new THREE.PointLight(activePreset.light.fill, activePreset.light.fillIntensity, 70);
    fill.position.set(plan.width / 2, 9, plan.depth / 2);
    scene.add(fill);

    const materials = makeMaterials(activePreset);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(plan.width * 3, plan.depth * 3),
      familyMaterial({ color: activePreset.background, roughness: 0.95, metalness: 0 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(plan.width / 2, -0.08, plan.depth / 2);
    ground.receiveShadow = true;
    ground.userData.exportable = false;
    scene.add(ground);

    const grid = new THREE.GridHelper(Math.max(plan.width, plan.depth) * 2.4, 30, 0x8b8479, 0xb8b0a4);
    grid.position.set(plan.width / 2, -0.06, plan.depth / 2);
    const gridMat = grid.material as THREE.Material | THREE.Material[];
    if (Array.isArray(gridMat)) gridMat.forEach((m) => { m.transparent = true; m.opacity = 0.18; });
    else { gridMat.transparent = true; gridMat.opacity = 0.18; }
    grid.userData.exportable = false;
    scene.add(grid);

    const floorGroup = new THREE.Group();
    plan.rooms.forEach((room, index) => {
      const tint = new THREE.Color(activePreset.floor.color).offsetHSL(((index % 4) - 1.5) * 0.012, 0, ((index % 3) - 1) * 0.025);
      const floor = new THREE.Mesh(
        new THREE.BoxGeometry(room.w - 0.025, 0.12, room.d - 0.025),
        familyMaterial({ ...activePreset.floor, color: `#${tint.getHexString()}` }),
      );
      floor.position.set(room.x + room.w / 2, 0.06, room.y + room.d / 2);
      floor.receiveShadow = true;
      floorGroup.add(floor);

      const label = makeLabel(room.name, `${room.area.toFixed(1)}㎡`);
      label.position.set(room.x + room.w / 2, 1.82, room.y + room.d / 2);
      label.visible = showLabels;
      floorGroup.add(label);

      const furniture = new THREE.Group();
      addFurniture(furniture, room, materials);
      floorGroup.add(furniture);
    });
    scene.add(floorGroup);

    const wallGroup = new THREE.Group();
    for (const wall of plan.walls) addWall(scene, wall, wallGroup, materials);
    scene.add(wallGroup);

    const ceilingGroup = new THREE.Group();
    addCeiling(ceilingGroup, plan, materials);
    ceilingGroup.visible = showCeiling;
    scene.add(ceilingGroup);

    const cam = camRef.current!;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let idleSince = Date.now();

    const onDown = (e: PointerEvent) => {
      dragging = true;
      tourRef.current = false;
      lastX = e.clientX;
      lastY = e.clientY;
      idleSince = Date.now();
      renderer.domElement.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      cam.theta -= (e.clientX - lastX) * 0.0052;
      cam.phi = Math.min(Math.PI * 0.49, Math.max(0.12, cam.phi - (e.clientY - lastY) * 0.0052));
      lastX = e.clientX;
      lastY = e.clientY;
      idleSince = Date.now();
    };
    const onUp = (e: PointerEvent) => {
      dragging = false;
      try { renderer.domElement.releasePointerCapture(e.pointerId); } catch { /* noop */ }
      idleSince = Date.now();
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cam.radius = Math.min(Math.max(plan.width, plan.depth) * 4, Math.max(6, cam.radius * (e.deltaY > 0 ? 1.1 : 0.9)));
      idleSince = Date.now();
    };

    const el = renderer.domElement;
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('wheel', onWheel, { passive: false });

    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      if (tourRef.current && plan.rooms.length > 0) {
        const room = plan.rooms[tourIndexRef.current % plan.rooms.length];
        const desired = new THREE.Vector3(room.x + room.w / 2, 1.15, room.y + room.d / 2);
        cam.target.lerp(desired, 0.035);
        cam.radius += (Math.max(room.w, room.d) * 2.25 - cam.radius) * 0.035;
        cam.theta += 0.0034;
        if (cam.target.distanceTo(desired) < 0.18) {
          tourIndexRef.current = (tourIndexRef.current + 1) % plan.rooms.length;
        }
      } else if (!dragging && Date.now() - idleSince > 4500) {
        cam.theta += 0.0014;
      }
      camera.position.set(
        cam.target.x + cam.radius * Math.sin(cam.phi) * Math.cos(cam.theta),
        cam.target.y + cam.radius * Math.cos(cam.phi),
        cam.target.z + cam.radius * Math.sin(cam.phi) * Math.sin(cam.theta),
      );
      camera.lookAt(cam.target);
      renderer.render(scene, camera);
    };
    animate();

    const ro = new ResizeObserver(() => {
      const w2 = wrap.clientWidth || W;
      const h2 = wrap.clientHeight || H;
      renderer.setSize(w2, h2);
      camera.aspect = w2 / h2;
      camera.updateProjectionMatrix();
    });
    ro.observe(wrap);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('wheel', onWheel);
      const textures = new Set<THREE.Texture>();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
        for (const material of Array.isArray(m) ? m : m ? [m] : []) {
          for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
          material.dispose();
        }
      });
      textures.forEach(texture => texture.dispose());
      renderer.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry, rooms, preset, showCeiling, showLabels]);

  useEffect(() => {
    const cam = camRef.current;
    if (!cam) return;
    tourRef.current = false;
    if (view === 'top') {
      cam.phi = 0.12;
      cam.theta = Math.PI / 2;
    } else {
      cam.phi = 1.02;
      cam.theta = 0.9;
    }
  }, [view]);

  async function handleExport() {
    if (!sceneRef.current || !planRef.current) return;
    setExporting(true);
    try {
      await exportSceneGlb(sceneRef.current);
      downloadText(buildBlenderCyclesScript('fangwu3d-renovation.glb', activePreset), 'fangwu3d-blender-cycles.py');
      downloadText(JSON.stringify(buildPascalEditorPayload(planRef.current, activePreset), null, 2), 'fangwu3d-pascal-editor.json', 'application/json');
      downloadText(JSON.stringify(MATERIAL_PRESETS, null, 2), 'fangwu3d-material-library.json', 'application/json');
      downloadText(JSON.stringify(furnitureManifest('high'), null, 2), 'fangwu3d-furniture-library.json', 'application/json');
      downloadText(JSON.stringify(buildBlenderJob(planRef.current, activePreset), null, 2), 'fangwu3d-blender-job.json', 'application/json');
      downloadText(buildBlenderBatchScript(), 'fangwu3d-blender-batch.py', 'text/x-python');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <div className="scene3d-toolbar" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10, alignItems: 'center' }}>
        <select
          value={preset}
          disabled={savingMaterial}
          onChange={async (e) => {
            const next = e.target.value as MaterialPresetId;
            setSavingMaterial(true);
            try { await onPresetChange?.(next); setPreset(next); }
            catch { window.alert('材质保存失败，请重试'); }
            finally { setSavingMaterial(false); }
          }}
          className="btn btn-ghost"
          style={{ fontSize: 12, padding: '6px 10px' }}
          aria-label="装修材质库"
        >
          {MATERIAL_PRESETS.map((item) => (
            <option key={item.id} value={item.id}>{item.name}材质库</option>
          ))}
        </select>
        <button onClick={() => setView('persp')} className={`btn ${view === 'persp' ? 'btn-primary' : 'btn-ghost'}`} style={{ fontSize: 11, padding: '6px 12px' }}>透视</button>
        <button onClick={() => setView('top')} className={`btn ${view === 'top' ? 'btn-primary' : 'btn-ghost'}`} style={{ fontSize: 11, padding: '6px 12px' }}>俯视</button>
        <button onClick={() => { tourRef.current = !tourRef.current; }} className="btn btn-ghost" style={{ fontSize: 11, padding: '6px 12px' }}>漫游</button>
        <button onClick={() => setShowCeiling((v) => !v)} className={`btn ${showCeiling ? 'btn-primary' : 'btn-ghost'}`} style={{ fontSize: 11, padding: '6px 12px' }}>顶面</button>
        <button onClick={() => setShowLabels((v) => !v)} className={`btn ${showLabels ? 'btn-primary' : 'btn-ghost'}`} style={{ fontSize: 11, padding: '6px 12px' }}>标注</button>
        <button onClick={() => void handleExport()} disabled={exporting} className="btn btn-primary" style={{ fontSize: 11, padding: '6px 12px' }}>
          {exporting ? '导出中…' : '导出 Blender / Pascal'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 8, overflowX: 'auto' }}>
        {activePreset.swatch.map((color) => (
          <span key={color} title={color} style={{ width: 18, height: 18, borderRadius: 5, background: color, border: '1px solid rgba(255,255,255,.25)', flex: '0 0 auto' }} />
        ))}
        <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>{activePreset.description}</span>
      </div>

      <div className="scene3d-wrap" ref={wrapRef} style={{ height: 520 }}>
        <div className="scene3d-overlay">
          <span className="tag tag-cyan">PASCAL-READY GLB</span>
          <span className="tag tag-purple">BLENDER CYCLES</span>
          <span className="tag tag-green">CUSTOM MATERIALS</span>
        </div>
      </div>
      <p style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 8, textAlign: 'center' }}>
        拖拽环绕 · 滚轮缩放 · 自动漫游 · 门窗、家具、灯光和材质由同一套户型几何生成 · 导出 GLB 后可在 Blender Cycles 中继续精修
      </p>
    </div>
  );
}
