#!/usr/bin/env tsx

import { pool } from '../src/db/pool';
import { ingestAssetMetadata } from '../src/ingest/ingestAssetMetadata';
import { resolveObjectPath } from '../src/storage/local';
import { getStorageDir } from '../src/storage/local';

async function reingestMetadata(assetId?: number) {
  const storageDir = getStorageDir();

  if (assetId) {
    // Переиндексировать метаданные для конкретного актива
    const { rows } = await pool.query<{ id: number; object_key: string }>(
      `SELECT af.asset_id as id, af.object_key
       FROM asset_files af
       WHERE af.asset_id = $1
       LIMIT 1`,
      [assetId]
    );

    if (rows.length === 0) {
      console.error(`Asset ${assetId} not found`);
      process.exit(1);
    }

    const localPath = resolveObjectPath(storageDir, rows[0].object_key);
    const { existsSync } = require('fs');
    if (!existsSync(localPath)) {
      console.error(`File not found: ${localPath}`);
      console.error(`Storage dir: ${storageDir}`);
      console.error(`Object key: ${rows[0].object_key}`);
      process.exit(1);
    }
    console.log(`Reingesting metadata for asset ${assetId}...`);
    console.log(`File path: ${localPath}`);
    await ingestAssetMetadata(assetId, localPath);
    console.log(`✓ Completed asset ${assetId}`);
  } else {
    // Переиндексировать метаданные для всех активов
    const { rows } = await pool.query<{ id: number; object_key: string }>(
      `SELECT DISTINCT af.asset_id as id, af.object_key
       FROM asset_files af
       JOIN assets a ON a.id = af.asset_id
       WHERE a.deleted_at IS NULL
       ORDER BY af.asset_id`
    );

    console.log(`Found ${rows.length} assets to reingest`);

    let success = 0;
    let failed = 0;

    for (const row of rows) {
      try {
        const localPath = resolveObjectPath(storageDir, row.object_key);
        const { existsSync } = require('fs');
        if (!existsSync(localPath)) {
          console.warn(`File not found for asset ${row.id}: ${localPath}`);
          failed++;
          continue;
        }
        await ingestAssetMetadata(row.id, localPath);
        success++;
        if (success % 10 === 0) {
          console.log(`Progress: ${success}/${rows.length} (${failed} failed)`);
        }
      } catch (error) {
        failed++;
        console.error(`Failed to reingest asset ${row.id}:`, error);
      }
    }

    console.log(`\n✓ Completed: ${success} succeeded, ${failed} failed`);
  }

  await pool.end();
}

const assetId = process.argv[2] ? parseInt(process.argv[2], 10) : undefined;
if (assetId && isNaN(assetId)) {
  console.error('Invalid asset ID');
  process.exit(1);
}

reingestMetadata(assetId).catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});

