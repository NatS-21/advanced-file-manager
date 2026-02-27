import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthJwtPayload } from './types';
import { pool } from '../db/pool';
import type { UserRole } from '../utils/permissions';

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify<AuthJwtPayload>();
    const p = req.user as unknown as AuthJwtPayload;
    const userId = Number(p.uid);
    const teamId = Number(p.tid);
    
    // Get user role from database
    const { rows } = await pool.query<{ role: UserRole }>(
      `SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2`,
      [teamId, userId]
    );
    
    const role = rows.length > 0 ? rows[0].role : undefined;
    
    req.auth = {
      userId,
      teamId,
      email: String(p.email),
      role,
    };
  } catch {
    return reply.code(401).send({ error: 'Требуется авторизация' });
  }
}


