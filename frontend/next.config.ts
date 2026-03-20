import type { NextConfig } from 'next';

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8000';
const isTauriBuild = process.env.NEXT_TAURI === 'true';

const nextConfig: NextConfig = {
  // Static export for Tauri desktop; standalone for Docker/web
  output: isTauriBuild ? 'export' : 'standalone',

  // Static export requires trailing slash to generate [slug]/index.html
  // instead of [slug].html — needed for Tauri WebView file serving
  ...(isTauriBuild ? { trailingSlash: true } : {}),

  // Required for static export — server cannot optimize images at request time
  images: isTauriBuild
    ? { unoptimized: true }
    : {
        remotePatterns: [
          {
            protocol: 'https',
            hostname: '*.supabase.co',
            pathname: '/storage/v1/object/public/**',
          },
        ],
      },

  // outputFileTracingIncludes only applies to standalone builds
  ...(isTauriBuild
    ? {}
    : {
        outputFileTracingIncludes: {
          '/[workspaceSlug]/docs/[slug]': ['./src/features/docs/content/*.md'],
        },
      }),

  // rewrites() and redirects() require a running Node.js server — unavailable in static export
  ...(isTauriBuild
    ? {}
    : {
        async rewrites() {
          return [
            {
              source: '/api/v1/:path*',
              destination: `${BACKEND_URL}/api/v1/:path*`,
            },
          ];
        },
        async redirects() {
          return [
            {
              source: '/:slug/settings/skills',
              destination: '/:slug/roles',
              permanent: true,
            },
            {
              source: '/:slug/settings/members',
              destination: '/:slug/members',
              permanent: true,
            },
          ];
        },
      }),

  // Performance optimizations
  poweredByHeader: false,

  // Strict mode for better React debugging
  reactStrictMode: true,

  // Allow importing .md files as raw strings (used by docs-manifest.ts).
  // Turbopack (Next.js 16 default) rule and webpack rule both configured.
  turbopack: {
    rules: {
      '*.md': {
        loaders: ['raw-loader'],
        as: '*.js',
      },
    },
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  webpack(config: any) {
    config.module.rules.push({ test: /\.md$/, type: 'asset/source' });
    return config;
  },

  // Experimental features
  experimental: {
    // Optimize package imports for faster builds
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-avatar',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-popover',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-separator',
      '@radix-ui/react-slot',
      '@radix-ui/react-tooltip',
      'date-fns',
      '@tiptap/core',
      '@tiptap/react',
      '@tiptap/pm',
      '@tiptap/starter-kit',
      '@tiptap/extension-placeholder',
      '@tiptap/extension-character-count',
      'recharts',
    ],
  },
};

export default nextConfig;
