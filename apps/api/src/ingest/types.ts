export type AssetType = 'image' | 'video' | 'audio' | 'doc';

export interface SourceObject {
  storageProvider: string;
  bucket: string;
  objectKey: string;
  sizeBytes: number;
  mimeType: string;
  localPath?: string;
}

export interface ExtractedMetadata {
  exif?: Record<string, unknown>;
  iptc?: Record<string, unknown>;
  xmp?: Record<string, unknown>;
  width?: number;
  height?: number;
  orientation?: 'landscape' | 'portrait' | 'square';
  colorSpace?: string;
  durationSec?: number;
  fps?: number;
  videoCodec?: string;
  audioCodec?: string;
  bitrate?: number;
  aspectRatio?: string;
  sampleRate?: number;
  channels?: number;
  loudnessLufs?: number;
  capturedAt?: string;
  cameraMake?: string;
  cameraModel?: string;
  gpsLat?: number;
  gpsLng?: number;
  title?: string;
  description?: string;
  keywords?: string[];
  language?: string;
}

export interface IngestResult {
  assetId: number;
}




