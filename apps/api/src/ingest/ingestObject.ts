import { PoolClient } from 'pg';
import { withTransaction } from '../db/pool';
import { extractWithExiftool } from './exif';
import { ExtractedMetadata, IngestResult, SourceObject, AssetType } from './types';
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
    `INSERT INTO asset_media (asset_id, width, height, orientation, color_space, duration_sec, fps, video_codec, audio_codec, bitrate, aspect_ratio, sample_rate, channels, loudness_lufs)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [assetId, md.width ?? null, md.height ?? null, md.orientation ?? null, md.colorSpace ?? null, md.durationSec ?? null, md.fps ?? null, md.videoCodec ?? null, md.audioCodec ?? null, md.bitrate ?? null, md.aspectRatio ?? null, md.sampleRate ?? null, md.channels ?? null, md.loudnessLufs ?? null]
  );
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
    extractWithExiftool(src.localPath),
    computeSha256(src.localPath),
  ]);

  const type = inferAssetType(src.mimeType);

  const assetId = await withTransaction(async (client) => {
    const id = await upsertAsset(client, teamId, ownerId, type, md);
    await insertFile(client, id, src, sha256);
    await insertMedia(client, id, md);
    await insertSidecars(client, id, md);
    return id;
  });

  return { assetId };
}




