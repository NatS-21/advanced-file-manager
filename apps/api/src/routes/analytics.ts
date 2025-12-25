import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool';
import { requireAuth } from '../auth/requireAuth';

export async function registerAnalyticsRoutes(app: FastifyInstance) {
  app.get('/api/analytics/overview', { preHandler: requireAuth }, async (req, reply) => {
    const teamId = req.auth!.teamId;

    const totalsRes = await pool.query(
      `SELECT
         COUNT(*)::bigint AS files,
         COALESCE(SUM(af.size_bytes), 0)::bigint AS size_bytes
       FROM assets a
       LEFT JOIN asset_files af ON af.asset_id = a.id
       WHERE a.team_id = $1 AND a.deleted_at IS NULL`,
      [teamId]
    );

    const byTypeRes = await pool.query(
      `SELECT
         a.type,
         COUNT(*)::bigint AS count,
         COALESCE(SUM(af.size_bytes), 0)::bigint AS size_bytes
       FROM assets a
       LEFT JOIN asset_files af ON af.asset_id = a.id
       WHERE a.team_id = $1 AND a.deleted_at IS NULL
       GROUP BY a.type
       ORDER BY count DESC`,
      [teamId]
    );

    const topTagsRes = await pool.query(
      `SELECT t.name AS tag, COUNT(*)::bigint AS count
       FROM asset_tags at
       JOIN tags t ON t.id = at.tag_id
       JOIN assets a ON a.id = at.asset_id
       WHERE a.team_id = $1 AND a.deleted_at IS NULL
       GROUP BY t.name
       ORDER BY count DESC
       LIMIT 20`,
      [teamId]
    );

    const topViewedRes = await pool.query(
      `SELECT a.id, a.title, e.views, e.saves
       FROM engagement e
       JOIN assets a ON a.id = e.asset_id
       WHERE a.team_id = $1 AND a.deleted_at IS NULL
       ORDER BY e.views DESC NULLS LAST
       LIMIT 20`,
      [teamId]
    );

    return reply.send({
      totals: {
        files: Number(totalsRes.rows[0]?.files ?? 0),
        sizeBytes: Number(totalsRes.rows[0]?.size_bytes ?? 0),
      },
      byType: byTypeRes.rows.map((r: any) => ({
        type: r.type,
        count: Number(r.count),
        sizeBytes: Number(r.size_bytes),
      })),
      topTags: topTagsRes.rows.map((r: any) => ({ tag: String(r.tag), count: Number(r.count) })),
      topViewed: topViewedRes.rows.map((r: any) => ({
        id: Number(r.id),
        title: r.title ?? null,
        views: Number(r.views ?? 0),
        saves: Number(r.saves ?? 0),
      })),
    });
  });
}


