export const INTERIOR_IMAGES = {
  living: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1800&q=88',
  livingWarm: 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=1800&q=88',
  kitchen: 'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1800&q=88',
  bedroom: 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1800&q=88',
  architecture: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1800&q=88',
  dining: 'https://images.unsplash.com/photo-1615529162924-f8605388461d?auto=format&fit=crop&w=1800&q=88',
  neutral: 'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1800&q=88',
  detail: 'https://images.unsplash.com/photo-1617104678098-de229db51175?auto=format&fit=crop&w=1800&q=88',
  luxury: 'https://images.unsplash.com/photo-1615874694520-474822394e73?auto=format&fit=crop&w=1800&q=88',
  workspace: 'https://images.unsplash.com/photo-1618220179428-22790b461013?auto=format&fit=crop&w=1800&q=88',
  texture: 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1800&q=88',
  outdoor: 'https://images.unsplash.com/photo-1600210491892-03d54c0aaf87?auto=format&fit=crop&w=1800&q=88',
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
