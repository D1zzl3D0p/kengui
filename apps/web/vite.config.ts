import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { defineConfig } from 'vitest/config';

const repoRoot = path.resolve(__dirname, '../..');

export default defineConfig({
  root: path.resolve(repoRoot, 'apps/web'),
  envDir: repoRoot,
  publicDir: path.resolve(repoRoot, 'public'),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(repoRoot, 'packages/app/src'),
      '@platform': path.resolve(repoRoot, 'packages/platform/src'),
      '@ui': path.resolve(repoRoot, 'packages/ui/src'),
    },
  },
  build: {
    outDir: path.resolve(repoRoot, 'dist/web'),
    emptyOutDir: true,
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/apps/desktop/src-tauri/**'] },
    proxy: {
      '/kenkui-api': {
        target: 'http://127.0.0.1:45365',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/kenkui-api/, ''),
      },
    },
  },
  test: {
    root: repoRoot,
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./packages/app/src/test/setup.ts'],
    include: ['./packages/**/*.test.{ts,tsx}'],
  },
});
