import { spawn } from 'child_process';
import { ExtractedMetadata } from './types';
import { extractImageDimensions, extractVideoDimensions } from './dimensions';

function tryNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return Number(value);
  return undefined;
}

export async function extractWithExiftool(
  localPath: string,
  mimeType?: string
): Promise<ExtractedMetadata> {
  let md: ExtractedMetadata = {};

  try {
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

    if (code === 0) {
  const text = Buffer.concat(chunks).toString('utf8');
      if (text.trim()) {
  const parsed = JSON.parse(text) as Array<Record<string, any>>;
  const root = parsed[0] ?? {};

        md = {
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
          compression: root.Compression || root.CompressionType || undefined,
        };
      }
    } else {
      const msg = Buffer.concat(stderr).toString('utf8');
      console.warn(`exiftool failed for ${localPath}: ${msg}`);
    }
  } catch (error) {
    console.warn(`exiftool error for ${localPath}:`, error);
    // Продолжаем с резервными методами извлечения метаданных
  }

  // Всегда пробуем резервные методы, чтобы извлечь размеры и дополнительные метаданные
  if (mimeType) {
    if (mimeType.startsWith('image/')) {
      try {
        const imageDims = await extractImageDimensions(localPath, mimeType);
        if (imageDims) {
          md.width = md.width || imageDims.width;
          md.height = md.height || imageDims.height;
          md.hasTransparency = imageDims.hasTransparency ?? md.hasTransparency;
          md.bitDepth = imageDims.bitDepth ?? md.bitDepth;
          md.dpi = imageDims.dpi ?? md.dpi;
        }
      } catch (error) {
        console.warn(`Failed to extract image dimensions for ${localPath}:`, error);
      }
    } else if (mimeType.startsWith('video/')) {
      try {
        const videoDims = await extractVideoDimensions(localPath);
        if (videoDims) {
          md.width = md.width || videoDims.width;
          md.height = md.height || videoDims.height;
          md.durationSec = md.durationSec || videoDims.durationSec;
          md.fps = md.fps || videoDims.fps;
          md.videoCodec = md.videoCodec || videoDims.videoCodec;
          md.audioCodec = md.audioCodec || videoDims.audioCodec;
          md.bitrate = md.bitrate || videoDims.bitrate;
          md.frameCount = videoDims.frameCount ?? md.frameCount;
          md.audioChannelsLayout = videoDims.audioChannelsLayout ?? md.audioChannelsLayout;
        }
      } catch (error) {
        console.warn(`Failed to extract video dimensions for ${localPath}:`, error);
      }
    }
  }

  if (md.width && md.height && !md.orientation) {
    md.orientation = md.width > md.height ? 'landscape' : md.width < md.height ? 'portrait' : 'square';
  }

  return md;
}




