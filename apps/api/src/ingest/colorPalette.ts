import { promises as fs } from 'fs';
import path from 'path';

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

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface ColorPalette {
  vibrant?: RgbColor;
  muted?: RgbColor;
  darkVibrant?: RgbColor;
  darkMuted?: RgbColor;
  lightVibrant?: RgbColor;
  lightMuted?: RgbColor;
  /** 6 наиболее различимых цветов изображения (максимальная дистанция в LAB‑пространстве) */
  distinctColors?: RgbColor[];
}

interface QuantizedColor extends RgbColor {
  count: number;
}

/**
 * Преобразует sRGB (0–255) в цветовое пространство LAB
 */
function rgbToLab(r: number, g: number, b: number): { l: number; a: number; b: number } {
  let red = r / 255;
  let green = g / 255;
  let blue = b / 255;

  red = red > 0.04045 ? Math.pow((red + 0.055) / 1.055, 2.4) : red / 12.92;
  green = green > 0.04045 ? Math.pow((green + 0.055) / 1.055, 2.4) : green / 12.92;
  blue = blue > 0.04045 ? Math.pow((blue + 0.055) / 1.055, 2.4) : blue / 12.92;

  let x = (red * 0.4124 + green * 0.3576 + blue * 0.1805) / 0.95047;
  let y = (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 1.0;
  let z = (red * 0.0193 + green * 0.1192 + blue * 0.9505) / 1.08883;

  x = x > 0.008856 ? Math.pow(x, 1 / 3) : 7.787 * x + 16 / 116;
  y = y > 0.008856 ? Math.pow(y, 1 / 3) : 7.787 * y + 16 / 116;
  z = z > 0.008856 ? Math.pow(z, 1 / 3) : 7.787 * z + 16 / 116;

  return {
    l: 116 * y - 16,
    a: 500 * (x - y),
    b: 200 * (y - z),
  };
}

/**
 * Евклидово расстояние в LAB‑пространстве (ΔE)
 */
function labDistance(
  lab1: { l: number; a: number; b: number },
  lab2: { l: number; a: number; b: number }
): number {
  return Math.sqrt(
    Math.pow(lab1.l - lab2.l, 2) +
      Math.pow(lab1.a - lab2.a, 2) +
      Math.pow(lab1.b - lab2.b, 2)
  );
}

/**
 * Квантование цветов изображения алгоритмом median cut.
 * Возвращает до maxColors доминирующих цветов с количеством пикселей.
 */
async function quantizeColors(
  localPath: string,
  maxColors: number
): Promise<QuantizedColor[]> {
  const sharp = loadSharp();
  if (!sharp) return [];

  try {
    const { data, info } = await sharp(localPath)
      .raw()
      .ensureAlpha()
      .toBuffer({ resolveWithObject: true });

    const { width, height } = info;
    const pixels: [number, number, number][] = [];

    for (let i = 0; i < width * height * 4; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a < 128) continue;
      pixels.push([r, g, b]);
    }

    if (pixels.length === 0) return [];

    const buckets: [number, number, number][][] = [pixels];

    while (buckets.length < maxColors) {
      let maxRange = -1;
      let splitIdx = -1;
      let splitChannel = 0;

      for (let i = 0; i < buckets.length; i++) {
        const bucket = buckets[i];
        if (bucket.length < 2) continue;

        let minR = 255, maxR = 0, minG = 255, maxG = 0, minB = 255, maxB = 0;
        for (const [r, g, b] of bucket) {
          minR = Math.min(minR, r); maxR = Math.max(maxR, r);
          minG = Math.min(minG, g); maxG = Math.max(maxG, g);
          minB = Math.min(minB, b); maxB = Math.max(maxB, b);
        }
        const rangeR = maxR - minR;
        const rangeG = maxG - minG;
        const rangeB = maxB - minB;
        const maxChRange = Math.max(rangeR, rangeG, rangeB);
        if (maxChRange > maxRange) {
          maxRange = maxChRange;
          splitIdx = i;
          if (maxChRange === rangeR) splitChannel = 0;
          else if (maxChRange === rangeG) splitChannel = 1;
          else splitChannel = 2;
        }
      }

      if (splitIdx < 0 || maxRange <= 0) break;

      const bucket = buckets[splitIdx];
      bucket.sort((a, b) => a[splitChannel] - b[splitChannel]);
      const mid = Math.floor(bucket.length / 2);
      const left = bucket.slice(0, mid);
      const right = bucket.slice(mid);
      buckets.splice(splitIdx, 1, left, right);
    }

    return buckets
      .filter((b) => b.length > 0)
      .map((bucket) => {
        let r = 0, g = 0, b = 0;
        for (const [rr, gg, bb] of bucket) {
          r += rr; g += gg; b += bb;
        }
        const n = bucket.length;
        return {
          r: Math.round(r / n),
          g: Math.round(g / n),
          b: Math.round(b / n),
          count: n,
        };
      });
  } catch (error) {
    console.error(`Failed to quantize colors for ${localPath}:`, error);
    return [];
  }
}

/**
 * Выбирает до `count` цветов, которые максимально отличаются друг от друга в LAB‑пространстве.
 * Жадный алгоритм: берём самую далёкую пару, затем добавляем цвет с максимальной минимальной дистанцией до выбранных.
 */
function selectDistinctColors(
  colors: RgbColor[],
  count: number
): RgbColor[] {
  if (colors.length === 0 || count <= 0) return [];
  if (colors.length <= count) return [...colors];

  const labs = colors.map((c) => ({ rgb: c, lab: rgbToLab(c.r, c.g, c.b) }));

  let bestPair: [number, number] = [0, 1];
  let maxDist = 0;
  for (let i = 0; i < labs.length; i++) {
    for (let j = i + 1; j < labs.length; j++) {
      const d = labDistance(labs[i].lab, labs[j].lab);
      if (d > maxDist) {
        maxDist = d;
        bestPair = [i, j];
      }
    }
  }

  const selected: RgbColor[] = [
    labs[bestPair[0]].rgb,
    labs[bestPair[1]].rgb,
  ];
  const selectedLabs = [labs[bestPair[0]].lab, labs[bestPair[1]].lab];
  const used = new Set<number>([bestPair[0], bestPair[1]]);

  while (selected.length < count) {
    let bestIdx = -1;
    let bestMinDist = -1;

    for (let i = 0; i < labs.length; i++) {
      if (used.has(i)) continue;
      let minDist = Infinity;
      for (const sl of selectedLabs) {
        const d = labDistance(labs[i].lab, sl);
        minDist = Math.min(minDist, d);
      }
      if (minDist > bestMinDist) {
        bestMinDist = minDist;
        bestIdx = i;
      }
    }

    if (bestIdx < 0) break;
    selected.push(labs[bestIdx].rgb);
    selectedLabs.push(labs[bestIdx].lab);
    used.add(bestIdx);
  }

  return selected;
}

/**
 * Извлекает палитру из изображения: квантование, выбор 6 различимых цветов и сохранение «ярких» значений.
 */
export async function extractColorPalette(localPath: string): Promise<ColorPalette | null> {
  try {
    const quantized = await quantizeColors(localPath, 64);
    if (quantized.length === 0) return null;

    const distinct = selectDistinctColors(
      quantized.map((c) => ({ r: c.r, g: c.g, b: c.b })),
      6
    );

    return {
      distinctColors: distinct,
      vibrant: distinct[0],
      muted: distinct[1],
      darkVibrant: distinct[2],
      darkMuted: distinct[3],
      lightVibrant: distinct[4],
      lightMuted: distinct[5],
    };
  } catch (error) {
    console.error(`Failed to extract color palette from ${localPath}:`, error);
    return null;
  }
}

/**
 * Извлекает палитру из видео через выбор ключевого кадра
 */
export async function extractVideoColorPalette(localPath: string): Promise<ColorPalette | null> {
  const tempFramePath = path.join(path.dirname(localPath), `temp_frame_${Date.now()}.jpg`);

  try {
    const ffmpeg = loadFfmpeg();
    if (!ffmpeg) return null;

    const duration = await new Promise<number>((resolve, reject) => {
      ffmpeg.ffprobe(localPath, (err, metadata) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(parseFloat(String(metadata.format?.duration ?? '0')));
      });
    });

    const seekTime = Math.max(0, duration / 2);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(localPath)
        .seekInput(seekTime)
        .frames(1)
        .output(tempFramePath)
        .on('end', () => resolve())
        .on('error', reject)
        .run();
    });

    const palette = await extractColorPalette(tempFramePath);

    try {
      await fs.unlink(tempFramePath);
    } catch {
      // Игнорируем ошибки при удалении временного файла
    }

    return palette;
  } catch (error) {
    console.error(`Failed to extract color palette from video ${localPath}:`, error);
    try {
      await fs.unlink(tempFramePath).catch(() => {});
    } catch {
      // Игнорируем ошибку повторного удаления
    }
    return null;
  }
}

/**
 * Преобразует палитру к формату хранения в базе данных
 */
export function paletteToRgbStrings(palette: ColorPalette): {
  vibrant_rgb?: string;
  muted_rgb?: string;
  dark_vibrant_rgb?: string;
  dark_muted_rgb?: string;
  light_vibrant_rgb?: string;
  light_muted_rgb?: string;
  distinct_colors?: RgbColor[];
  palette?: ColorPalette;
} {
  const result: Record<string, unknown> = {};

  const toRgb = (c?: RgbColor) =>
    c ? `${c.r},${c.g},${c.b}` : undefined;

  result.vibrant_rgb = toRgb(palette.vibrant);
  result.muted_rgb = toRgb(palette.muted);
  result.dark_vibrant_rgb = toRgb(palette.darkVibrant);
  result.dark_muted_rgb = toRgb(palette.darkMuted);
  result.light_vibrant_rgb = toRgb(palette.lightVibrant);
  result.light_muted_rgb = toRgb(palette.lightMuted);
  result.distinct_colors = palette.distinctColors ?? undefined;
  result.palette = palette;

  return result as ReturnType<typeof paletteToRgbStrings>;
}
