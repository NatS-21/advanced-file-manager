import { spawn } from 'child_process';
import { ExtractedMetadata } from './types';

function tryNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return Number(value);
  return undefined;
}

export async function extractWithExiftool(localPath: string): Promise<ExtractedMetadata> {
  const args = ['-j', '-n', '-g1', '-struct', localPath];
  const exif = spawn('exiftool', args);

  const chunks: Buffer[] = [];
  const stderr: Buffer[] = [];
  exif.stdout.on('data', (c) => chunks.push(Buffer.from(c)));
  exif.stderr.on('data', (c) => stderr.push(Buffer.from(c)));

  const code: number = await new Promise((resolve, reject) => {
    exif.on('error', reject);
    exif.on('close', (c) => resolve(c ?? 0));
  });

  if (code !== 0) {
    const msg = Buffer.concat(stderr).toString('utf8');
    throw new Error(`exiftool failed: ${msg}`);
  }

  const text = Buffer.concat(chunks).toString('utf8');
  const parsed = JSON.parse(text) as Array<Record<string, any>>;
  const root = parsed[0] ?? {};

  const md: ExtractedMetadata = {
    exif: root.ExifIFD || root.EXIF || undefined,
    iptc: root.IPTC || undefined,
    xmp: root.XMP || undefined,
    width: tryNumber(root.ImageWidth ?? root.ExifImageWidth),
    height: tryNumber(root.ImageHeight ?? root.ExifImageHeight),
    colorSpace: root.ColorSpace || undefined,
    durationSec: tryNumber(root.Duration ?? root.MediaDuration),
    fps: tryNumber(root.VideoFrameRate ?? root.FrameRate),
    videoCodec: root.VideoCodec || undefined,
    audioCodec: root.AudioCodec || undefined,
    bitrate: tryNumber(root.AverageBitrate ?? root.Bitrate),
    aspectRatio: root.DisplayAspectRatio || undefined,
    sampleRate: tryNumber(root.AudioSampleRate),
    channels: tryNumber(root.AudioChannels),
    loudnessLufs: tryNumber(root.MedianLoudness ?? root.Loudness),
    capturedAt: root.DateTimeOriginal || root.CreateDate || undefined,
    cameraMake: root.Make || undefined,
    cameraModel: root.Model || undefined,
    gpsLat: tryNumber(root.GPSLatitude),
    gpsLng: tryNumber(root.GPSLongitude),
    title: root.Title || undefined,
    description: root.Description || root.ImageDescription || undefined,
    keywords: Array.isArray(root.Keywords) ? root.Keywords : undefined,
    language: root.Language || undefined,
  };

  if (md.width && md.height && !md.orientation) {
    md.orientation = md.width > md.height ? 'landscape' : md.width < md.height ? 'portrait' : 'square';
  }

  return md;
}




