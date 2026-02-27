import { promises as fs } from 'fs';
import path from 'path';

// Используем require для нативных модулей — так избегаем проблем с ESM/tsx в Docker
function loadSharp(): typeof import('sharp') | null {
  try {
    return require('sharp');
  } catch {
    return null;
  }
}

function loadFfmpeg(): typeof import('fluent-ffmpeg') | null {
  try {
    return require('fluent-ffmpeg');
  } catch {
    return null;
  }
}

export interface ImageDimensions {
  width?: number;
  height?: number;
  hasTransparency?: boolean;
  bitDepth?: number;
  dpi?: number;
}

/**
 * Преобразует строковое значение глубины цвета sharp в количество бит на канал.
 * sharp возвращает значения вроде "uchar" (8 бит), "ushort" (16 бит), "float" (32 бита) и т.п.
 */
function sharpDepthToBits(depth: string | undefined): number | undefined {
  if (!depth) return undefined;
  const map: Record<string, number> = {
    uchar: 8,
    char: 8,
    ushort: 16,
    short: 16,
    uint: 32,
    int: 32,
    float: 32,
    double: 64,
    complex: 64,
    dpcomplex: 128,
  };
  // Если это уже строка с числом, просто парсим её
  const asNum = parseInt(depth, 10);
  if (!isNaN(asNum)) return asNum;
  return map[depth.toLowerCase()];
}

export interface VideoDimensions {
  width?: number;
  height?: number;
  durationSec?: number;
  fps?: number;
  videoCodec?: string;
  audioCodec?: string;
  bitrate?: number;
  frameCount?: number;
  audioChannelsLayout?: string;
}

/**
 * Извлекает размеры изображения с помощью sharp
 */
export async function extractImageDimensions(
  localPath: string,
  mimeType: string
): Promise<ImageDimensions | null> {
  // Обрабатываем только типы с image/*
  if (!mimeType.startsWith('image/')) {
    return null;
  }

  try {
    const sharp = loadSharp();
    if (!sharp) return null;
    const metadata = await sharp(localPath).metadata();

    const result: ImageDimensions = {
      width: metadata.width,
      height: metadata.height,
    };

    // Проверяем наличие прозрачности (альфа‑канал)
    if (metadata.hasAlpha !== undefined) {
      result.hasTransparency = metadata.hasAlpha;
    }

    // Глубина цвета — sharp возвращает строку вроде "uchar", конвертируем в количество бит
    if (metadata.depth) {
      result.bitDepth = sharpDepthToBits(metadata.depth as unknown as string);
    }

    // DPI/PPI
    if (metadata.density) {
      result.dpi = metadata.density;
    }

    return result;
  } catch (error) {
    console.error(`Failed to extract image dimensions with sharp for ${localPath}:`, error);
    return null;
  }
}

/**
 * Извлекает размеры видео и метаданные с помощью ffprobe
 */
export async function extractVideoDimensions(localPath: string): Promise<VideoDimensions | null> {
  const ffmpeg = loadFfmpeg();
  if (!ffmpeg) return null;
  return new Promise((resolve) => {
    ffmpeg.ffprobe(localPath, (err, metadata) => {
      if (err) {
        console.error(`Failed to extract video dimensions with ffprobe for ${localPath}:`, err);
        resolve(null);
        return;
      }

      const videoStream = metadata.streams?.find((s) => s.codec_type === 'video');
      const audioStream = metadata.streams?.find((s) => s.codec_type === 'audio');

      if (!videoStream) {
        resolve(null);
        return;
      }

      const result: VideoDimensions = {
        width: videoStream.width,
        height: videoStream.height,
        videoCodec: videoStream.codec_name,
        fps: videoStream.r_frame_rate
          ? parseFloat(videoStream.r_frame_rate.split('/')[0]) /
            parseFloat(videoStream.r_frame_rate.split('/')[1] || '1')
          : undefined,
      };

      if (audioStream) {
        result.audioCodec = audioStream.codec_name;
        result.audioChannelsLayout = audioStream.channel_layout || undefined;
      }

      // Длительность видео
      if (metadata.format?.duration != null) {
        result.durationSec = parseFloat(String(metadata.format.duration));
      }

      // Битрейт
      if (metadata.format?.bit_rate != null) {
        result.bitrate = parseInt(String(metadata.format.bit_rate), 10);
      }

      // Примерное количество кадров
      if (result.durationSec && result.fps) {
        result.frameCount = Math.round(result.durationSec * result.fps);
      }

      resolve(result);
    });
  });
}

/**
 * Получает размер файла из файловой системы
 */
export async function getFileSize(localPath: string): Promise<number | null> {
  try {
    const stats = await fs.stat(localPath);
    return stats.size;
  } catch (error) {
    console.error(`Failed to get file size for ${localPath}:`, error);
    return null;
  }
}

