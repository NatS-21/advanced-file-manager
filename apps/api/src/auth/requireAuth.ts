import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthJwtPayload } from './types';

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify<AuthJwtPayload>();
    const p = req.user as unknown as AuthJwtPayload;
    req.auth = { userId: Number(p.uid), teamId: Number(p.tid), email: String(p.email) };
  } catch {
    return reply.code(401).send({ error: 'Требуется авторизация' });
  }
}


