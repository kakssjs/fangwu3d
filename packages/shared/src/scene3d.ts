import type { PlanGeometry, PlanRoom, RoomGeom } from './plan';
import {
  getMaterialPreset,
  type MaterialPreset,
  type MaterialPresetId,
} from './materials';

export type FurnitureCategory =
  | 'living'
  | 'bedroom'
  | 'dining'
  | 'kitchen'
  | 'bathroom'
  | 'study'
  | 'balcony'
  | 'flex';

export interface FurniturePlacement {
  itemId: string;
  x: number;
  y: number;
  rotation: number;
}

export interface SceneCamera {
  theta: number;
  phi: number;
  radius: number;
  target: [number, number, number];
}

export interface SceneRoomModel {
  name: string;
  area: number;
  bounds: Pick<RoomGeom, 'x' | 'y' | 'w' | 'd'>;
  furniture: FurnitureCategory;
  /** 3D 视图中的推荐相机朝向：房间中心 + 视角 */
  camera: { theta: number; phi: number; radius: number };
  placements?: FurniturePlacement[];
}

export interface SceneModel {
  schema: 'i-renovation-scene3d@1';
  generatedAt: string;
  style: string;
  source: 'floor_plan' | 'agent_fallback';
  geometry: PlanGeometry;
  materialPresetId: MaterialPresetId;
  materialPreset: MaterialPreset;
  rooms: SceneRoomModel[];
  camera: SceneCamera;
  capabilities: {
    pascalEditorPayload: true;
    blenderCyclesExport: true;
    glbExport: true;
    customMaterialLibrary: true;
  };
}

export function inferMaterialPreset(style: string): MaterialPresetId {
  if (/轻奢|奢华|高级|中式/.test(style)) return 'quiet-luxury';
  if (/现代|工业|科技/.test(style)) return 'modern';
  if (/原木|自然|北欧|奶油/.test(style)) return 'natural';
  return 'warm-minimal';
}

export function classifyFurniture(name: string): FurnitureCategory {
  if (/客厅|起居|会客/.test(name)) return 'living';
  if (/卧|睡房/.test(name)) return 'bedroom';
  if (/餐/.test(name)) return 'dining';
  if (/厨/.test(name)) return 'kitchen';
  if (/卫|浴|洗手/.test(name)) return 'bathroom';
  if (/书房|工作|办公/.test(name)) return 'study';
  if (/阳台|露台/.test(name)) return 'balcony';
  return 'flex';
}

export function buildSceneModel(
  geometry: PlanGeometry,
  rooms: PlanRoom[],
  style: string,
  options: {
    source?: SceneModel['source'];
    materialPresetId?: MaterialPresetId;
    now?: string;
  } = {},
): SceneModel {
  const materialPresetId = options.materialPresetId ?? inferMaterialPreset(style);
  return {
    schema: 'i-renovation-scene3d@1',
    generatedAt: options.now ?? new Date().toISOString(),
    style,
    source: options.source ?? 'agent_fallback',
    geometry,
    materialPresetId,
    materialPreset: getMaterialPreset(materialPresetId),
    camera: {
      theta: 0.9,
      phi: 1.02,
      radius: Math.max(geometry.width, geometry.depth) * 1.85,
      target: [geometry.width / 2, 1.05, geometry.depth / 2],
    },
    rooms: geometry.rooms.map((room) => ({
      name: room.name,
      area: room.area,
      bounds: { x: room.x, y: room.y, w: room.w, d: room.d },
      furniture: classifyFurniture(room.name),
      camera: {
        theta: 0.9,
        phi: 1.02,
        radius: Math.max(room.w, room.d) * 2.25,
      },
      placements: [],
    })),
    capabilities: {
      pascalEditorPayload: true,
      blenderCyclesExport: true,
      glbExport: true,
      customMaterialLibrary: true,
    },
  };
}

export function validateSceneModel(model: SceneModel) {
  const errors: string[] = [];
  if (!model || typeof model !== 'object') return { ok: false, errors: ['场景必须是对象'] };
  if (model.schema !== 'i-renovation-scene3d@1') errors.push('schema 不是 i-renovation-scene3d@1');
  if (!model.geometry) errors.push('缺少 geometry');
  if (!model.geometry?.rooms?.length) errors.push('geometry.rooms 为空');
  if (!model.geometry?.walls?.length) errors.push('geometry.walls 为空');
  if (!model.materialPresetId) errors.push('缺少 materialPresetId');
  if (model.rooms?.length !== model.geometry?.rooms?.length) errors.push('rooms 与 geometry.rooms 数量不一致');
  const g = model.geometry;
  if (g && (![g.width, g.depth, g.wallHeight].every(n => Number.isFinite(n) && n > 0) ||
      !Array.isArray(g.rooms) || !Array.isArray(g.walls) || !Array.isArray(model.rooms))) errors.push('场景尺寸或列表无效');
  if (Array.isArray(g?.rooms) && g.rooms.some(r => !r || typeof r.name !== 'string' || ![r.x, r.y, r.w, r.d, r.area].every(Number.isFinite) || r.w <= 0 || r.d <= 0)) errors.push('房间尺寸无效');
  if (Array.isArray(g?.walls) && g.walls.some(w => !w || ![w.x1, w.y1, w.x2, w.y2, w.height, w.thickness].every(Number.isFinite) || !Array.isArray(w.openings))) errors.push('墙体数据无效');
  return { ok: errors.length === 0, errors };
}

export function sceneModelFromPlanContent(
  content: { rooms?: PlanRoom[]; geometry?: PlanGeometry },
  style: string,
  source: SceneModel['source'] = 'agent_fallback',
): SceneModel | null {
  if (!content.geometry) return null;
  return buildSceneModel(content.geometry, content.rooms ?? [], style, { source });
}
