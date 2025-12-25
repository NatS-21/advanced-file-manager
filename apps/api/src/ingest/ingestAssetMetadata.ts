import { withTransaction } from '../db/pool';
import { extractWithExiftool } from './exif';
import type { ExtractedMetadata } from './types';

function toTs(value: string | undefined): string | null {
  return value ? value : null;
}

function toTextArray(value: string[] | undefined): string[] | null {
  return value && value.length ? value : null;
}

export async function ingestAssetMetadata(assetId: number, localPath: string): Promise<void> {
  let md: ExtractedMetadata | null = null;
  try {
    md = await extractWithExiftool(localPath);
  } catch {
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
         sample_rate, channels, loudness_lufs
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
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
         loudness_lufs = EXCLUDED.loudness_lufs`,
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
}


