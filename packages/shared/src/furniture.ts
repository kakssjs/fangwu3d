import type { FurnitureCategory } from './scene3d';

export type FurnitureQuality = 'eco' | 'high';

export interface FurnitureItemSpec {
  id: string;
  name: string;
  category: FurnitureCategory;
  /** footprint in metres */
  footprint: [number, number];
  /** default height in metres */
  height: number;
  tags: string[];
  swatch: 'fabric' | 'wood' | 'stone' | 'metal' | 'accent' | 'trim' | 'glass';
}

export const FURNITURE_CATALOG: FurnitureItemSpec[] = [
  { id: 'sofa-3seat', name: '三人沙发', category: 'living', footprint: [2.8, 0.95], height: 0.82, tags: ['sofa', 'seating'], swatch: 'fabric' },
  { id: 'sofa-sectional', name: '转角沙发', category: 'living', footprint: [3.2, 1.8], height: 0.82, tags: ['sofa', 'sectional'], swatch: 'fabric' },
  { id: 'coffee-table', name: '茶几', category: 'living', footprint: [1.25, 0.72], height: 0.42, tags: ['table'], swatch: 'wood' },
  { id: 'tv-console', name: '电视柜', category: 'living', footprint: [2.2, 0.42], height: 0.52, tags: ['media'], swatch: 'wood' },
  { id: 'rug-living', name: '客厅地毯', category: 'living', footprint: [3.1, 2.2], height: 0.025, tags: ['rug'], swatch: 'fabric' },
  { id: 'bed-queen', name: '双人床', category: 'bedroom', footprint: [1.9, 2.15], height: 0.95, tags: ['bed'], swatch: 'fabric' },
  { id: 'nightstand', name: '床头柜', category: 'bedroom', footprint: [0.52, 0.42], height: 0.55, tags: ['storage'], swatch: 'wood' },
  { id: 'wardrobe', name: '衣柜', category: 'bedroom', footprint: [2.15, 0.62], height: 2.25, tags: ['storage'], swatch: 'wood' },
  { id: 'dining-table', name: '餐桌', category: 'dining', footprint: [1.85, 0.95], height: 0.78, tags: ['table'], swatch: 'wood' },
  { id: 'dining-chair', name: '餐椅', category: 'dining', footprint: [0.52, 0.52], height: 0.88, tags: ['chair'], swatch: 'fabric' },
  { id: 'kitchen-base', name: '厨房地柜', category: 'kitchen', footprint: [3.8, 0.65], height: 0.92, tags: ['cabinet'], swatch: 'trim' },
  { id: 'kitchen-island', name: '中岛台', category: 'kitchen', footprint: [1.8, 0.9], height: 0.94, tags: ['island'], swatch: 'stone' },
  { id: 'refrigerator', name: '冰箱', category: 'kitchen', footprint: [0.82, 0.72], height: 1.9, tags: ['appliance'], swatch: 'metal' },
  { id: 'bathroom-vanity', name: '浴室柜', category: 'bathroom', footprint: [1.4, 0.65], height: 0.9, tags: ['vanity'], swatch: 'stone' },
  { id: 'toilet', name: '马桶', category: 'bathroom', footprint: [0.42, 0.68], height: 0.78, tags: ['fixture'], swatch: 'stone' },
  { id: 'shower', name: '淋浴间', category: 'bathroom', footprint: [1.2, 0.9], height: 2.15, tags: ['shower'], swatch: 'glass' },
  { id: 'study-desk', name: '书桌', category: 'study', footprint: [1.7, 0.72], height: 0.78, tags: ['desk'], swatch: 'wood' },
  { id: 'study-chair', name: '办公椅', category: 'study', footprint: [0.62, 0.62], height: 1.02, tags: ['chair'], swatch: 'fabric' },
  { id: 'bookshelf', name: '书架', category: 'study', footprint: [1.4, 0.34], height: 1.95, tags: ['storage'], swatch: 'wood' },
  { id: 'balcony-set', name: '阳台桌椅', category: 'balcony', footprint: [1.55, 1.1], height: 0.76, tags: ['table', 'chair'], swatch: 'wood' },
  { id: 'plant-large', name: '大型绿植', category: 'flex', footprint: [0.7, 0.7], height: 1.45, tags: ['plant'], swatch: 'accent' },
  { id: 'floor-lamp', name: '落地灯', category: 'flex', footprint: [0.42, 0.42], height: 1.72, tags: ['light'], swatch: 'metal' },
];

export function furnitureForCategory(category: FurnitureCategory): FurnitureItemSpec[] {
  return FURNITURE_CATALOG.filter((item) => item.category === category || (category === 'flex' && item.category === 'flex'));
}

export function furnitureManifest(quality: FurnitureQuality = 'high') {
  return {
    schema: 'i-renovation-furniture@1',
    quality,
    generatedAt: new Date().toISOString(),
    items: FURNITURE_CATALOG,
    replaceableWithGlb: true,
    recommendedFormats: ['glb', 'gltf'],
  };
}

