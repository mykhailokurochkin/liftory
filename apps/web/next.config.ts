import type { NextConfig } from 'next';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const upstream = process.env.API_INTERNAL_URL;
if (process.env.VERCEL === '1' && !upstream)
  throw new Error('Vercel requires an explicit HTTPS API_INTERNAL_URL.');
const api = new URL(upstream ?? 'http://127.0.0.1:3301');
if (
  !['http:', 'https:'].includes(api.protocol) ||
  (process.env.VERCEL === '1' && api.protocol !== 'https:') ||
  api.username ||
  api.password ||
  api.pathname !== '/' ||
  api.search ||
  api.hash
)
  throw new Error('Invalid API origin; use an exact HTTP(S) origin without credentials or path.');

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: resolve(dirname(fileURLToPath(import.meta.url)), '../..'),
  transpilePackages: ['@liftory/contracts', '@liftory/offline'],
  poweredByHeader: false,
  generateBuildId: async () => process.env.NEXT_PUBLIC_LIFTORY_BUILD ?? 'development',
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${api.origin}/api/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store' },
          { key: 'CDN-Cache-Control', value: 'no-store' },
          { key: 'Vercel-CDN-Cache-Control', value: 'no-store' },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};
export default config;
