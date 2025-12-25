import { defineConfig, loadEnv } from 'vite';
import path from 'path';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const repoRoot = path.resolve(__dirname, '../..');
  const rootEnv = loadEnv(mode, repoRoot, '');
  const localEnv = loadEnv(mode, process.cwd(), '');
  const env = { ...rootEnv, ...localEnv };
  const apiTarget = env.VITE_API_TARGET || 'http://localhost:3000';
  const webPort = env.VITE_PORT ? Number(env.VITE_PORT) : 5173;

  return {
    plugins: [react()],
    server: {
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


