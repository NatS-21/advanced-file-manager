import { withTransaction, pool } from '../db/pool';
import { extractWithExiftool } from './exif';
import { extractColorPalette, extractVideoColorPalette, paletteToRgbStrings } from './colorPalette';
import type { ExtractedMetadata } from './types';

function toTs(value: string | undefined): string | null {
  return value ? value : null;
}

function toTextArray(value: string[] | undefined): string[] | null {
  return value && value.length ? value : null;
}

export async function ingestAssetMetadata(assetId: number, localPath: string): Promise<void> {
  // Проверяем, существует ли файл на диске
  const { existsSync } = require('fs');
  if (!existsSync(localPath)) {
    console.error(`File not found for asset ${assetId}: ${localPath}`);
    return;
  }

  // Получаем mimeType файла из базы данных
  const mimeTypeResult = await pool.query<{ mime_type: string }>(
    `SELECT mime_type FROM asset_files WHERE asset_id = $1 LIMIT 1`,
    [assetId]
  );
  const mimeType = mimeTypeResult.rows[0]?.mime_type;

  let md: ExtractedMetadata | null = null;
  try {
    md = await extractWithExiftool(localPath, mimeType);
  } catch (error) {
    console.error(`Failed to extract metadata for asset ${assetId}:`, error);
    return;
  }
  if (!md) return;

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE assets
       SET
         description = COALESCE(description, $2),
         language = COALESCE(language, $3),
         captured_at = COALESCE(captured_at, $4::timestamptz),
         keywords = CASE
           WHEN (keywords IS NULL OR array_length(keywords, 1) IS NULL OR array_length(keywords, 1) = 0) AND $5::text[] IS NOT NULL
             THEN $5::text[]
           ELSE keywords
         END,
         updated_at = NOW()
       WHERE id = $1`,
      [assetId, md.description ?? null, md.language ?? null, toTs(md.capturedAt), toTextArray(md.keywords)]
    );

    await client.query(
      `INSERT INTO asset_media (
         asset_id, width, height, orientation, color_space,
         duration_sec, fps, video_codec, audio_codec, bitrate, aspect_ratio,
         sample_rate, channels, loudness_lufs, dpi, bit_depth, compression,
         has_transparency, frame_count, audio_channels_layout
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       ON CONFLICT (asset_id) DO UPDATE SET
         width = EXCLUDED.width,
         height = EXCLUDED.height,
         orientation = EXCLUDED.orientation,
         color_space = EXCLUDED.color_space,
         duration_sec = EXCLUDED.duration_sec,
         fps = EXCLUDED.fps,
         video_codec = EXCLUDED.video_codec,
         audio_codec = EXCLUDED.audio_codec,
         bitrate = EXCLUDED.bitrate,
         aspect_ratio = EXCLUDED.aspect_ratio,
         sample_rate = EXCLUDED.sample_rate,
         channels = EXCLUDED.channels,
         loudness_lufs = EXCLUDED.loudness_lufs,
         dpi = EXCLUDED.dpi,
         bit_depth = EXCLUDED.bit_depth,
         compression = EXCLUDED.compression,
         has_transparency = EXCLUDED.has_transparency,
         frame_count = EXCLUDED.frame_count,
         audio_channels_layout = EXCLUDED.audio_channels_layout`,
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

    await client.query(
      `INSERT INTO asset_exif_iptc_xmp (asset_id, exif, iptc, xmp)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (asset_id) DO UPDATE SET
         exif = EXCLUDED.exif,
         iptc = EXCLUDED.iptc,
         xmp = EXCLUDED.xmp`,
      [assetId, md.exif ?? null, md.iptc ?? null, md.xmp ?? null]
    );
  });

  // Извлекаем цветовую палитру асинхронно (вне транзакции)
  if (localPath && mimeType) {
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
      console.error(`Failed to extract color palette for asset ${assetId}:`, error);
    }
  }
}


