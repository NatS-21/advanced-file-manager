import type { FastifyPluginAsync } from 'fastify';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import fp from 'fastify-plugin';
import type { AuthContext, AuthJwtPayload } from './types';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthJwtPayload;
    user: AuthJwtPayload;
  }
}

export const authPlugin: FastifyPluginAsync = fp(async (app) => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    app.log.warn('JWT_SECRET is not set; using insecure dev default. Set JWT_SECRET in .env for production.');
  }

  await app.register(cookie, {
    secret: process.env.COOKIE_SECRET,
  });

  await app.register(jwt, {
    secret: jwtSecret || 'dev-insecure-secret',
    cookie: {
      cookieName: 'afm_token',
      signed: false,
    },
  });
});


