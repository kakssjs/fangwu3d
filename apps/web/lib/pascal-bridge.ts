import type { SceneModel } from '@i-renovation/shared/scene3d';
import { getMaterialPreset, type MaterialPresetId } from '@i-renovation/shared/materials';
import { furnitureManifest } from '@i-renovation/shared/furniture';

export interface PascalScenePayload {
  schema: 'pascal-editor-scene@1';
  generatedAt: string;
  unit: 'm';
  bounds: { width: number; depth: number; wallHeight: number };
  geometry: SceneModel['geometry'];
  materials: SceneModel['materialPreset'];
  materialPresetId: MaterialPresetId;
  rooms: SceneModel['rooms'];
  furniture: ReturnType<typeof furnitureManifest>;
  camera: { theta: number; phi: number; radius: number; target: [number, number, number] };
  tools: string[];
}

export function buildPascalScene(model: SceneModel): PascalScenePayload {
  return {
    schema: 'pascal-editor-scene@1',
    generatedAt: new Date().toISOString(),
    unit: model.geometry.unit,
    bounds: {
      width: model.geometry.width,
      depth: model.geometry.depth,
      wallHeight: model.geometry.wallHeight,
    },
    geometry: model.geometry,
    materials: model.materialPreset,
    materialPresetId: model.materialPresetId,
    rooms: model.rooms,
    furniture: furnitureManifest('high'),
    camera: {
      theta: 0.9,
      phi: 1.02,
      radius: Math.max(model.geometry.width, model.geometry.depth) * 1.85,
      target: [model.geometry.width / 2, 1.05, model.geometry.depth / 2],
    },
    tools: [
      'update_wall',
      'update_opening',
      'place_furniture',
      'set_material',
      'set_camera',
      'export_glb',
    ],
  };
}

export function parsePascalScene(payload: PascalScenePayload): SceneModel | null {
  if (payload?.schema !== 'pascal-editor-scene@1' || !payload.geometry || !payload.materialPresetId) return null;
  const preset = getMaterialPreset(payload.materialPresetId);
  return {
    schema: 'i-renovation-scene3d@1',
    generatedAt: payload.generatedAt ?? new Date().toISOString(),
    style: 'Pascal Editor',
    source: 'floor_plan',
    geometry: payload.geometry,
    materialPresetId: payload.materialPresetId,
    materialPreset: payload.materials ?? preset,
    rooms: payload.rooms ?? payload.geometry.rooms.map((room) => ({
      name: room.name,
      area: room.area,
      bounds: { x: room.x, y: room.y, w: room.w, d: room.d },
      furniture: 'flex',
      camera: { theta: 0.9, phi: 1.02, radius: Math.max(room.w, room.d) * 2.25 },
    })),
    capabilities: {
      pascalEditorPayload: true,
      blenderCyclesExport: true,
      glbExport: true,
      customMaterialLibrary: true,
    },
  };
}

export function buildPascalMcpTools() {
  return {
    schema: 'pascal-editor-mcp@1',
    tools: [
      {
        name: 'update_wall',
        description: 'Move, resize, or recolor a wall in the renovation scene.',
        inputSchema: { wallId: 'string', x1: 'number', y1: 'number', x2: 'number', y2: 'number', height: 'number', thickness: 'number' },
      },
      {
        name: 'update_opening',
        description: 'Edit a door or window opening while preserving the floor-plan geometry.',
        inputSchema: { wallId: 'string', openingId: 'string', type: 'door|window', offset: 'number', width: 'number', height: 'number', sill: 'number' },
      },
      {
        name: 'place_furniture',
        description: 'Place or move furniture in a room.',
        inputSchema: { roomId: 'string', itemId: 'string', x: 'number', y: 'number', rotation: 'number' },
      },
      {
        name: 'set_material',
        description: 'Apply a material family to a wall, floor, door, window, or furniture object.',
        inputSchema: { objectId: 'string', material: 'wall|floor|trim|door|glass|metal|fabric|wood|stone|accent' },
      },
      {
        name: 'set_camera',
        description: 'Set the presentation camera for the 3D scene.',
        inputSchema: { theta: 'number', phi: 'number', radius: 'number', target: '[number,number,number]' },
      },
      {
        name: 'export_glb',
        description: 'Export the edited scene as a GLB file for Blender Cycles.',
        inputSchema: { fileName: 'string' },
      },
    ],
  };
}
