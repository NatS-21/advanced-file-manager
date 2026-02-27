import type { FastifyReply, FastifyRequest } from 'fastify';
import { pool } from '../db/pool';
import { checkPermission, isRoleAllowed, type UserRole } from '../utils/permissions';

/**
 * Get user role from database
 */
async function getUserRole(teamId: number, userId: number): Promise<UserRole | null> {
  const { rows } = await pool.query<{ role: UserRole }>(
    `SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2`,
    [teamId, userId]
  );

  if (rows.length === 0) {
    return null;
  }

  return rows[0].role;
}

/**
 * Middleware to require specific roles
 * Usage: app.get('/path', { preHandler: [requireAuth, requireRole(['admin', 'owner'])] }, ...)
 */
export function requireRole(allowedRoles: UserRole[] | ((role: UserRole) => boolean)) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.auth) {
      return reply.code(401).send({ error: 'Требуется авторизация' });
    }

    const { teamId, userId } = req.auth;
    const userRole = await getUserRole(teamId, userId);

    if (!userRole) {
      return reply.code(403).send({ error: 'Доступ запрещён: роль не найдена' });
    }

    // Check if role is allowed
    let isAllowed: boolean;
    if (typeof allowedRoles === 'function') {
      isAllowed = allowedRoles(userRole);
    } else {
      isAllowed = isRoleAllowed(userRole, allowedRoles);
    }

    if (!isAllowed) {
      return reply.code(403).send({ error: 'Доступ запрещён: недостаточно прав' });
    }

    // Store role in req.auth for later use
    if (!req.auth.role) {
      req.auth.role = userRole;
    }
  };
}

/**
 * Middleware to require specific permission
 * Usage: app.get('/path', { preHandler: [requireAuth, requirePermission('asset', 'delete')] }, ...)
 */
export function requirePermission(resource: string, action: string) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.auth) {
      return reply.code(401).send({ error: 'Требуется авторизация' });
    }

    const { teamId, userId } = req.auth;
    const userRole = await getUserRole(teamId, userId);

    if (!userRole) {
      return reply.code(403).send({ error: 'Доступ запрещён: роль не найдена' });
    }

    const hasPermission = await checkPermission(userRole, resource, action);

    if (!hasPermission) {
      return reply.code(403).send({ error: 'Доступ запрещён: недостаточно прав' });
    }

    // Store role in req.auth for later use
    if (!req.auth.role) {
      req.auth.role = userRole;
    }
  };
}

