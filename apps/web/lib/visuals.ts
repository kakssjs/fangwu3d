// 室内配图：来自 Unsplash（Unsplash License，可免费商用），已下载到 public/interiors/ 由本站提供，
// 避免国内访问 images.unsplash.com 缓慢或失败。
export const INTERIOR_IMAGES = {
  living: '/interiors/living.jpg',
  livingWarm: '/interiors/livingWarm.jpg',
  kitchen: '/interiors/kitchen.jpg',
  bedroom: '/interiors/bedroom.jpg',
  architecture: '/interiors/architecture.jpg',
  dining: '/interiors/dining.jpg',
  neutral: '/interiors/neutral.jpg',
  detail: '/interiors/detail.jpg',
  luxury: '/interiors/luxury.jpg',
  workspace: '/interiors/workspace.jpg',
  texture: '/interiors/texture.jpg',
  outdoor: '/interiors/outdoor.jpg',
} as const;

export const PROJECT_IMAGE_ROTATION = [
  INTERIOR_IMAGES.living,
  INTERIOR_IMAGES.kitchen,
  INTERIOR_IMAGES.bedroom,
  INTERIOR_IMAGES.dining,
  INTERIOR_IMAGES.neutral,
  INTERIOR_IMAGES.luxury,
];

export function projectImage(index: number) {
  return PROJECT_IMAGE_ROTATION[Math.abs(index) % PROJECT_IMAGE_ROTATION.length];
}
