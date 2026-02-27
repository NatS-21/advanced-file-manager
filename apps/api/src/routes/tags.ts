import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool';
import { requireAuth } from '../auth/requireAuth';
import { requireRole } from '../auth/requireRole';

export async function registerTagsRoutes(app: FastifyInstance) {
  app.get('/api/tags', { preHandler: [requireAuth, requireRole(['viewer', 'uploader', 'editor', 'moderator', 'admin', 'owner'])], }, async (req, reply) => {
    const teamId = req.auth!.teamId;
    const { rows } = await pool.query(
      `SELECT DISTINCT t.name
       FROM tags t
       WHERE t.team_id = $1
       ORDER BY t.name ASC`,
      [teamId]
    );
    return reply.send({ items: rows.map((r: any) => ({ name: String(r.name) })) });
  });
}

