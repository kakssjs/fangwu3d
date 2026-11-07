'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { generatePlanGeometry, type PlanGeometry, type Wall, type PlanRoom } from '@i-renovation/shared/plan';

interface Props {
  geometry?: PlanGeometry | null;
  rooms?: PlanRoom[]; // 兜底：无几何时由房间面积现场生成
}

const ROOM_COLORS = [0xc9b99a, 0xa9b8a3, 0xd9c3a5, 0x9fb3a8, 0xbfae94, 0xd6c9b0, 0xb3a48c, 0xc4b5a0];
const WALL_COLOR = 0xd8d2c8;
const WALL_EXTERIOR = 0xc4bcae;

/** 房间名标签（canvas → Sprite） */
function makeLabel(text: string, sub: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(28, 42, 35, 0.8)';
  ctx.beginPath();
  (ctx.roundRect ?? ctx.rect).call(ctx, 8, 8, 240, 80, 14);
  ctx.fill();
  ctx.fillStyle = '#f8f4ea';
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(text, 128, 44);
  ctx.fillStyle = '#c9af83';
  ctx.font = '22px sans-serif';
  ctx.fillText(sub, 128, 74);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.6, 0.6, 1);
  return sprite;
}

/** 一段墙（含洞口）→ 若干实体盒子 */
function addWall(scene: THREE.Scene, wall: Wall, group: THREE.Group) {
  const L = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
  if (L < 0.05) return;
  const horizontal = Math.abs(wall.y2 - wall.y1) < 1e-6;
  const dirX = (wall.x2 - wall.x1) / L;
  const dirZ = (wall.y2 - wall.y1) / L;
  const mat = new THREE.MeshStandardMaterial({
    color: wall.exterior ? WALL_EXTERIOR : WALL_COLOR,
    roughness: 0.85, metalness: 0.05,
  });

  // 实体区间 = 整段墙减去洞口
  const cuts = [...wall.openings]
    .sort((a, b) => a.offset - b.offset)
    .map(o => [Math.max(0, o.offset - o.width / 2), Math.min(L, o.offset + o.width / 2)] as [number, number]);
  const solids: [number, number][] = [];
  let cursor = 0;
  for (const [a, b] of cuts) { if (a > cursor + 0.01) solids.push([cursor, a]); cursor = Math.max(cursor, b); }
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

  for (const o of wall.openings) {
    const a = Math.max(0, o.offset - o.width / 2);
    const len = Math.min(o.width, L - a);
    if (len <= 0.05) continue;
    if (o.sill > 0.01) place(a, 0, len, o.sill, wall.thickness);                    // 窗台下墙
    const top = o.sill + o.height;
    if (wall.height - top > 0.01) place(a, top, len, wall.height - top, wall.thickness); // 门窗过梁
  }
  scene.add(group);
}

export default function Scene3D({ geometry, rooms }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<'persp' | 'top'>('persp');
  const camRef = useRef<{ theta: number; phi: number; radius: number; target: THREE.Vector3 } | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    // 事实源：外部几何 > 由房间面积现场生成
    const plan: PlanGeometry | null =
      geometry ?? (rooms && rooms.length ? generatePlanGeometry(rooms) : null);
    if (!plan) return;

    while (wrap.firstChild) wrap.removeChild(wrap.firstChild);
    const W = wrap.clientWidth || 640;
    const H = wrap.clientHeight || 420;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1c2a23);
    scene.fog = new THREE.FogExp2(0x1c2a23, 0.008);

    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 300);
    const target = new THREE.Vector3(plan.width / 2, 1, plan.depth / 2);
    camRef.current = { theta: 0.9, phi: 1.05, radius: Math.max(plan.width, plan.depth) * 1.9, target };

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    wrap.appendChild(renderer.domElement);

    // 灯光
    scene.add(new THREE.AmbientLight(0xd8d2c0, 0.7));
    const sun = new THREE.DirectionalLight(0xfff2dd, 1.4);
    sun.position.set(plan.width, 22, plan.depth * 0.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    scene.add(sun);
    const fill = new THREE.PointLight(0xe6d2a8, 0.9, 60);
    fill.position.set(plan.width / 2, 10, plan.depth / 2);
    scene.add(fill);

    // 地面 + 网格
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(plan.width * 3, plan.depth * 3),
      new THREE.MeshStandardMaterial({ color: 0x22332a, roughness: 0.95 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(plan.width / 2, -0.08, plan.depth / 2);
    ground.receiveShadow = true;
    scene.add(ground);
    const grid = new THREE.GridHelper(Math.max(plan.width, plan.depth) * 2.4, 30, 0x3a4c40, 0x2a3a30);
    grid.position.set(plan.width / 2, -0.06, plan.depth / 2);
    scene.add(grid);

    // 楼板：每个房间一块（颜色区分 + 半透明，俯视时能看 2D 布局）
    plan.rooms.forEach((r, i) => {
      const geo = new THREE.BoxGeometry(r.w - 0.02, 0.12, r.d - 0.02);
      const mat = new THREE.MeshStandardMaterial({
        color: ROOM_COLORS[i % ROOM_COLORS.length],
        transparent: true, opacity: 0.55, roughness: 0.6, metalness: 0.15,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(r.x + r.w / 2, 0.06, r.y + r.d / 2);
      mesh.receiveShadow = true;
      scene.add(mesh);

      const label = makeLabel(r.name, `${r.area.toFixed(1)}㎡`);
      label.position.set(r.x + r.w / 2, 1.75, r.y + r.d / 2);
      scene.add(label);
    });

    // 墙体拉伸（SplitFloor 门窗洞口 → 实体分段）
    const wallGroup = new THREE.Group();
    for (const wall of plan.walls) addWall(scene, wall, wallGroup);

    // ---- 相机控制：拖拽环绕 + 滚轮缩放 + 空闲自转 ----
    const cam = camRef.current;
    let dragging = false;
    let lastX = 0, lastY = 0;
    let idleSince = Date.now();
    const onDown = (e: PointerEvent) => {
      dragging = true; lastX = e.clientX; lastY = e.clientY;
      idleSince = Date.now();
      renderer.domElement.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      cam.theta -= (e.clientX - lastX) * 0.0052;
      cam.phi = Math.min(Math.PI * 0.49, Math.max(0.12, cam.phi - (e.clientY - lastY) * 0.0052));
      lastX = e.clientX; lastY = e.clientY;
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
      if (!dragging && Date.now() - idleSince > 4500) cam.theta += 0.0016; // 空闲缓慢环绕
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
      const w2 = wrap.clientWidth || W, h2 = wrap.clientHeight || H;
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
        if (mesh.geometry) mesh.geometry.dispose();
        const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(m)) m.forEach(x => x.dispose()); else m?.dispose();
      });
      renderer.dispose();
    };
    // geometry 对象引用稳定（来自 API 轮询的 JSON），以 rooms 兜底触发重建
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry, rooms]);

  // 透视 / 俯视 切换（不重建场景，只改相机）
  useEffect(() => {
    const cam = camRef.current;
    if (!cam) return;
    if (view === 'top') {
      cam.phi = 0.12;
      cam.theta = Math.PI / 2;
    } else {
      cam.phi = 1.05;
      cam.theta = 0.9;
    }
  }, [view]);

  return (
    <div style={{ position: 'relative' }}>
      <div className="scene3d-toggle" style={{ position: 'absolute', top: 12, right: 12, zIndex: 5, display: 'flex', gap: 8 }}>
        <button
          onClick={() => setView('persp')}
          className={`btn ${view === 'persp' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ fontSize: 11, padding: '4px 12px' }}
        >透视</button>
        <button
          onClick={() => setView('top')}
          className={`btn ${view === 'top' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ fontSize: 11, padding: '4px 12px' }}
        >俯视</button>
      </div>
      <div className="scene3d-wrap" ref={wrapRef}>
        <div className="scene3d-overlay">
          <span className="tag tag-cyan">2D→3D REBUILD</span>
          <span className="tag tag-purple">PLAN JSON EXTRUSION</span>
          <span className="tag tag-green">AI 生成</span>
        </div>
      </div>
      <p style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 8, textAlign: 'center' }}>
        拖拽环绕 · 滚轮缩放 · 墙体/门洞/窗洞由平面几何拉伸生成 · 尺寸以现场量房为准
      </p>
    </div>
  );
}
