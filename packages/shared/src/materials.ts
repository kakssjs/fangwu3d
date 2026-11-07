export type MaterialPresetId =
  | 'quiet-luxury'
  | 'warm-minimal'
  | 'natural'
  | 'modern';

export interface MaterialFamily {
  color: string;
  roughness: number;
  metalness: number;
  opacity?: number;
}

export interface MaterialPreset {
  id: MaterialPresetId;
  name: string;
  description: string;
  swatch: string[];
  background: string;
  fog: string;
  wall: MaterialFamily;
  exteriorWall: MaterialFamily;
  floor: MaterialFamily;
  ceiling: MaterialFamily;
  trim: MaterialFamily;
  door: MaterialFamily;
  windowFrame: MaterialFamily;
  glass: MaterialFamily;
  metal: MaterialFamily;
  fabric: MaterialFamily;
  wood: MaterialFamily;
  stone: MaterialFamily;
  accent: MaterialFamily;
  light: {
    ambient: string;
    ambientIntensity: number;
    sun: string;
    sunIntensity: number;
    fill: string;
    fillIntensity: number;
  };
}

export const MATERIAL_PRESETS: MaterialPreset[] = [
  {
    id: 'quiet-luxury',
    name: '静奢',
    description: '象牙白、深松绿与古铜点缀，沉稳克制。',
    swatch: ['#F2F0EB', '#233A32', '#9A7B5B', '#22211F'],
    background: '#EDEAE4',
    fog: '#EDEAE4',
    wall: { color: '#F2F0EB', roughness: 0.78, metalness: 0.02 },
    exteriorWall: { color: '#D8D1C7', roughness: 0.86, metalness: 0.01 },
    floor: { color: '#9A7B5B', roughness: 0.64, metalness: 0.03 },
    ceiling: { color: '#FAF9F6', roughness: 0.9, metalness: 0 },
    trim: { color: '#233A32', roughness: 0.58, metalness: 0.04 },
    door: { color: '#233A32', roughness: 0.55, metalness: 0.03 },
    windowFrame: { color: '#2E332F', roughness: 0.45, metalness: 0.12 },
    glass: { color: '#BFD8D5', roughness: 0.08, metalness: 0.02, opacity: 0.28 },
    metal: { color: '#9A7B5B', roughness: 0.28, metalness: 0.78 },
    fabric: { color: '#788A80', roughness: 0.92, metalness: 0 },
    wood: { color: '#79563E', roughness: 0.58, metalness: 0.02 },
    stone: { color: '#C8C1B7', roughness: 0.38, metalness: 0.03 },
    accent: { color: '#B69772', roughness: 0.34, metalness: 0.56 },
    light: {
      ambient: '#D8D5CB',
      ambientIntensity: 1.15,
      sun: '#FFF1D7',
      sunIntensity: 2.2,
      fill: '#E2C9A2',
      fillIntensity: 1.1,
    },
  },
  {
    id: 'warm-minimal',
    name: '暖简',
    description: '暖白、陶土与浅木，柔和自然，适合普通家庭。',
    swatch: ['#F7F4EF', '#B76E56', '#C7A47B', '#2E2B28'],
    background: '#F4EFE8',
    fog: '#F4EFE8',
    wall: { color: '#F7F4EF', roughness: 0.82, metalness: 0.01 },
    exteriorWall: { color: '#E3D8CD', roughness: 0.88, metalness: 0.01 },
    floor: { color: '#C7A47B', roughness: 0.72, metalness: 0.01 },
    ceiling: { color: '#FFFCF7', roughness: 0.92, metalness: 0 },
    trim: { color: '#B76E56', roughness: 0.62, metalness: 0.02 },
    door: { color: '#A86650', roughness: 0.62, metalness: 0.02 },
    windowFrame: { color: '#75675C', roughness: 0.5, metalness: 0.08 },
    glass: { color: '#D4E3E2', roughness: 0.1, metalness: 0.01, opacity: 0.26 },
    metal: { color: '#A77B5D', roughness: 0.35, metalness: 0.62 },
    fabric: { color: '#C58B73', roughness: 0.95, metalness: 0 },
    wood: { color: '#B17D57', roughness: 0.65, metalness: 0.01 },
    stone: { color: '#D9D0C4', roughness: 0.46, metalness: 0.02 },
    accent: { color: '#B76E56', roughness: 0.5, metalness: 0.08 },
    light: {
      ambient: '#F2DCC5',
      ambientIntensity: 1.3,
      sun: '#FFE5C0',
      sunIntensity: 2.05,
      fill: '#FFD0A8',
      fillIntensity: 1.25,
    },
  },
  {
    id: 'natural',
    name: '自然',
    description: '鼠尾草绿、亚麻与原木，清新而有生活感。',
    swatch: ['#F2F3EE', '#708069', '#C4A47D', '#28322B'],
    background: '#E8ECE4',
    fog: '#E8ECE4',
    wall: { color: '#F2F3EE', roughness: 0.84, metalness: 0.01 },
    exteriorWall: { color: '#C8D0C2', roughness: 0.9, metalness: 0.01 },
    floor: { color: '#B8946C', roughness: 0.76, metalness: 0.01 },
    ceiling: { color: '#F8F8F3', roughness: 0.92, metalness: 0 },
    trim: { color: '#708069', roughness: 0.66, metalness: 0.02 },
    door: { color: '#6E7D67', roughness: 0.68, metalness: 0.02 },
    windowFrame: { color: '#5A645A', roughness: 0.52, metalness: 0.08 },
    glass: { color: '#C8DCD8', roughness: 0.12, metalness: 0.01, opacity: 0.24 },
    metal: { color: '#8C8066', roughness: 0.38, metalness: 0.56 },
    fabric: { color: '#9DAA91', roughness: 0.95, metalness: 0 },
    wood: { color: '#A97B54', roughness: 0.72, metalness: 0.01 },
    stone: { color: '#C9C5B8', roughness: 0.52, metalness: 0.02 },
    accent: { color: '#708069', roughness: 0.58, metalness: 0.04 },
    light: {
      ambient: '#DDE5D7',
      ambientIntensity: 1.35,
      sun: '#F2F0CF',
      sunIntensity: 1.9,
      fill: '#D7C69A',
      fillIntensity: 1.15,
    },
  },
  {
    id: 'modern',
    name: '现代',
    description: '灰白、深炭与金属线条，强调建筑感和秩序。',
    swatch: ['#F5F7FA', '#3157D5', '#27A8A0', '#1C2330'],
    background: '#E8EDF3',
    fog: '#E8EDF3',
    wall: { color: '#F5F7FA', roughness: 0.76, metalness: 0.02 },
    exteriorWall: { color: '#C9D0D8', roughness: 0.84, metalness: 0.02 },
    floor: { color: '#7D858D', roughness: 0.52, metalness: 0.06 },
    ceiling: { color: '#FFFFFF', roughness: 0.88, metalness: 0 },
    trim: { color: '#3157D5', roughness: 0.42, metalness: 0.12 },
    door: { color: '#33404C', roughness: 0.48, metalness: 0.12 },
    windowFrame: { color: '#26313D', roughness: 0.34, metalness: 0.22 },
    glass: { color: '#B7D9E2', roughness: 0.07, metalness: 0.03, opacity: 0.22 },
    metal: { color: '#8C98A4', roughness: 0.24, metalness: 0.82 },
    fabric: { color: '#6D7F94', roughness: 0.9, metalness: 0 },
    wood: { color: '#765846', roughness: 0.55, metalness: 0.02 },
    stone: { color: '#B8C0C8', roughness: 0.32, metalness: 0.05 },
    accent: { color: '#27A8A0', roughness: 0.38, metalness: 0.22 },
    light: {
      ambient: '#C9D5E2',
      ambientIntensity: 1.15,
      sun: '#E8F2FF',
      sunIntensity: 2.25,
      fill: '#B7D8FF',
      fillIntensity: 1.05,
    },
  },
];

export function getMaterialPreset(id: MaterialPresetId): MaterialPreset {
  return MATERIAL_PRESETS.find((preset) => preset.id === id) ?? MATERIAL_PRESETS[0];
}

export function describeMaterialPreset(preset: MaterialPreset): string {
  return [
    `${preset.name} interior material palette`,
    `walls ${preset.wall.color}, floor ${preset.floor.color}, trim ${preset.trim.color}`,
    `doors ${preset.door.color}, window frames ${preset.windowFrame.color}, glass ${preset.glass.color}`,
    `furniture fabric ${preset.fabric.color}, wood ${preset.wood.color}, stone ${preset.stone.color}`,
    `metal accents ${preset.metal.color}`,
  ].join('; ');
}
