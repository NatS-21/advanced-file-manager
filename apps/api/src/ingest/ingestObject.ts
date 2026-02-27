import { PoolClient } from 'pg';
import { withTransaction, pool } from '../db/pool';
import { extractWithExiftool } from './exif';
import { ExtractedMetadata, IngestResult, SourceObject, AssetType } from './types';
import { extractColorPalette, extractVideoColorPalette, paletteToRgbStrings } from './colorPalette';
import { createHash } from 'crypto';
import { createReadStream } from 'fs';

async function computeSha256(localPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(localPath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function inferAssetType(mimeType: string): AssetType {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'doc';
}

async function upsertAsset(client: PoolClient, teamId: number, ownerId: number | null, type: AssetType, md: ExtractedMetadata) {
  const { rows } = await client.query<{ id: number }>(
    `INSERT INTO assets (team_id, owner_id, type, title, description, language, status, captured_at, keywords)
     VALUES ($1,$2,$3,$4,$5,$6,'draft',$7,$8)
     RETURNING id`,
    [teamId, ownerId, type, md.title ?? null, md.description ?? null, md.language ?? null, md.capturedAt ?? null, md.keywords ?? []]
  );
  return rows[0].id;
}

async function insertFile(client: PoolClient, assetId: number, src: SourceObject, sha256: string) {
  await client.query(
    `INSERT INTO asset_files (asset_id, storage_provider, bucket, object_key, size_bytes, mime_type, sha256, checksum_verified)
     VALUES ($1,$2,$3,$4,$5,$6,$7, $8)` ,
    [assetId, src.storageProvider, src.bucket, src.objectKey, src.sizeBytes, src.mimeType, sha256, Boolean(sha256)]
  );
}

async function insertMedia(client: PoolClient, assetId: number, md: ExtractedMetadata) {
  await client.query(
    `INSERT INTO asset_media (
      asset_id, width, height, orientation, color_space, duration_sec, fps, video_codec, audio_codec, bitrate, aspect_ratio,
      sample_rate, channels, loudness_lufs, dpi, bit_depth, compression, has_transparency, frame_count, audio_channels_layout
    )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
    [
      assetId,
      md.width ?? null,
      md.height ?? null,
      md.orientation ?? null,
      md.colorSpace ?? null,
      md.durationSec ?? null,
      md.fps ?? null,
      md.videoCodec ?? null,
      md.audioCodec ?? null,
      md.bitrate ?? null,
      md.aspectRatio ?? null,
      md.sampleRate ?? null,
      md.channels ?? null,
      md.loudnessLufs ?? null,
      md.dpi ?? null,
      md.bitDepth ?? null,
      md.compression ?? null,
      md.hasTransparency ?? null,
      md.frameCount ?? null,
      md.audioChannelsLayout ?? null,
    ]
  );
}

async function insertColorPalette(
  assetId: number,
  localPath: string,
  mimeType: string
): Promise<void> {
  try {
    let palette = null;
    if (mimeType.startsWith('image/')) {
      palette = await extractColorPalette(localPath);
    } else if (mimeType.startsWith('video/')) {
      palette = await extractVideoColorPalette(localPath);
    }

    if (palette) {
      const paletteData = paletteToRgbStrings(palette);
      await pool.query(
        `INSERT INTO asset_colors (
          asset_id, vibrant_rgb, muted_rgb, dark_vibrant_rgb, dark_muted_rgb,
          light_vibrant_rgb, light_muted_rgb, distinct_colors, palette
        )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (asset_id) DO UPDATE SET
           vibrant_rgb = EXCLUDED.vibrant_rgb,
           muted_rgb = EXCLUDED.muted_rgb,
           dark_vibrant_rgb = EXCLUDED.dark_vibrant_rgb,
           dark_muted_rgb = EXCLUDED.dark_muted_rgb,
           light_vibrant_rgb = EXCLUDED.light_vibrant_rgb,
           light_muted_rgb = EXCLUDED.light_muted_rgb,
           distinct_colors = EXCLUDED.distinct_colors,
           palette = EXCLUDED.palette`,
        [
          assetId,
          paletteData.vibrant_rgb ?? null,
          paletteData.muted_rgb ?? null,
          paletteData.dark_vibrant_rgb ?? null,
          paletteData.dark_muted_rgb ?? null,
          paletteData.light_vibrant_rgb ?? null,
          paletteData.light_muted_rgb ?? null,
          paletteData.distinct_colors ? JSON.stringify(paletteData.distinct_colors) : null,
          JSON.stringify(paletteData.palette) ?? null,
        ]
  );
    }
  } catch (error) {
    // Логируем ошибку, но не прерываем весь процесс индексации
    console.error(`Failed to extract color palette for asset ${assetId}:`, error);
  }
}

async function insertSidecars(client: PoolClient, assetId: number, md: ExtractedMetadata) {
  await client.query(
    `INSERT INTO asset_exif_iptc_xmp (asset_id, exif, iptc, xmp)
     VALUES ($1, $2, $3, $4)`,
    [assetId, md.exif ?? null, md.iptc ?? null, md.xmp ?? null]
  );
}

export async function ingestObject(teamId: number, ownerId: number | null, src: SourceObject): Promise<IngestResult> {
  if (!src.localPath) {
    throw new Error('localPath is required for metadata extraction');
  }

  const [md, sha256] = await Promise.all([
    extractWithExiftool(src.localPath, src.mimeType),
    computeSha256(src.localPath),
  ]);

  const type = inferAssetType(src.mimeType);

  const assetId = await withTransaction(async (client) => {
    const id = await upsertAsset(client, teamId, ownerId, type, md);
    await insertFile(client, id, src, sha256);
    await insertMedia(client, id, md);
    await insertSidecars(client, id, md);
    
    // Извлечение цветовой палитры выполняем асинхронно,
    // чтобы не блокировать транзакцию долгими операциями
    return id;
  });

  // Извлекаем цветовую палитру уже вне транзакции (асинхронно, без блокировки)
  if (src.localPath) {
    insertColorPalette(assetId, src.localPath, src.mimeType).catch((error) => {
      console.error(`Failed to extract color palette for asset ${assetId}:`, error);
    });
  }

  return { assetId };
}




