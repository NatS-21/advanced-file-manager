import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

let loaded = false;

export function loadEnvOnce() {
  if (loaded) return;
  loaded = true;

  const repoRoot = path.resolve(__dirname, '../../..');

  const candidates: string[] = [];

  if (process.env.DOTENV_CONFIG_PATH) {
    candidates.push(process.env.DOTENV_CONFIG_PATH);
  }

  candidates.push(path.join(repoRoot, '.env'));
  candidates.push(path.resolve(__dirname, '..', '.env'));

  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) {
        dotenv.config({ path: p, override: false });
      }
    } catch {
    }
  }
}

loadEnvOnce();


