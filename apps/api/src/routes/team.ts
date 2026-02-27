import type { FastifyInstance } from 'fastify';
import { pool, withTransaction } from '../db/pool';
import { requireAuth } from '../auth/requireAuth';
import { requireRole } from '../auth/requireRole';
import type { UserRole } from '../utils/permissions';
import { logEventAsync } from '../utils/eventLogger';

export async function registerTeamRoutes(app: FastifyInstance) {
  // Invite team member
  app.post('/api/team/members', { preHandler: [requireAuth, requireRole(['admin', 'owner'])], }, async (req, reply) => {
    const teamId = req.auth!.teamId;
    const userId = req.auth!.userId;
    const body = (req.body ?? {}) as any;
    const email = String(body.email ?? '').trim().toLowerCase();
    const role = (body.role ?? 'viewer') as string;

    // Validation
    if (!email || !email.includes('@')) {
      return reply.code(400).send({ error: 'Некорректный email' });
    }

    const validRoles: UserRole[] = ['viewer', 'uploader', 'editor', 'moderator', 'admin', 'analyst'];
    if (!validRoles.includes(role as UserRole)) {
      return reply.code(400).send({ error: 'Некорректная роль' });
    }

    // Check if user is already in team
    const existingMember = await pool.query(
      `SELECT tm.user_id, u.email
       FROM team_members tm
       JOIN users u ON u.id = tm.user_id
       WHERE tm.team_id = $1 AND u.email = $2`,
      [teamId, email]
    );

    if (existingMember.rows[0]) {
      return reply.code(409).send({ error: 'Пользователь уже является участником команды' });
    }

    // Use transaction for atomicity
    const result = await withTransaction(async (client) => {
      // Check if user exists
      const userCheck = await client.query('SELECT id FROM users WHERE email = $1', [email]);
      let targetUserId: number;
      let isNewUser = false;

      if (userCheck.rows[0]) {
        // User exists
        targetUserId = Number(userCheck.rows[0].id);
      } else {
        // Create new user without password
        const userRes = await client.query<{ id: number }>(
          'INSERT INTO users (email, password_hash) VALUES ($1, NULL) RETURNING id',
          [email]
        );
        targetUserId = Number(userRes.rows[0].id);
        isNewUser = true;
      }

      // Add user to team
      await client.query(
        `INSERT INTO team_members (team_id, user_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (team_id, user_id) DO NOTHING`,
        [teamId, targetUserId, role]
      );

      return { userId: targetUserId, isNewUser };
    });

    // Log event
    logEventAsync({
      teamId,
      userId,
      eventType: 'team_member_added',
      metadata: {
        invitedUserId: result.userId,
        email,
        role,
        isNewUser: result.isNewUser,
      },
    });

    return reply.send({
      ok: true,
      member: {
        id: result.userId,
        email,
        role: role as UserRole,
        isNewUser: result.isNewUser,
      },
    });
  });

  // Get team members
  app.get('/api/team/members', { preHandler: [requireAuth, requireRole(['admin', 'owner'])], }, async (req, reply) => {
    const teamId = req.auth!.teamId;

    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.display_name, tm.role, u.created_at
       FROM team_members tm
       JOIN users u ON u.id = tm.user_id
       WHERE tm.team_id = $1
       ORDER BY u.created_at ASC`,
      [teamId]
    );

    return reply.send({
      items: rows.map((r: any) => ({
        id: Number(r.id),
        email: String(r.email),
        displayName: r.display_name ?? null,
        role: String(r.role) as UserRole,
        createdAt: r.created_at?.toISOString?.() ?? r.created_at,
      })),
    });
  });

  // Update team member role
  app.patch('/api/team/members/:userId', { preHandler: [requireAuth, requireRole(['admin', 'owner'])], }, async (req, reply) => {
    const teamId = req.auth!.teamId;
    const currentUserId = req.auth!.userId;
    const targetUserId = Number((req.params as any).userId);
    const body = (req.body ?? {}) as any;
    const newRole = body.role as string;

    if (!Number.isFinite(targetUserId) || targetUserId <= 0) {
      return reply.code(400).send({ error: 'Некорректный userId' });
    }

    const validRoles: UserRole[] = ['viewer', 'uploader', 'editor', 'moderator', 'admin', 'analyst', 'owner'];
    if (!validRoles.includes(newRole as UserRole)) {
      return reply.code(400).send({ error: 'Некорректная роль' });
    }

    // Check if target user exists in team
    const memberCheck = await pool.query(
      `SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2`,
      [teamId, targetUserId]
    );

    if (!memberCheck.rows[0]) {
      return reply.code(404).send({ error: 'Участник не найден' });
    }

    const currentRole = String(memberCheck.rows[0].role) as UserRole;

    // Validation: cannot change owner role
    if (currentRole === 'owner') {
      return reply.code(403).send({ error: 'Нельзя изменить роль владельца' });
    }

    // Validation: cannot demote yourself
    if (targetUserId === currentUserId) {
      const currentUserRole = req.auth!.role;
      if (currentUserRole === 'admin' && newRole !== 'admin' && newRole !== 'owner') {
        return reply.code(403).send({ error: 'Нельзя понизить свою роль' });
      }
    }

    // Update role
    const { rows } = await pool.query(
      `UPDATE team_members SET role = $3
       WHERE team_id = $1 AND user_id = $2
       RETURNING role`,
      [teamId, targetUserId, newRole]
    );

    return reply.send({
      id: targetUserId,
      role: String(rows[0].role) as UserRole,
    });
  });

  // Remove team member
  app.delete('/api/team/members/:userId', { preHandler: [requireAuth, requireRole(['admin', 'owner'])], }, async (req, reply) => {
    const teamId = req.auth!.teamId;
    const currentUserId = req.auth!.userId;
    const targetUserId = Number((req.params as any).userId);

    if (!Number.isFinite(targetUserId) || targetUserId <= 0) {
      return reply.code(400).send({ error: 'Некорректный userId' });
    }

    // Check if target user exists in team
    const memberCheck = await pool.query(
      `SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2`,
      [teamId, targetUserId]
    );

    if (!memberCheck.rows[0]) {
      return reply.code(404).send({ error: 'Участник не найден' });
    }

    const targetRole = String(memberCheck.rows[0].role) as UserRole;

    // Validation: cannot remove owner
    if (targetRole === 'owner') {
      return reply.code(403).send({ error: 'Нельзя удалить владельца' });
    }

    // Validation: cannot remove yourself
    if (targetUserId === currentUserId) {
      return reply.code(403).send({ error: 'Нельзя удалить себя' });
    }

    // Remove member
    const { rowCount } = await pool.query(
      `DELETE FROM team_members WHERE team_id = $1 AND user_id = $2`,
      [teamId, targetUserId]
    );

    if (!rowCount) {
      return reply.code(404).send({ error: 'Участник не найден' });
    }

    return reply.send({ ok: true });
  });
}

