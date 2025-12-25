import { defineConfig, loadEnv } from 'vite';
import path from 'path';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Allow overriding API proxy target for local dev (useful when Docker занимает 3000).
  // Example: VITE_API_TARGET=http://localhost:3001
  // In workspaces, vite runs with cwd=apps/web, but we often keep .env in repo root.
  const repoRoot = path.resolve(__dirname, '../..');
  const rootEnv = loadEnv(mode, repoRoot, '');
  const localEnv = loadEnv(mode, process.cwd(), '');
  const env = { ...rootEnv, ...localEnv };
  const apiTarget = env.VITE_API_TARGET || 'http://localhost:3000';
  const webPort = env.VITE_PORT ? Number(env.VITE_PORT) : 5173;

  return {
    plugins: [react()],
    server: {
      // By default Vite will auto-increment the port (5174/5175/...) if something is already listening.
      // strictPort=true makes it fail fast so "копящиеся порты" are an obvious "old dev server still running" signal.
      port: Number.isFinite(webPort) ? webPort : 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
  };
});


