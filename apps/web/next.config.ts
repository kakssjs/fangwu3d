import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 允许并行实例使用独立构建目录，避免 .next 互踩（默认不变）
  distDir: process.env.NEXT_DIST_DIR || '.next',
  transpilePackages: ['@i-renovation/shared'],
  serverExternalPackages: ['@electric-sql/pglite'],
};

export default nextConfig;
