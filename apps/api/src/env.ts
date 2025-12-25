import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

let loaded = false;

/**
 * Loads .env files in a Yarn workspaces friendly way.
 *
 * In this monorepo, `yarn workspace @afm/api dev` runs with cwd = apps/api,
 * so default dotenv lookup would miss the repo root `.env`.
 *
 * Rules:
 * - Never override already-present process.env values (override: false).
 * - Load repo root `.env` first.
 * - Then load optional `apps/api/.env` (still non-overriding; useful for per-app tweaks).
 * - If DOTENV_CONFIG_PATH is provided, load that file first.
 */
export function loadEnvOnce() {
  if (loaded) return;
  loaded = true;

  const repoRoot = path.resolve(__dirname, '../../..'); // apps/api/(src|dist) -> repo root

  const candidates: string[] = [];

  if (process.env.DOTENV_CONFIG_PATH) {
    candidates.push(process.env.DOTENV_CONFIG_PATH);
  }

  candidates.push(path.join(repoRoot, '.env'));
  candidates.push(path.resolve(__dirname, '..', '.env')); // apps/api/.env

  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) {
        dotenv.config({ path: p, override: false });
      }
    } catch {
      // ignore fs/dotenv errors; production typically injects env via process.env
    }
  }
}

// Load eagerly on import so modules that read env at import-time (e.g. db pool) work correctly.
loadEnvOnce();


