'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { generatePlanGeometry, type PlanGeometry, type Wall, type PlanRoom, type RoomGeom } from '@i-renovation/shared/plan';
import { MATERIAL_PRESETS, getMaterialPreset, type MaterialPresetId, type MaterialFamily } from '@i-renovation/shared/materials';
import {
  buildBlenderCyclesScript,
  buildPascalEditorPayload,
  downloadText,
  exportSceneGlb,
} from '@/lib/scene-export';

interface Props {
  geometry?: PlanGeometry | null;
  rooms?: PlanRoom[];
  presetId?: MaterialPresetId;
  onPresetChange?: (id: MaterialPresetId) => void;
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

function addFurniture(group: THREE.Group, room: RoomGeom, materials: ReturnType<typeof makeMaterials>) {
  const centerX = room.x + room.w / 2;
  const centerZ = room.y + room.d / 2;
  const minSide = Math.min(room.w, room.d);
  const name = room.name;

  const sofa = () => {
    const width = Math.min(3.2, room.w * 0.52);
    addBox(group, [width, 0.72, 0.92], [centerX, 0.46, room.y + room.d * 0.24], familyMaterial(materials.fabric));
    addBox(group, [width, 0.72, 0.18], [centerX, 0.92, room.y + room.d * 0.24 - 0.42], familyMaterial(materials.fabric));
    addBox(group, [Math.min(1.35, room.w * 0.22), 0.12, 0.72], [centerX, 0.2, room.y + room.d * 0.57], familyMaterial(materials.wood));
    addBox(group, [Math.min(2.8, room.w * 0.42), 0.42, 0.48], [centerX, 0.34, room.y + room.d * 0.82], familyMaterial(materials.fabric));
  };

  const bed = () => {
    const width = Math.min(1.9, room.w * 0.56);
    const length = Math.min(2.15, room.d * 0.58);
    addBox(group, [width, 0.52, length], [centerX, 0.34, centerZ], familyMaterial(materials.wood));
    addBox(group, [width - 0.12, 0.28, length - 0.12], [centerX, 0.73, centerZ], familyMaterial(materials.fabric));
    addBox(group, [width + 0.16, 1.05, 0.16], [centerX, 0.85, room.y + 0.22], familyMaterial(materials.wood));
    addBox(group, [0.42, 0.38, 0.42], [centerX - width / 2 - 0.38, 0.34, room.y + 0.48], familyMaterial(materials.wood));
    addBox(group, [0.42, 0.38, 0.42], [centerX + width / 2 + 0.38, 0.34, room.y + 0.48], familyMaterial(materials.wood));
  };

  const dining = () => {
    const width = Math.min(1.85, room.w * 0.46);
    addBox(group, [width, 0.12, 0.95], [centerX, 0.78, centerZ], familyMaterial(materials.wood));
    addBox(group, [0.12, 0.72, 0.12], [centerX - width / 2 + 0.18, 0.39, centerZ - 0.32], familyMaterial(materials.metal));
    addBox(group, [0.12, 0.72, 0.12], [centerX + width / 2 - 0.18, 0.39, centerZ - 0.32], familyMaterial(materials.metal));
    addBox(group, [0.12, 0.72, 0.12], [centerX - width / 2 + 0.18, 0.39, centerZ + 0.32], familyMaterial(materials.metal));
    addBox(group, [0.12, 0.72, 0.12], [centerX + width / 2 - 0.18, 0.39, centerZ + 0.32], familyMaterial(materials.metal));
    for (const x of [centerX - width / 2 - 0.42, centerX + width / 2 + 0.42]) {
      addBox(group, [0.48, 0.78, 0.48], [x, 0.42, centerZ], familyMaterial(materials.fabric));
    }
  };

  const kitchen = () => {
    const length = Math.min(room.w * 0.78, 4.2);
    addBox(group, [length, 0.9, 0.62], [centerX, 0.45, room.y + 0.52], familyMaterial(materials.trim));
    addBox(group, [length + 0.08, 0.12, 0.72], [centerX, 0.96, room.y + 0.52], familyMaterial(materials.stone));
    addBox(group, [Math.min(1.65, room.w * 0.34), 0.9, 0.72], [centerX, 0.45, centerZ + 0.22], familyMaterial(materials.wood));
    addBox(group, [Math.min(1.75, room.w * 0.36), 0.1, 0.82], [centerX, 0.96, centerZ + 0.22], familyMaterial(materials.stone));
  };

  const bathroom = () => {
    addBox(group, [Math.min(1.35, room.w * 0.38), 0.78, 0.68], [room.x + room.w * 0.25, 0.39, room.y + room.d * 0.28], familyMaterial(materials.stone));
    addCylinder(group, 0.31, 0.22, [room.x + room.w * 0.25, 0.88, room.y + room.d * 0.28], familyMaterial(materials.stone));
    addBox(group, [Math.min(1.45, room.w * 0.42), 0.12, 0.62], [room.x + room.w * 0.72, 0.9, room.y + room.d * 0.26], familyMaterial(materials.stone));
    addBox(group, [Math.min(1.55, room.w * 0.44), 0.08, 0.82], [room.x + room.w * 0.72, 0.08, room.y + room.d * 0.72], familyMaterial(materials.glass));
  };

  const study = () => {
    addBox(group, [Math.min(2.2, room.w * 0.58), 0.12, 0.72], [centerX, 0.78, room.y + room.d * 0.28], familyMaterial(materials.wood));
    addBox(group, [0.48, 0.82, 0.48], [centerX, 0.4, room.y + room.d * 0.62], familyMaterial(materials.fabric));
    addBox(group, [Math.min(1.9, room.w * 0.5), 0.35, 0.34], [centerX, 1.48, room.y + room.d * 0.12], familyMaterial(materials.trim));
    for (let i = 0; i < 3; i++) addBox(group, [0.42, 0.12, 0.28], [centerX - 0.62 + i * 0.62, 1.7, room.y + room.d * 0.12], familyMaterial(materials.accent));
  };

  const balcony = () => {
    addCylinder(group, 0.38, 0.12, [centerX, 0.72, centerZ], familyMaterial(materials.wood));
    addCylinder(group, 0.08, 0.72, [centerX, 0.36, centerZ], familyMaterial(materials.metal));
    addCylinder(group, 0.34, 0.55, [room.x + room.w * 0.2, 0.28, room.y + room.d * 0.3], familyMaterial(materials.trim));
    addCylinder(group, 0.22, 0.75, [room.x + room.w * 0.2, 0.75, room.y + room.d * 0.3], familyMaterial(materials.accent), 16);
    addBox(group, [Math.min(1.8, room.w * 0.52), 0.42, 0.52], [centerX, 0.28, room.y + room.d * 0.72], familyMaterial(materials.fabric));
  };

  if (/客厅|起居|会客/.test(name)) sofa();
  else if (/卧|睡房/.test(name)) bed();
  else if (/餐/.test(name)) dining();
  else if (/厨/.test(name)) kitchen();
  else if (/卫|浴|洗手/.test(name)) bathroom();
  else if (/书房|工作|办公/.test(name)) study();
  else if (/阳台|露台/.test(name)) balcony();
  else {
    if (minSide > 2.2) sofa();
    else addBox(group, [Math.min(1.2, room.w * 0.38), 0.72, 0.62], [centerX, 0.36, centerZ], familyMaterial(materials.fabric));
  }
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
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else m?.dispose();
      });
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
    } finally {
      setExporting(false);
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <div className="scene3d-toolbar" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10, alignItems: 'center' }}>
        <select
          value={preset}
          onChange={(e) => {
            const next = e.target.value as MaterialPresetId;
            setPreset(next);
            onPresetChange?.(next);
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
