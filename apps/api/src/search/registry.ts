import type { Filter, FilterGroup } from '@afm/shared/search/dsl';

type FieldMapping = {
  column: string;
  table?: string;
  join?: string;
  allowedOps: Set<string>;
};

export const fieldRegistry: Record<string, FieldMapping> = {
  id: { column: 'a.id', allowedOps: new Set(['eq','in','range']) },
  type: { column: 'a.type', allowedOps: new Set(['eq','in']) },
  title: { column: 'a.title', allowedOps: new Set(['eq','fuzzy','prefix']) },
  status: { column: 'a.status', allowedOps: new Set(['eq','in']) },
  createdAt: { column: 'a.created_at', allowedOps: new Set(['range']) },
  capturedAt: { column: 'a.captured_at', allowedOps: new Set(['range']) },
  rating: { column: 'a.rating', allowedOps: new Set(['range','eq']) },
  ownerId: { column: 'a.owner_id', allowedOps: new Set(['eq','in']) },
  teamId: { column: 'a.team_id', allowedOps: new Set(['eq']) },
  visibility: { column: 'a.visibility', allowedOps: new Set(['eq','in']) },
  folderId: { column: 'a.folder_id', allowedOps: new Set(['eq','in']) },

  campaignId: { column: 'ab.campaign_id', join: 'LEFT JOIN asset_business ab ON ab.asset_id = a.id', allowedOps: new Set(['eq','in']) },
  channel: { column: 'ab.channel', join: 'LEFT JOIN asset_business ab ON ab.asset_id = a.id', allowedOps: new Set(['eq','in']) },
  brand: { column: 'ab.brand', join: 'LEFT JOIN asset_business ab ON ab.asset_id = a.id', allowedOps: new Set(['eq','in','fuzzy','prefix']) },
  region: { column: 'ab.region', join: 'LEFT JOIN asset_business ab ON ab.asset_id = a.id', allowedOps: new Set(['eq','in']) },
  language: { column: 'COALESCE(a.language, ab.language)', join: 'LEFT JOIN asset_business ab ON ab.asset_id = a.id', allowedOps: new Set(['eq','in']) },

  width: { column: 'am.width', join: 'LEFT JOIN asset_media am ON am.asset_id = a.id', allowedOps: new Set(['range']) },
  height: { column: 'am.height', join: 'LEFT JOIN asset_media am ON am.asset_id = a.id', allowedOps: new Set(['range']) },
  orientation: { column: 'am.orientation', join: 'LEFT JOIN asset_media am ON am.asset_id = a.id', allowedOps: new Set(['eq','in']) },
  durationSec: { column: 'am.duration_sec', join: 'LEFT JOIN asset_media am ON am.asset_id = a.id', allowedOps: new Set(['range']) },
  fps: { column: 'am.fps', join: 'LEFT JOIN asset_media am ON am.asset_id = a.id', allowedOps: new Set(['range']) },
  videoCodec: { column: 'am.video_codec', join: 'LEFT JOIN asset_media am ON am.asset_id = a.id', allowedOps: new Set(['eq','in']) },
  audioCodec: { column: 'am.audio_codec', join: 'LEFT JOIN asset_media am ON am.asset_id = a.id', allowedOps: new Set(['eq','in']) },
  aspectRatio: { column: 'am.aspect_ratio', join: 'LEFT JOIN asset_media am ON am.asset_id = a.id', allowedOps: new Set(['eq','in']) },

  sizeBytes: { column: 'af.size_bytes', allowedOps: new Set(['range']) },
  mimeType: { column: 'af.mime_type', allowedOps: new Set(['eq','in','prefix']) },

  tags: { column: 'tags', allowedOps: new Set(['containsAny','containsAll']) },
  
  color: { column: 'ac.palette', join: 'LEFT JOIN asset_colors ac ON ac.asset_id = a.id', allowedOps: new Set(['similarTo']) },
};

export interface BuildResult {
  joins: string[];
  where: string[];
  params: unknown[];
}

export function buildWhere(filters: Filter[] | undefined): BuildResult {
  const joins = new Map<string, string>();
  const where: string[] = [];
  const params: unknown[] = [];

  function ensureJoin(join?: string) {
    if (join) joins.set(join, join);
  }

  function compileFilter(f: Filter): string {
    if ('logic' in (f as any)) {
      const g = f as FilterGroup;
      const parts = g.filters.map((x) => compileFilter(x)).filter(Boolean);
      const logic = g.logic === 'OR' ? 'OR' : 'AND';
      return parts.length ? `(${parts.join(` ${logic} `)})` : '';
    } else {
      const b = f as any as { field: string; op: string; value?: any };
      const cfg = fieldRegistry[b.field];
      if (!cfg || !cfg.allowedOps.has(b.op)) return '';
      ensureJoin(cfg.join);
      switch (b.op) {
        case 'eq':
          params.push(b.value);
          return `${cfg.column} = $${params.length}`;
        case 'in':
          if (!Array.isArray(b.value) || b.value.length === 0) return '';
          params.push(b.value);
          return `${cfg.column} = ANY($${params.length})`;
        case 'range': {
          const [from, to] = Array.isArray(b.value) ? b.value : [];
          const sub: string[] = [];
          if (from != null) { params.push(from); sub.push(`${cfg.column} >= $${params.length}`); }
          if (to != null) { params.push(to); sub.push(`${cfg.column} <= $${params.length}`); }
          return sub.length ? `(${sub.join(' AND ')})` : '';
        }
        case 'exists':
          return `${cfg.column} IS NOT NULL`;
        case 'prefix':
          params.push(String(b.value) + '%');
          return `${cfg.column} ILIKE $${params.length}`;
        case 'fuzzy':
          params.push(String(b.value));
          return `${cfg.column} % $${params.length}`;
        case 'containsAny': {
          const values: string[] = Array.isArray(b.value) ? b.value : [];
          if (values.length === 0) return '';
          params.push(values);
          return `EXISTS (
            SELECT 1 FROM asset_tags at
            JOIN tags t ON t.id = at.tag_id
            WHERE at.asset_id = a.id AND t.name = ANY($${params.length})
          )`;
        }
        case 'containsAll': {
          const values: string[] = Array.isArray(b.value) ? b.value : [];
          if (values.length === 0) return '';
          params.push(values);
          return `(
            SELECT COUNT(DISTINCT t.name)
            FROM asset_tags at
            JOIN tags t ON t.id = at.tag_id
            WHERE at.asset_id = a.id AND t.name = ANY($${params.length})
          ) = ${values.length}`;
        }
        case 'similarTo': {
          // Поиск по похожему цвету
          // Ожидаемый формат значения: { r: number, g: number, b: number, threshold?: number }
          const colorValue = b.value as { r?: number; g?: number; b?: number; threshold?: number };
          if (!colorValue || typeof colorValue.r !== 'number' || typeof colorValue.g !== 'number' || typeof colorValue.b !== 'number') {
            return '';
          }
          const threshold = colorValue.threshold ?? 60; // Порог по умолчанию: 60 единиц в RGB‑пространстве
          params.push(colorValue.r, colorValue.g, colorValue.b, threshold);
          const paramBase = params.length - 3;
          // Считаем расстояние между цветами (евклидово расстояние в RGB‑пространстве)
          // Сравниваем со всеми цветами из палитры
          return `EXISTS (
            SELECT 1 FROM asset_colors ac2
            WHERE ac2.asset_id = a.id
            AND (
              -- Check vibrant color
              (ac2.vibrant_rgb IS NOT NULL AND
               SQRT(
                 POW(CAST(SPLIT_PART(ac2.vibrant_rgb, ',', 1) AS INT) - $${paramBase}, 2) +
                 POW(CAST(SPLIT_PART(ac2.vibrant_rgb, ',', 2) AS INT) - $${paramBase + 1}, 2) +
                 POW(CAST(SPLIT_PART(ac2.vibrant_rgb, ',', 3) AS INT) - $${paramBase + 2}, 2)
               ) <= $${paramBase + 3})
              OR
              -- Check muted color
              (ac2.muted_rgb IS NOT NULL AND
               SQRT(
                 POW(CAST(SPLIT_PART(ac2.muted_rgb, ',', 1) AS INT) - $${paramBase}, 2) +
                 POW(CAST(SPLIT_PART(ac2.muted_rgb, ',', 2) AS INT) - $${paramBase + 1}, 2) +
                 POW(CAST(SPLIT_PART(ac2.muted_rgb, ',', 3) AS INT) - $${paramBase + 2}, 2)
               ) <= $${paramBase + 3})
              OR
              -- Check dark vibrant color
              (ac2.dark_vibrant_rgb IS NOT NULL AND
               SQRT(
                 POW(CAST(SPLIT_PART(ac2.dark_vibrant_rgb, ',', 1) AS INT) - $${paramBase}, 2) +
                 POW(CAST(SPLIT_PART(ac2.dark_vibrant_rgb, ',', 2) AS INT) - $${paramBase + 1}, 2) +
                 POW(CAST(SPLIT_PART(ac2.dark_vibrant_rgb, ',', 3) AS INT) - $${paramBase + 2}, 2)
               ) <= $${paramBase + 3})
              OR
              -- Check dark muted color
              (ac2.dark_muted_rgb IS NOT NULL AND
               SQRT(
                 POW(CAST(SPLIT_PART(ac2.dark_muted_rgb, ',', 1) AS INT) - $${paramBase}, 2) +
                 POW(CAST(SPLIT_PART(ac2.dark_muted_rgb, ',', 2) AS INT) - $${paramBase + 1}, 2) +
                 POW(CAST(SPLIT_PART(ac2.dark_muted_rgb, ',', 3) AS INT) - $${paramBase + 2}, 2)
               ) <= $${paramBase + 3})
              OR
              -- Check light vibrant color
              (ac2.light_vibrant_rgb IS NOT NULL AND
               SQRT(
                 POW(CAST(SPLIT_PART(ac2.light_vibrant_rgb, ',', 1) AS INT) - $${paramBase}, 2) +
                 POW(CAST(SPLIT_PART(ac2.light_vibrant_rgb, ',', 2) AS INT) - $${paramBase + 1}, 2) +
                 POW(CAST(SPLIT_PART(ac2.light_vibrant_rgb, ',', 3) AS INT) - $${paramBase + 2}, 2)
               ) <= $${paramBase + 3})
              OR
              -- Check light muted color
              (ac2.light_muted_rgb IS NOT NULL AND
               SQRT(
                 POW(CAST(SPLIT_PART(ac2.light_muted_rgb, ',', 1) AS INT) - $${paramBase}, 2) +
                 POW(CAST(SPLIT_PART(ac2.light_muted_rgb, ',', 2) AS INT) - $${paramBase + 1}, 2) +
                 POW(CAST(SPLIT_PART(ac2.light_muted_rgb, ',', 3) AS INT) - $${paramBase + 2}, 2)
               ) <= $${paramBase + 3})
              OR
              -- Check distinct_colors JSONB array
              (ac2.distinct_colors IS NOT NULL AND ac2.distinct_colors != '[]'::jsonb AND
               EXISTS (
                 SELECT 1 FROM jsonb_array_elements(ac2.distinct_colors) AS elem
                 WHERE SQRT(
                   POW((elem->>'r')::int - $${paramBase}, 2) +
                   POW((elem->>'g')::int - $${paramBase + 1}, 2) +
                   POW((elem->>'b')::int - $${paramBase + 2}, 2)
                 ) <= $${paramBase + 3}
               ))
            )
          )`;
        }
        default:
          return '';
      }
    }
  }

  for (const f of filters ?? []) {
    const expr = compileFilter(f);
    if (expr) where.push(expr);
  }

  return { joins: [...joins.values()], where, params };
}




