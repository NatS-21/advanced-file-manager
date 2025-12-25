import { FastifyInstance } from 'fastify';
import { pool } from '../db/pool';
import { buildWhere } from '../search/registry';
import type { SearchRequest, SearchResponse, SearchResultItem } from '@afm/shared/search/dsl';
import { requireAuth } from '../auth/requireAuth';

function buildSort(sort: SearchRequest['sort']): string {
  if (!sort || sort.length === 0) return 'ORDER BY a.created_at DESC, a.id DESC';
  const parts: string[] = [];
  for (const s of sort) {
    const dir = s?.dir === 'asc' ? 'ASC' : 'DESC';
    if (s.field === 'relevance') {
      parts.push(`relevance ${dir}`);
    } else {
      const col =
        s.field === 'createdAt' ? 'a.created_at' :
        s.field === 'updatedAt' ? 'a.updated_at' :
        s.field === 'capturedAt' ? 'a.captured_at' :
        s.field === 'rating' ? 'a.rating' :
        s.field === 'name' ? 'a.title' :
        s.field === 'title' ? 'a.title' :
        s.field === 'sizeBytes' ? 'af.size_bytes' :
        null;
      if (col) parts.push(`${col} ${dir}`);
    }
  }
  if (!parts.some(p => p.startsWith('a.created_at'))) parts.push('a.created_at DESC');
  parts.push('a.id DESC');
  return 'ORDER BY ' + parts.join(', ');
}

export async function registerSearchRoute(app: FastifyInstance) {
  app.post<{ Body: SearchRequest; Reply: SearchResponse }>('/api/search', { preHandler: requireAuth }, async (req, reply) => {
    const body = (req.body ?? {}) as SearchRequest;
    const { q, filters, sort, page = 1, perPage = 24, facets } = body;

    const { joins, where, params } = buildWhere(filters);

    // Always scope by team
    params.push(req.auth!.teamId);
    where.push(`a.team_id = $${params.length}`);
    where.push('a.deleted_at IS NULL');

    let qIdx: number | null = null;
    if (q && q.trim() !== '') {
      params.push(q.trim());
      qIdx = params.length;
      // Drive-like: allow prefix search by filename (no need to type extension)
      // Keep FTS for relevance, add prefix matching on title and title-without-extension.
      where.push(`(
        search_text @@ plainto_tsquery('simple', unaccent($${qIdx}))
        OR unaccent(COALESCE(a.title, '')) ILIKE unaccent($${qIdx}) || '%'
        OR unaccent(regexp_replace(COALESCE(a.title, ''), '\\\\.[^.]+$', '')) ILIKE unaccent($${qIdx}) || '%'
      )`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const fileJoin = `
      LEFT JOIN LATERAL (
        SELECT af2.id, af2.size_bytes, af2.mime_type, af2.original_name
        FROM asset_files af2
        WHERE af2.asset_id = a.id
        ORDER BY af2.id ASC
        LIMIT 1
      ) af ON TRUE
    `;
    const joinSet = new Map<string, string>();
    joinSet.set(fileJoin.trim(), fileJoin.trim());
    for (const j of joins) joinSet.set(j, j);
    const joinSql = [...joinSet.values()].join('\n');
    const offset = (Math.max(1, page) - 1) * Math.max(1, perPage);
    const orderSql = buildSort(sort);

    // relevance
    const relSql = qIdx ? `ts_rank_cd(search_text, plainto_tsquery('simple', unaccent($${qIdx})))` : '0';

    const baseSql = `
      FROM assets a
      ${joinSql}
      ${whereSql}
    `;

    const listSql = `
      SELECT
        a.id, a.type, a.title, a.description, a.folder_id,
        a.created_at, a.captured_at,
        af.id AS file_id, af.mime_type AS mime_type, af.size_bytes AS size_bytes,
        ${relSql} AS relevance
      ${baseSql}
      ${orderSql}
      OFFSET ${offset} LIMIT ${Math.max(1, perPage)}
    `;

    const countSql = `SELECT COUNT(*)::bigint AS total ${baseSql}`;

    const client = await pool.connect();
    try {
      const [listRes, countRes] = await Promise.all([
        client.query(listSql, params),
        client.query(countSql, params),
      ]);

      const items: SearchResultItem[] = listRes.rows.map((r: any) => ({
        id: Number(r.id),
        fileId: r.file_id != null ? Number(r.file_id) : null,
        folderId: r.folder_id != null ? Number(r.folder_id) : null,
        type: r.type,
        title: r.title,
        description: r.description,
        mimeType: r.mime_type ?? null,
        sizeBytes: r.size_bytes != null ? Number(r.size_bytes) : null,
        createdAt: r.created_at?.toISOString?.() ?? r.created_at,
        capturedAt: r.captured_at ? (r.captured_at?.toISOString?.() ?? r.captured_at) : null,
        relevance: r.relevance ? Number(r.relevance) : undefined,
      }));

      let facetsResp: SearchResponse['facets'] = undefined;
      if (facets && facets.length) {
        facetsResp = {};
        for (const f of facets) {
          const safeLimit = Math.min(100, Math.max(1, Number((f as any).limit ?? 20) || 20));
          if (f.field === 'tags') {
            const facetSql = `
              SELECT t.name AS value, COUNT(*)::bigint AS count
              FROM assets a
              ${joinSql}
              JOIN asset_tags at ON at.asset_id = a.id
              JOIN tags t ON t.id = at.tag_id
              ${whereSql}
              GROUP BY t.name
              ORDER BY count DESC
              LIMIT ${safeLimit}
            `;
            const fr = await client.query(facetSql, params);
            facetsResp['tags'] = fr.rows.map((x: any) => ({ value: String(x.value), count: Number(x.count) }));
          } else if (f.field === 'channel') {
            const joinSet2 = new Map(joinSet);
            const abJoin = 'LEFT JOIN asset_business ab ON ab.asset_id = a.id';
            joinSet2.set(abJoin, abJoin);
            const joinSql2 = [...joinSet2.values()].join('\n');
            const facetSql = `
              SELECT ab.channel AS value, COUNT(*)::bigint AS count
              FROM assets a
              ${joinSql2}
              ${whereSql}
              GROUP BY ab.channel
              ORDER BY count DESC
              LIMIT ${safeLimit}
            `;
            const fr = await client.query(facetSql, params);
            facetsResp['channel'] = fr.rows.filter((x: any) => x.value != null).map((x: any) => ({ value: String(x.value), count: Number(x.count) }));
          }
        }
      }

      const total = Number(countRes.rows[0]?.total ?? 0);
      const response: SearchResponse = {
        items,
        total,
        page: Math.max(1, page),
        perPage: Math.max(1, perPage),
        facets: facetsResp,
      };
      return reply.send(response);
    } finally {
      client.release();
    }
  });
}




